"""Entrypoint: wires config -> relay -> supabase repo/client -> handler ->
realtime subscription, and runs until SIGTERM/SIGINT.

Run via `python -m gate_agent` (see `__main__.py`) or the console-script
`gate-agent` (see pyproject.toml).
"""
from __future__ import annotations

import logging
import signal
import threading

from .config import Config, ConfigError
from .handler import CommandHandler
from .logging_setup import setup_logging
from .relay import create_relay
from .singleton import SingleInstanceLock, resolve_lock_file_path

logger = logging.getLogger("gate_agent.main")


def main() -> int:
    # Bootstrap logging with a sane default before config is loaded, in case
    # config itself fails.
    setup_logging("INFO")

    try:
        config = Config.from_env()
    except ConfigError as exc:
        logger.error("configuration error: %s", exc)
        return 1

    setup_logging(config.gate_agent_log_level)

    # Single-instance guard: refuse to start a second gate-agent process on
    # this host before we do anything else (relay init, Supabase client,
    # Realtime subscription). This is defense-in-depth only for the
    # single-host accidental-double-start case (e.g. a deploy overlap) — the
    # conditional UPDATE in SupabaseGateCommandRepo.mark_sent is the
    # authoritative guard against a duplicate relay pulse and is correct
    # even across multiple hosts; see gate_agent/singleton.py docstring.
    lock_path = resolve_lock_file_path(config.gate_agent_lock_file, config.gate_agent_mode)
    lock = SingleInstanceLock(lock_path)
    if not lock.acquire():
        logger.error(
            "another gate-agent instance already holds the lock; refusing "
            "to start a second instance on this host",
            extra={"event": "lock_conflict", "lock_file": lock_path},
        )
        return 1
    logger.info(
        "single-instance lock acquired",
        extra={"event": "lock_acquired", "lock_file": lock_path},
    )

    relay = create_relay(config.gate_agent_mode, config.gate_gpio_pin)

    # Imported here (not at module top) so `import gate_agent.main` alone
    # never requires the `supabase` package — only actually running main()
    # does, which only happens on a real run, never during unit tests.
    from supabase import create_client

    from .realtime import run_forever
    from .repo import SupabaseGateCommandRepo

    client = create_client(config.supabase_url, config.supabase_service_role_key)
    repo = SupabaseGateCommandRepo(client)

    handler = CommandHandler(
        relay=relay,
        repo=repo,
        pulse_ms=config.gate_pulse_ms,
        min_interval_ms=config.gate_min_interval_ms,
        dedupe_max_size=config.gate_agent_dedupe_max_size,
    )

    stop_event = threading.Event()

    def _handle_signal(signum: int, _frame: object) -> None:
        logger.info(
            "received signal, shutting down",
            extra={"event": "shutdown_signal", "signum": signum},
        )
        stop_event.set()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    logger.info(
        "gate-agent starting",
        extra={
            "event": "startup",
            "gate_agent_mode": config.gate_agent_mode,
            "gate_gpio_pin": config.gate_gpio_pin,
            "gate_pulse_ms": config.gate_pulse_ms,
            "gate_min_interval_ms": config.gate_min_interval_ms,
        },
    )

    try:
        run_forever(config, handler, stop_event=stop_event)
    finally:
        # Best-effort: the OS releases the flock automatically on process
        # exit/crash regardless, but release explicitly for a clean shutdown.
        lock.release()

    logger.info("gate-agent stopped", extra={"event": "stopped"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
