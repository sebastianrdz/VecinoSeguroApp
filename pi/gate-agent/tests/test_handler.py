"""Unit tests for the command-handling state machine.

Runs with no network and no real `supabase` package: `handler.py` only
depends on `interfaces.GateCommandRepo` (a structural Protocol) and
`relay.Relay`/`MockRelay`, so `FakeRepo` below is a plain in-memory class
with no inheritance from anything supabase-related.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import pytest

from gate_agent.handler import CommandHandler
from gate_agent.models import GateCommand
from gate_agent.relay import MockRelay


@dataclass
class RecordedEvent:
    actor_id: Optional[str]
    action: str
    source: str
    result: str
    command_id: Optional[str]
    detail: Optional[str]


class FakeRepo:
    """In-memory stand-in for the `GateCommandRepo` Protocol. No network."""

    def __init__(self) -> None:
        self.commands: Dict[str, Dict[str, Any]] = {}
        self.events: List[RecordedEvent] = []
        self.mark_sent_calls: List[tuple] = []
        self.mark_completed_calls: List[tuple] = []

    def mark_sent(self, command_id, picked_up_at):
        """Simulates the conditional UPDATE ... WHERE status='pending':
        always claims the row (returns True) since this fake starts every
        command with no prior row / a fresh 'pending' state. Subclasses
        override this to simulate the "already claimed elsewhere" case."""
        self.mark_sent_calls.append((command_id, picked_up_at))
        row = self.commands.setdefault(command_id, {})
        row["status"] = "sent"
        row["picked_up_at"] = picked_up_at
        return True

    def mark_completed(self, command_id, status, completed_at):
        self.mark_completed_calls.append((command_id, status, completed_at))
        row = self.commands.setdefault(command_id, {})
        row["status"] = status
        row["completed_at"] = completed_at

    def insert_gate_event(self, *, actor_id, action, source, result, command_id, detail):
        self.events.append(
            RecordedEvent(actor_id, action, source, result, command_id, detail)
        )


def make_command(**overrides) -> GateCommand:
    defaults = dict(id="cmd-1", requested_by="user-1", status="pending")
    defaults.update(overrides)
    return GateCommand(**defaults)


def test_success_path_updates_status_and_inserts_success_event():
    relay = MockRelay()
    repo = FakeRepo()
    handler = CommandHandler(relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0)

    command = make_command(id="cmd-success", requested_by="user-123")
    handler.handle_command(command)

    # gate_commands transitioned pending -> sent -> done
    assert repo.mark_sent_calls[0][0] == "cmd-success"
    assert repo.commands["cmd-success"]["status"] == "done"
    assert "picked_up_at" in repo.commands["cmd-success"]
    assert "completed_at" in repo.commands["cmd-success"]

    # relay was pulsed for the configured duration
    assert relay.pulses == [500]

    # exactly one gate_events row, matching CONTRACT.md shape
    assert len(repo.events) == 1
    event = repo.events[0]
    assert event.command_id == "cmd-success"
    assert event.actor_id == "user-123"  # sourced from requested_by
    assert event.action == "open"
    assert event.source == "pi"
    assert event.result == "success"
    assert event.detail is None


def test_failure_path_relay_raises_marks_failed_and_inserts_failed_event():
    relay = MockRelay(raise_on_pulse=RuntimeError("relay hardware fault"))
    repo = FakeRepo()
    handler = CommandHandler(relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0)

    command = make_command(id="cmd-fail", requested_by="user-456")
    handler.handle_command(command)

    assert repo.commands["cmd-fail"]["status"] == "failed"
    assert "completed_at" in repo.commands["cmd-fail"]

    assert len(repo.events) == 1
    event = repo.events[0]
    assert event.command_id == "cmd-fail"
    assert event.actor_id == "user-456"
    assert event.action == "open"
    assert event.source == "pi"
    assert event.result == "failed"
    assert event.detail is not None
    assert "relay hardware fault" in event.detail


def test_db_error_marking_sent_is_treated_as_failure_without_touching_relay():
    class ExplodingRepo(FakeRepo):
        def mark_sent(self, command_id, picked_up_at):
            raise ConnectionError("db unreachable")

    relay = MockRelay()
    repo = ExplodingRepo()
    handler = CommandHandler(relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0)

    command = make_command(id="cmd-db-fail")
    handler.handle_command(command)

    assert relay.pulses == []  # never reached the relay
    assert len(repo.events) == 1
    assert repo.events[0].result == "failed"
    assert repo.commands["cmd-db-fail"]["status"] == "failed"


def test_duplicate_command_id_is_only_processed_once():
    relay = MockRelay()
    repo = FakeRepo()
    handler = CommandHandler(relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0)

    command = make_command(id="cmd-dup")
    handler.handle_command(command)
    handler.handle_command(command)  # simulate a duplicate Realtime delivery

    assert relay.pulses == [500]
    assert len(repo.events) == 1


def test_row_already_claimed_elsewhere_skips_pulse_and_lifecycle():
    """Simulates another gate-agent process/instance winning the conditional
    UPDATE (mark_sent returns False, i.e. 0 rows affected because the row
    was no longer 'pending' by the time this instance's UPDATE ran). This
    instance must not pulse the relay, must not mark the command
    done/failed, and must not insert a gate_events row for it — the
    instance that claimed it owns that command's full lifecycle/audit
    trail."""

    class AlreadyClaimedRepo(FakeRepo):
        def mark_sent(self, command_id, picked_up_at):
            self.mark_sent_calls.append((command_id, picked_up_at))
            return False  # another instance already claimed this row

    relay = MockRelay()
    repo = AlreadyClaimedRepo()
    handler = CommandHandler(relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0)

    command = make_command(id="cmd-claimed-elsewhere")
    handler.handle_command(command)

    assert repo.mark_sent_calls == [("cmd-claimed-elsewhere", repo.mark_sent_calls[0][1])]
    assert relay.pulses == []  # relay never touched
    assert repo.mark_completed_calls == []  # no mark_completed call at all
    assert repo.events == []  # no gate_events row written


def test_dedupe_set_bounded_evicts_oldest_beyond_max_size():
    """Bounded dedupe (GATE_AGENT_DEDUPE_MAX_SIZE): once more than
    `dedupe_max_size` distinct ids have been seen, the oldest is evicted, so
    a later redelivery of that now-evicted id is (correctly) reprocessed as
    if new — while an id still within the window continues to be deduped,
    same as the existing back-to-back duplicate test already covers."""
    relay = MockRelay()
    repo = FakeRepo()
    handler = CommandHandler(
        relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0, dedupe_max_size=2
    )

    handler.handle_command(make_command(id="cmd-1"))
    handler.handle_command(make_command(id="cmd-2"))
    handler.handle_command(make_command(id="cmd-3"))  # evicts cmd-1 from the dedupe set

    handler.handle_command(make_command(id="cmd-1"))  # evicted -> reprocessed as new

    assert relay.pulses == [500, 500, 500, 500]
    assert len(repo.events) == 4

    # cmd-3 is still within the (size-2) window -> still deduped
    handler.handle_command(make_command(id="cmd-3"))
    assert relay.pulses == [500, 500, 500, 500]
    assert len(repo.events) == 4


def test_non_pending_command_is_ignored():
    relay = MockRelay()
    repo = FakeRepo()
    handler = CommandHandler(relay=relay, repo=repo, pulse_ms=500, min_interval_ms=0)

    handler.handle_command(make_command(id="cmd-already-sent", status="sent"))

    assert relay.pulses == []
    assert repo.events == []


def test_min_interval_debounces_back_to_back_pulses():
    relay = MockRelay()
    repo = FakeRepo()

    fake_time = [0.0]
    sleeps: List[float] = []

    def fake_monotonic() -> float:
        return fake_time[0]

    def fake_sleep(seconds: float) -> None:
        sleeps.append(seconds)
        fake_time[0] += seconds

    handler = CommandHandler(
        relay=relay,
        repo=repo,
        pulse_ms=500,
        min_interval_ms=2000,
        monotonic_fn=fake_monotonic,
        sleep_fn=fake_sleep,
    )

    handler.handle_command(make_command(id="cmd-a"))
    fake_time[0] += 0.5  # only 500ms of "real" time passes before the next one
    handler.handle_command(make_command(id="cmd-b"))

    assert len(sleeps) == 1
    assert sleeps[0] == pytest.approx(1.5, abs=0.01)
    assert relay.pulses == [500, 500]
    assert len(repo.events) == 2
