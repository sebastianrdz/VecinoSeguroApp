"""The persistence boundary `CommandHandler` depends on.

`GateCommandRepo` is a `typing.Protocol` — structural typing only, stdlib
`typing` as the sole dependency. This lets `handler.py` (and its test suite)
import this module freely without ever requiring the real `supabase`
package to be installed. The concrete, network-talking implementation lives
in `repo.py` and is only wired up by `main.py`.

Enum values below are copied verbatim from CONTRACT.md — treat that file as
authoritative if they ever need to change.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, Protocol

GateCommandStatus = Literal["pending", "sent", "done", "failed"]
GateResult = Literal["success", "failed"]
EventSource = Literal["app", "pi", "system"]


class GateCommandRepo(Protocol):
    """CRUD surface the handler needs against `gate_commands` / `gate_events`.

    Implemented for real by `gate_agent.repo.SupabaseGateCommandRepo`.
    Faked in `tests/test_handler.py` with a plain in-memory class — no
    inheritance required, Protocols are structural.
    """

    def mark_sent(self, command_id: str, picked_up_at: datetime) -> bool:
        """Conditional update: gate_commands SET status='sent',
        picked_up_at=<picked_up_at> WHERE id=command_id AND status='pending'.

        Returns whether *this call* claimed the row: `True` if the row was
        still `'pending'` at update time (so this call is the one that moved
        it to `'sent'`), `False` if it was no longer `'pending'` (already
        claimed by another gate-agent process/instance, or the row doesn't
        exist). This is the authoritative guard against two instances both
        pulsing the relay for the same command_id — see
        `gate_agent.repo.SupabaseGateCommandRepo.mark_sent` and
        `gate_agent.handler.CommandHandler.handle_command`.
        """
        ...

    def mark_completed(
        self,
        command_id: str,
        status: GateCommandStatus,
        completed_at: datetime,
    ) -> None:
        """gate_commands: status=<'done'|'failed'>, completed_at=<completed_at> WHERE id=command_id."""
        ...

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
        """INSERT INTO gate_events (actor_id, action, source, result, command_id, detail)."""
        ...
