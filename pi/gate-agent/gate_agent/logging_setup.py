"""Structured (JSON) logging.

Every log record is emitted as a single JSON line with a fixed envelope
(ts, level, logger, msg) plus whatever extra structured fields the call site
attached (e.g. command_id, event, duration_ms). Never pass secrets (the
service-role key, JWTs, etc.) via `extra=` or string-format them into `msg`.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

# Attribute names a stock LogRecord already carries; anything else found on
# a record's __dict__ is a caller-supplied structured field via `extra=`.
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__.keys()) | {
    "message",
    "asctime",
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED:
                payload[key] = value
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def setup_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
