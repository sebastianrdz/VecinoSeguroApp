"""Configuration for gate-agent, loaded from environment variables.

Contractual names (CONTRACT.md `pi/` section — do not rename or repurpose):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    GATE_GPIO_PIN         (default 17)
    GATE_PULSE_MS         (default 500)

Additive names (this service's own concerns, not in CONTRACT.md):
    GATE_AGENT_MODE                    mock | gpio | auto (default auto)
    GATE_MIN_INTERVAL_MS               debounce window between relay pulses (default 2000)
    GATE_RECONNECT_BACKOFF_SECONDS     initial Realtime reconnect backoff (default 2)
    GATE_RECONNECT_BACKOFF_MAX_SECONDS cap on reconnect backoff (default 30)
    GATE_AGENT_LOG_LEVEL                (default INFO)
    GATE_AGENT_LOCK_FILE                single-instance file lock path (default
                                         /run/gate-agent/gate-agent.lock, or a
                                         path under the system temp dir in mock
                                         mode — see gate_agent/singleton.py)
    GATE_AGENT_DEDUPE_MAX_SIZE          max size of the in-memory dedupe set
                                         before oldest entries are evicted
                                         (default 256 — see handler.py)

`Config.from_env()` is the single place that fails fast on missing required
vars (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — and it is only ever called
from `main.py`'s real-run entrypoint, never at import time and never by the
unit test suite, which constructs `Config` directly with its own values.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping, Optional


class ConfigError(RuntimeError):
    """Raised when required configuration is missing at real-run time."""


@dataclass(frozen=True)
class Config:
    supabase_url: str
    supabase_service_role_key: str

    gate_gpio_pin: int = 17
    gate_pulse_ms: int = 500

    gate_agent_mode: str = "auto"
    gate_min_interval_ms: int = 2000
    gate_reconnect_backoff_seconds: float = 2.0
    gate_reconnect_backoff_max_seconds: float = 30.0
    gate_agent_log_level: str = "INFO"
    gate_agent_lock_file: Optional[str] = None
    gate_agent_dedupe_max_size: int = 256

    @classmethod
    def from_env(cls, env: Optional[Mapping[str, str]] = None) -> "Config":
        e = env if env is not None else os.environ

        supabase_url = e.get("SUPABASE_URL", "").strip()
        supabase_key = e.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()

        missing = [
            name
            for name, val in (
                ("SUPABASE_URL", supabase_url),
                ("SUPABASE_SERVICE_ROLE_KEY", supabase_key),
            )
            if not val
        ]
        if missing:
            # Never echo the values themselves (secret-safety), just the names.
            raise ConfigError(
                "Missing required environment variable(s): "
                + ", ".join(missing)
                + ". Copy pi/gate-agent/.env.example to .env and fill them in."
            )

        return cls(
            supabase_url=supabase_url,
            supabase_service_role_key=supabase_key,
            gate_gpio_pin=_int(e, "GATE_GPIO_PIN", 17),
            gate_pulse_ms=_int(e, "GATE_PULSE_MS", 500),
            gate_agent_mode=e.get("GATE_AGENT_MODE", "auto"),
            gate_min_interval_ms=_int(e, "GATE_MIN_INTERVAL_MS", 2000),
            gate_reconnect_backoff_seconds=_float(e, "GATE_RECONNECT_BACKOFF_SECONDS", 2.0),
            gate_reconnect_backoff_max_seconds=_float(e, "GATE_RECONNECT_BACKOFF_MAX_SECONDS", 30.0),
            gate_agent_log_level=e.get("GATE_AGENT_LOG_LEVEL", "INFO"),
            gate_agent_lock_file=(e.get("GATE_AGENT_LOCK_FILE", "").strip() or None),
            gate_agent_dedupe_max_size=_int(e, "GATE_AGENT_DEDUPE_MAX_SIZE", 256),
        )


def _int(e: Mapping[str, str], key: str, default: int) -> int:
    raw = e.get(key)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _float(e: Mapping[str, str], key: str, default: float) -> float:
    raw = e.get(key)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)
