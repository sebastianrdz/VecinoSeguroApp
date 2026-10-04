"""Single-instance guard: a file lock so two `gate-agent` processes can't
both run/subscribe concurrently on the same host.

IMPORTANT — scope and limitation (documented per hardening task): this file
lock is DEFENSE IN DEPTH ONLY for the common single-host
accidental-double-start case (e.g. a bad deploy overlap where the old
systemd unit hasn't been reaped yet before a new one starts, or someone
manually starting a second process on the same Pi). It only prevents two
processes from both holding a lock on the *same local file* — it does
nothing for two independent hosts (each with their own local filesystem)
pointed at the same Supabase project. The AUTHORITATIVE, always-correct
safety mechanism for the actual physical hazard ("two processes both pulse
the relay for the same command") is the conditional
`UPDATE ... WHERE status='pending'` in
`gate_agent.repo.SupabaseGateCommandRepo.mark_sent`, enforced by Postgres
and therefore correct regardless of how many hosts/processes are racing.
This lock exists purely to fail fast and loudly *before* even subscribing,
in the common case, rather than relying solely on the DB-level race to sort
itself out silently at runtime.

Uses `fcntl.flock(..., LOCK_EX | LOCK_NB)` on a configurable path
(`GATE_AGENT_LOCK_FILE`, additive env var — see config.py), which is
released automatically by the OS if the holding process dies/exits (no
stale-lock cleanup needed).
"""
from __future__ import annotations

import fcntl
import logging
import os
import tempfile
from pathlib import Path
from typing import IO, Optional

logger = logging.getLogger("gate_agent.singleton")

# Real-Pi default: a tmpfs-backed runtime directory that's recreated fresh
# on every boot (no stale-lock-across-reboots concern).
DEFAULT_LOCK_FILE = "/run/gate-agent/gate-agent.lock"


def resolve_lock_file_path(explicit: Optional[str], mode: str) -> str:
    """Resolve the effective lock file path.

    - If `explicit` (i.e. `GATE_AGENT_LOCK_FILE` was set) is given, use it
      verbatim — always wins.
    - Otherwise, default depends on `GATE_AGENT_MODE`: in `mock` mode (dev,
      README "Run locally" flow) default to a path under the system temp
      dir, since a dev laptop won't have (or want) `/run/gate-agent`
      writable. In `gpio`/`auto` mode (the real-Pi path), default to
      `/run/gate-agent/gate-agent.lock`.
    """
    if explicit:
        return explicit
    if (mode or "").strip().lower() == "mock":
        return str(Path(tempfile.gettempdir()) / "gate-agent" / "gate-agent.lock")
    return DEFAULT_LOCK_FILE


class SingleInstanceLock:
    """Exclusive, non-blocking advisory file lock via `fcntl.flock`.

    Small and isolated on purpose: `acquire()` returns `True`/`False`
    (never raises for "someone else holds it") so callers can log a clear
    fatal error and exit non-zero without a try/except around lock
    semantics; it only raises for genuine I/O errors (e.g. can't create the
    lock directory).
    """

    def __init__(self, path: str) -> None:
        self._path = path
        self._fh: Optional[IO[str]] = None

    def acquire(self) -> bool:
        """Try to take the lock. Returns True if acquired, False if another
        holder already has it. Idempotent-ish: calling again after a
        successful acquire just re-confirms (still holds) the same lock."""
        directory = os.path.dirname(self._path)
        if directory:
            os.makedirs(directory, exist_ok=True)

        fh = open(self._path, "w")
        try:
            fcntl.flock(fh.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fh.close()
            return False

        # Best-effort breadcrumb for operators inspecting the lock file by
        # hand; not read back by this code, so failure to write is harmless.
        try:
            fh.write(str(os.getpid()))
            fh.flush()
        except OSError:
            pass

        self._fh = fh
        return True

    def release(self) -> None:
        """Release the lock, if held. Safe to call multiple times."""
        if self._fh is None:
            return
        try:
            fcntl.flock(self._fh.fileno(), fcntl.LOCK_UN)
        except OSError:
            logger.warning("error releasing single-instance lock", exc_info=True)
        finally:
            self._fh.close()
            self._fh = None

    def __enter__(self) -> "SingleInstanceLock":
        if not self.acquire():
            raise RuntimeError(f"could not acquire lock at {self._path!r}")
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.release()
