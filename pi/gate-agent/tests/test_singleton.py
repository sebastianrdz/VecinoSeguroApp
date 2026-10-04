"""Unit tests for the single-instance file lock (`gate_agent.singleton`).

Uses `tmp_path` (pytest's built-in tempfile-backed fixture) — no real `/run`
needed, no network, no hardware. `fcntl.flock` locks are scoped to the open
file description, not the process, so two `SingleInstanceLock` instances
pointing at the same path *within this one test process* correctly
exercise the "second holder can't acquire" behavior without needing a real
second process.
"""
from __future__ import annotations

import tempfile

import pytest

from gate_agent.singleton import SingleInstanceLock, resolve_lock_file_path


def test_second_lock_on_same_path_fails_to_acquire(tmp_path):
    lock_path = str(tmp_path / "gate-agent.lock")

    lock1 = SingleInstanceLock(lock_path)
    assert lock1.acquire() is True

    lock2 = SingleInstanceLock(lock_path)
    assert lock2.acquire() is False  # already held by lock1

    lock1.release()

    # Once released, a new acquirer succeeds.
    lock3 = SingleInstanceLock(lock_path)
    assert lock3.acquire() is True
    lock3.release()


def test_lock_creates_parent_directory(tmp_path):
    lock_path = str(tmp_path / "nested" / "dir" / "gate-agent.lock")

    lock = SingleInstanceLock(lock_path)
    assert lock.acquire() is True
    lock.release()


def test_release_is_safe_to_call_when_not_held(tmp_path):
    lock = SingleInstanceLock(str(tmp_path / "gate-agent.lock"))
    lock.release()  # must not raise even though acquire() was never called


def test_context_manager_raises_on_conflict(tmp_path):
    lock_path = str(tmp_path / "gate-agent.lock")

    holder = SingleInstanceLock(lock_path)
    assert holder.acquire() is True
    try:
        with pytest.raises(RuntimeError):
            with SingleInstanceLock(lock_path):
                pass
    finally:
        holder.release()


def test_resolve_lock_file_path_prefers_explicit_env_var():
    assert resolve_lock_file_path("/custom/path.lock", "gpio") == "/custom/path.lock"
    assert resolve_lock_file_path("/custom/path.lock", "mock") == "/custom/path.lock"


def test_resolve_lock_file_path_defaults_to_temp_dir_in_mock_mode():
    path = resolve_lock_file_path(None, "mock")
    assert path.startswith(tempfile.gettempdir())
    assert path.endswith("gate-agent/gate-agent.lock")


def test_resolve_lock_file_path_defaults_to_run_dir_outside_mock_mode():
    assert resolve_lock_file_path(None, "gpio") == "/run/gate-agent/gate-agent.lock"
    assert resolve_lock_file_path(None, "auto") == "/run/gate-agent/gate-agent.lock"
