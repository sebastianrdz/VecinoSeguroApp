"""Plain data model for a `gate_commands` row.

No external dependencies — safe to import from anywhere, including tests
and the handler's core logic, without pulling in the `supabase` package.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional


@dataclass(frozen=True)
class GateCommand:
    """Mirrors CONTRACT.md `gate_commands`:
    id (uuid), requested_by (uuid), status, created_at, picked_up_at,
    completed_at.
    """

    id: str
    requested_by: Optional[str]
    status: str
    created_at: Optional[str] = None
    picked_up_at: Optional[str] = None
    completed_at: Optional[str] = None

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> "GateCommand":
        """Build a GateCommand from a Realtime postgres_changes row payload
        (or any dict/mapping with the same keys, e.g. in tests)."""
        return cls(
            id=payload["id"],
            requested_by=payload.get("requested_by"),
            status=payload.get("status", "pending"),
            created_at=payload.get("created_at"),
            picked_up_at=payload.get("picked_up_at"),
            completed_at=payload.get("completed_at"),
        )
