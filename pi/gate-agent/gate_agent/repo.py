"""Concrete `GateCommandRepo`, backed by the `supabase` (supabase-py) client
using the service-role key (bypasses RLS per CONTRACT.md: "Pi (service role)
reads/updates" gate_commands, "insert only via service role" for
gate_events).

Deliberately kept out of `handler.py` / `interfaces.py` so the handler's
unit tests never need the `supabase` package importable — only `main.py`
and `realtime.py` import this module.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from supabase import Client

from .interfaces import EventSource, GateCommandStatus, GateResult

logger = logging.getLogger("gate_agent.repo")

GATE_COMMANDS_TABLE = "gate_commands"
GATE_EVENTS_TABLE = "gate_events"


class SupabaseGateCommandRepo:
    """Table/column/enum names below match CONTRACT.md exactly:

    gate_commands(id, requested_by, status, created_at, picked_up_at, completed_at)
    gate_events(id, actor_id, action, source, result, command_id, detail, created_at)
    """

    def __init__(self, client: Client) -> None:
        self._client = client

    def mark_sent(self, command_id: str, picked_up_at: datetime) -> bool:
        """Conditional UPDATE: only claims the row if it is still 'pending'
        at update time (`WHERE id=$1 AND status='pending'`).

        This is the authoritative fix for the "two gate-agent processes
        both pulse the relay for the same command" hazard (e.g. during a
        deploy overlap, or a stuck old process not yet reaped): Postgres
        guarantees only one concurrent UPDATE with this WHERE clause can
        actually match the row, no matter how many processes/hosts race to
        run it at the same instant. Unlike the file lock in
        `gate_agent.singleton`, this check is correct across any number of
        hosts, since it's enforced by the database, not by local process
        state.

        Returns True if this call's WHERE clause matched (i.e. the row was
        still 'pending' and this call is the one that moved it to 'sent'),
        False otherwise (already claimed elsewhere, or no such row).
        """
        response = (
            self._client.table(GATE_COMMANDS_TABLE)
            .update({"status": "sent", "picked_up_at": picked_up_at.isoformat()})
            .eq("id", command_id)
            .eq("status", "pending")
            .execute()
        )
        # postgrest-py returns the updated row(s) in `.data` by default
        # (return=representation); a conditional UPDATE whose WHERE clause
        # matched nothing (row already 'sent'/'done'/'failed', or doesn't
        # exist) comes back with an empty list rather than an error.
        return bool(response.data)

    def mark_completed(
        self,
        command_id: str,
        status: GateCommandStatus,
        completed_at: datetime,
    ) -> None:
        (
            self._client.table(GATE_COMMANDS_TABLE)
            .update({"status": status, "completed_at": completed_at.isoformat()})
            .eq("id", command_id)
            .execute()
        )

    def insert_gate_event(
        self,
        *,
        actor_id: Optional[str],
        action: str,
        source: EventSource,
        result: GateResult,
        command_id: Optional[str],
        detail: Optional[str],
    ) -> None:
        (
            self._client.table(GATE_EVENTS_TABLE)
            .insert(
                {
                    "actor_id": actor_id,
                    "action": action,
                    "source": source,
                    "result": result,
                    "command_id": command_id,
                    "detail": detail,
                }
            )
            .execute()
        )
