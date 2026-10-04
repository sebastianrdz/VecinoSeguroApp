"""Realtime subscription: Postgres Changes on `public.gate_commands`,
event INSERT, filter `status=eq.pending` (CONTRACT.md "Realtime (Pi <->
Supabase)").

Client choice & why: the official `supabase` (supabase-py) client's
`Client.channel(...).on_postgres_changes(...).subscribe()` API, rather than
hand-rolling the underlying Phoenix-channel websocket protocol directly.
supabase-py already implements auth, heartbeats, and the wire protocol
Supabase Realtime speaks, and it's the officially supported client for this
stack (the `app/` package uses supabase-js under the same conventions).
Reimplementing that protocol by hand here would just be duplicated,
harder-to-trust surface area for the identical result — so we use the
client, and put our own reconnect policy on top of it (see below), since
supabase-py's built-in reconnection is not something we want to depend on
silently doing the right thing for a physical-security-relevant queue.

Reconnect-on-drop: `run_forever` wraps one subscription attempt
(`_run_once`) in an outer retry loop with exponential backoff between
`GATE_RECONNECT_BACKOFF_SECONDS` and `GATE_RECONNECT_BACKOFF_MAX_SECONDS`.
Any exception, or a channel status of CHANNEL_ERROR/TIMED_OUT/CLOSED, ends
the current attempt and is logged + retried. systemd (pi/systemd/, owned by
another workstream) restarts the whole process as a second line of defense
if this loop itself dies uncaught.

Version note: supabase-py's realtime surface has changed across major
versions. This module targets supabase-py 2.x's
`Client.channel(name).on_postgres_changes(event=, schema=, table=,
filter=, callback=).subscribe(callback=on_status)` shape. If upgrading the
pin in requirements.txt, re-verify this still matches (this could not be
exercised against a live Supabase project in this environment — see
README "Known limitations").
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Any, Mapping, Optional

from supabase import Client, create_client

from .config import Config
from .handler import CommandHandler
from .models import GateCommand

logger = logging.getLogger("gate_agent.realtime")

CHANNEL_NAME = "gate_commands_pending"
TABLE = "gate_commands"
SCHEMA = "public"
FILTER = "status=eq.pending"

_DROPPED_STATUSES = {"CHANNEL_ERROR", "TIMED_OUT", "CLOSED"}


def _on_insert(handler: CommandHandler, payload: Mapping[str, Any]) -> None:
    # supabase-py has carried the changed row under slightly different keys
    # across versions ("record" vs. nested under "data"); accept either,
    # falling back to the raw payload if it already looks like a row.
    record = payload.get("record")
    if record is None:
        data = payload.get("data")
        if isinstance(data, Mapping):
            record = data.get("record")
    if record is None:
        record = payload

    try:
        command = GateCommand.from_payload(record)
    except Exception:
        logger.error(
            "could not parse gate_commands payload",
            extra={"event": "payload_parse_error"},
            exc_info=True,
        )
        return
    handler.handle_command(command)


def _run_once(config: Config, handler: CommandHandler) -> None:
    client: Client = create_client(config.supabase_url, config.supabase_service_role_key)

    dropped = threading.Event()

    def on_status(status: Any, err: Optional[BaseException] = None) -> None:
        status_name = str(status).upper()
        logger.info(
            "realtime channel status",
            extra={"event": "channel_status", "status": status_name},
        )
        if status_name in _DROPPED_STATUSES:
            if err:
                logger.error(
                    "realtime channel dropped",
                    extra={"event": "channel_dropped", "status": status_name},
                    exc_info=err,
                )
            dropped.set()

    channel = client.channel(CHANNEL_NAME)
    channel.on_postgres_changes(
        event="INSERT",
        schema=SCHEMA,
        table=TABLE,
        filter=FILTER,
        callback=lambda payload: _on_insert(handler, payload),
    )
    channel.subscribe(on_status)

    logger.info(
        "subscribed to gate_commands INSERT (status=eq.pending)",
        extra={"event": "subscribed"},
    )

    # The client's own network I/O runs on its internal thread/event loop;
    # block this thread until the status callback reports a drop.
    dropped.wait()

    try:
        client.realtime.disconnect()
    except Exception:
        logger.warning("error disconnecting realtime client", exc_info=True)


def run_forever(
    config: Config,
    handler: CommandHandler,
    stop_event: Optional[threading.Event] = None,
) -> None:
    """Subscribe, and on any drop/exception, reconnect with exponential
    backoff until `stop_event` is set (or forever, if none is given)."""
    backoff = config.gate_reconnect_backoff_seconds

    while stop_event is None or not stop_event.is_set():
        try:
            _run_once(config, handler)
            backoff = config.gate_reconnect_backoff_seconds  # reset after a clean run
        except Exception:
            logger.error(
                "realtime connection error",
                extra={"event": "connection_error"},
                exc_info=True,
            )

        if stop_event is not None and stop_event.is_set():
            break

        logger.warning(
            "reconnecting",
            extra={"event": "reconnecting", "backoff_seconds": backoff},
        )
        time.sleep(backoff)
        backoff = min(backoff * 2, config.gate_reconnect_backoff_max_seconds)
