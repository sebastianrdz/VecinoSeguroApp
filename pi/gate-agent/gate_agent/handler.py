"""The CONTRACT-critical state machine, isolated from all I/O.

    pending --[mark_sent]--> sent --[relay.pulse]--> done   --[insert gate_events: result=success]
                                            \\
                                             +-> failed --[insert gate_events: result=failed, detail=...]

`CommandHandler` depends only on:
  - `relay.Relay` (Protocol) — so it never imports RPi.GPIO
  - `interfaces.GateCommandRepo` (Protocol) — so it never imports `supabase`

which is what makes it fully unit-testable with `MockRelay` + a hand-rolled
fake repo, no network and no hardware (see tests/test_handler.py).

Behavior on error, since CONTRACT.md just says "On failure (GPIO error, DB
error, etc.)":
  - DB error while marking 'sent' (before any relay activity): route
    straight to the 'failed' branch below (nothing physical happened).
  - Relay error: route to the 'failed' branch below.
  - DB error *after* a successful pulse (marking 'done' / inserting the
    success event): the gate already opened physically, so writing a
    'failed' event would be misleading. We do not attempt the 'failed'
    branch in that case; we just log loudly (level=ERROR) so an operator
    can reconcile the row/audit trail by hand. This is a deliberate
    assumption where the contract is silent — see README "Known
    limitations".

Dedup / debounce (also not specified by CONTRACT.md, added per task
requirements):
  - `_seen_ids`: a command id is only ever processed once by a given
    handler instance, guarding against duplicate Realtime deliveries (e.g.
    after a reconnect replays recent history). Bounded to at most
    `dedupe_max_size` entries (default 256, `GATE_AGENT_DEDUPE_MAX_SIZE`):
    Supabase Realtime never replays history to a *fresh* subscription, so
    this dedupe only needs to cover a short window around delivery/reconnect
    overlap, not the full process lifetime. Implemented as a `set` (for O(1)
    membership checks) plus a `deque` recording insertion order, evicting
    the oldest id once the cap is exceeded (simple LRU-by-insertion-order —
    chosen over a TTL-based window because it needs no wall-clock/monotonic
    plumbing to test deterministically: a TTL approach would require an
    injectable clock in tests to simulate time passing, same as `_debounce`
    already does, whereas a fixed-size cap can be exercised by simply
    inserting more than `dedupe_max_size` ids).
  - `_debounce`: if `min_interval_ms > 0`, serializes relay pulses so two
    commands arriving within that window don't hammer the relay back to
    back — the second pulse simply waits out the remainder of the window
    rather than firing immediately. Every command is still individually
    marked sent/done and gets its own gate_events row.

Cross-process duplicate-pulse guard (hardening pass, physical-safety
related): `mark_sent` on the repo is a *conditional* update
(`WHERE status='pending'`) that reports back whether *this* call actually
claimed the row (see `interfaces.GateCommandRepo.mark_sent` and
`repo.SupabaseGateCommandRepo.mark_sent`). If two `gate-agent` processes
both observe the same pending row (e.g. during a bad deploy overlap, or a
stuck old process not yet reaped) and both call `mark_sent`, only one can
win the conditional update; the other gets `claimed=False` and must not
touch the relay, not call `mark_completed`, and not write a `gate_events`
row for that command_id — the instance that won owns the full lifecycle
and audit trail for it. See `handle_command` below.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Callable, Deque, Optional, Set

from .interfaces import GateCommandRepo
from .models import GateCommand
from .relay import Relay

logger = logging.getLogger("gate_agent.handler")

ACTION_OPEN = "open"
SOURCE_PI = "pi"

DEFAULT_DEDUPE_MAX_SIZE = 256


class CommandHandler:
    def __init__(
        self,
        relay: Relay,
        repo: GateCommandRepo,
        pulse_ms: int = 500,
        min_interval_ms: int = 0,
        dedupe_max_size: int = DEFAULT_DEDUPE_MAX_SIZE,
        now_fn: Callable[[], datetime] = lambda: datetime.now(timezone.utc),
        monotonic_fn: Callable[[], float] = time.monotonic,
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> None:
        self._relay = relay
        self._repo = repo
        self._pulse_ms = pulse_ms
        self._min_interval_ms = min_interval_ms
        self._dedupe_max_size = dedupe_max_size
        self._now = now_fn
        self._monotonic = monotonic_fn
        self._sleep = sleep_fn

        self._seen_ids: Set[str] = set()
        self._seen_order: Deque[str] = deque()
        self._seen_lock = threading.Lock()
        self._pulse_lock = threading.Lock()
        self._last_pulse_monotonic: Optional[float] = None

    def handle_command(self, command: GateCommand) -> None:
        """Entry point: called once per INSERT payload received on the
        gate_commands channel (already filtered to status=eq.pending by the
        Realtime subscription itself, but we re-check defensively)."""
        if command.status != "pending":
            logger.debug(
                "ignoring non-pending command",
                extra={"command_id": command.id, "status": command.status},
            )
            return

        with self._seen_lock:
            if command.id in self._seen_ids:
                logger.info(
                    "duplicate command delivery ignored",
                    extra={"command_id": command.id, "event": "dedupe_skip"},
                )
                return
            self._seen_ids.add(command.id)
            self._seen_order.append(command.id)
            if len(self._seen_order) > self._dedupe_max_size:
                oldest = self._seen_order.popleft()
                self._seen_ids.discard(oldest)

        start = self._monotonic()
        logger.info(
            "command received",
            extra={"command_id": command.id, "event": "received"},
        )

        try:
            picked_up_at = self._now()
            claimed = self._repo.mark_sent(command.id, picked_up_at)
        except Exception as exc:
            logger.error(
                "failed to mark command sent",
                extra={"command_id": command.id, "event": "mark_sent_error"},
                exc_info=True,
            )
            self._fail(command, f"failed to update status to 'sent': {exc}")
            return

        if not claimed:
            # Another gate-agent process/instance already won the
            # conditional UPDATE (status was no longer 'pending' by the
            # time ours ran) and therefore owns the full lifecycle + audit
            # trail for this command_id. Do NOT pulse the relay (that's the
            # actual physical-safety hazard this guards against), do NOT
            # call mark_completed, and do NOT insert a gate_events row —
            # any of those would race with, or duplicate, what the instance
            # that claimed it is doing.
            logger.info(
                "command already claimed by another gate-agent instance; "
                "skipping (no relay pulse, no state change)",
                extra={"command_id": command.id, "event": "already_claimed"},
            )
            return

        logger.info(
            "command marked sent",
            extra={"command_id": command.id, "event": "sent"},
        )

        self._debounce()

        try:
            self._relay.pulse(self._pulse_ms)
        except Exception as exc:
            logger.error(
                "relay pulse failed",
                extra={"command_id": command.id, "event": "pulse_error"},
                exc_info=True,
            )
            self._fail(command, f"relay pulse failed: {exc}")
            return

        elapsed_ms = (self._monotonic() - start) * 1000
        logger.info(
            "relay pulsed",
            extra={
                "command_id": command.id,
                "event": "pulsed",
                "duration_ms": self._pulse_ms,
            },
        )

        try:
            completed_at = self._now()
            self._repo.mark_completed(command.id, "done", completed_at)
            self._repo.insert_gate_event(
                actor_id=command.requested_by,
                action=ACTION_OPEN,
                source=SOURCE_PI,
                result="success",
                command_id=command.id,
                detail=None,
            )
        except Exception:
            # The gate physically opened; a 'failed' event here would be
            # misleading. Surface loudly instead — see module docstring.
            logger.error(
                "physical pulse succeeded but DB update failed; command row "
                "may be stuck in 'sent' and no gate_events row was written "
                "for this open",
                extra={"command_id": command.id, "event": "post_pulse_db_error"},
                exc_info=True,
            )
            return

        logger.info(
            "command completed",
            extra={
                "command_id": command.id,
                "event": "done",
                "total_ms": round(elapsed_ms, 1),
            },
        )

    def _debounce(self) -> None:
        """Serialize relay pulses so bursts of pending commands can't fire
        the relay back-to-back faster than GATE_MIN_INTERVAL_MS apart."""
        if self._min_interval_ms <= 0:
            return
        with self._pulse_lock:
            now_m = self._monotonic()
            if self._last_pulse_monotonic is not None:
                elapsed_ms = (now_m - self._last_pulse_monotonic) * 1000
                wait_ms = self._min_interval_ms - elapsed_ms
                if wait_ms > 0:
                    logger.info(
                        "debouncing relay pulse",
                        extra={"event": "debounce_wait", "wait_ms": round(wait_ms, 1)},
                    )
                    self._sleep(wait_ms / 1000.0)
            self._last_pulse_monotonic = self._monotonic()

    def _fail(self, command: GateCommand, detail: str) -> None:
        completed_at = self._now()
        try:
            self._repo.mark_completed(command.id, "failed", completed_at)
        except Exception:
            logger.error(
                "failed to mark command failed after error",
                extra={"command_id": command.id, "event": "mark_failed_error"},
                exc_info=True,
            )
        try:
            self._repo.insert_gate_event(
                actor_id=command.requested_by,
                action=ACTION_OPEN,
                source=SOURCE_PI,
                result="failed",
                command_id=command.id,
                detail=detail,
            )
        except Exception:
            logger.error(
                "failed to insert failure gate_event",
                extra={"command_id": command.id, "event": "insert_event_error"},
                exc_info=True,
            )
        logger.warning(
            "command failed",
            extra={"command_id": command.id, "event": "failed", "detail": detail},
        )
