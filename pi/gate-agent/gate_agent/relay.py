"""Relay hardware abstraction.

Design: a small `Relay` Protocol with two implementations, selected by the
(additive, non-contractual) `GATE_AGENT_MODE` env var: `mock` | `gpio` |
`auto` (default `auto`).

  - MockRelay: in-memory, records every pulse it was asked to fire, zero
    hardware dependency. Used for local dev, CI, and the unit test suite.
  - GPIORelay: drives a real GPIO pin (BCM numbering, `GATE_GPIO_PIN`,
    contractual) via `RPi.GPIO`. The `import RPi.GPIO` happens lazily inside
    `GPIORelay.__init__`, never at module import time, so this module (and
    anything that imports it, including `handler.py` and the test suite)
    stays importable on a plain dev laptop or CI runner that doesn't have
    `RPi.GPIO` installed.

`auto` (the default): pick GPIORelay if `RPi.GPIO` is importable (i.e. we're
actually running on a Pi with the library installed), else fall back to
MockRelay and log loudly that we did so. This means the agent "just works"
in mock mode off-Pi with no env var required, while `GATE_AGENT_MODE=mock`
/ `=gpio` let an operator force one side explicitly — e.g. for the bench
test called out in docs/SETUP.md step 4: "Bench-test with the mock relay
first, then the real one."

The relay is opto-isolated and wired in parallel with the physical gate
remote's button (hardware detail owned elsewhere, e.g. pi/setup/HARDWARE.md
once written); from software's perspective a "pulse" is just: drive the pin
high for `duration_ms`, then drive it low again.
"""
from __future__ import annotations

import logging
import time
from typing import List, Optional, Protocol

logger = logging.getLogger("gate_agent.relay")


class Relay(Protocol):
    def pulse(self, duration_ms: int) -> None:
        """Energize the relay for duration_ms milliseconds, then release it.

        Must raise on failure (GPIO error, etc.) rather than swallow it —
        the caller (CommandHandler) relies on exceptions to detect failure
        and route the command to the 'failed' branch of the state machine.
        """
        ...


class MockRelay:
    """In-memory relay. No hardware dependency, safe on any machine.

    `raise_on_pulse`, if set, is raised (not returned) from every `pulse()`
    call — used by tests to exercise the failure path.
    """

    def __init__(self, raise_on_pulse: Optional[BaseException] = None) -> None:
        self.pulses: List[int] = []
        self._raise_on_pulse = raise_on_pulse

    def pulse(self, duration_ms: int) -> None:
        if self._raise_on_pulse is not None:
            raise self._raise_on_pulse
        logger.debug(
            "mock relay pulse",
            extra={"event": "mock_pulse", "duration_ms": duration_ms},
        )
        self.pulses.append(duration_ms)


class GPIORelay:
    """Drives a real relay via RPi.GPIO. Requires actual Raspberry Pi hardware
    (or at least the RPi.GPIO package + a compatible /dev/gpiomem)."""

    def __init__(self, pin: int) -> None:
        try:
            import RPi.GPIO as GPIO  # type: ignore  # lazy: only touched in gpio mode
        except ImportError as exc:  # pragma: no cover - exercised only off-Pi
            raise RuntimeError(
                "RPi.GPIO is not available; cannot use GATE_AGENT_MODE=gpio "
                "on this machine. Install RPi.GPIO on the Pi, or use "
                "GATE_AGENT_MODE=mock for local/dev runs."
            ) from exc

        self._GPIO = GPIO
        self._pin = pin
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(pin, GPIO.OUT, initial=GPIO.LOW)
        logger.info(
            "GPIO relay initialized",
            extra={"event": "gpio_init", "pin": pin},
        )

    def pulse(self, duration_ms: int) -> None:
        GPIO = self._GPIO
        GPIO.output(self._pin, GPIO.HIGH)
        try:
            time.sleep(duration_ms / 1000.0)
        finally:
            GPIO.output(self._pin, GPIO.LOW)

    def close(self) -> None:
        """Best-effort GPIO cleanup on shutdown."""
        try:
            self._GPIO.cleanup(self._pin)
        except Exception:  # pragma: no cover
            logger.warning("GPIO cleanup failed", exc_info=True)


def gpio_available() -> bool:
    """True if RPi.GPIO can be imported on this machine."""
    try:
        import RPi.GPIO  # noqa: F401  # lazy, availability probe only
        return True
    except ImportError:
        return False


def create_relay(mode: str, pin: int) -> Relay:
    """Factory used by main.py. mode is GATE_AGENT_MODE: mock|gpio|auto."""
    normalized = (mode or "auto").strip().lower()
    if normalized == "mock":
        return MockRelay()
    if normalized == "gpio":
        return GPIORelay(pin)
    if normalized == "auto":
        if gpio_available():
            return GPIORelay(pin)
        logger.warning(
            "RPi.GPIO not available; falling back to MockRelay "
            "(set GATE_AGENT_MODE=gpio to force real hardware and fail loudly instead)",
            extra={"event": "relay_autodetect_mock"},
        )
        return MockRelay()
    raise ValueError(f"unknown GATE_AGENT_MODE: {mode!r} (expected mock|gpio|auto)")
