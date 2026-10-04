"""VecinoSeguro Raspberry Pi gate-agent.

Bridges Supabase Realtime (`public.gate_commands` INSERT, status=eq.pending)
to a physical gate relay pulse, per CONTRACT.md's "Realtime (Pi <-> Supabase)"
section.

Submodules are intentionally decoupled so the CONTRACT-critical state
machine (`handler.py`) can be unit-tested with zero network and zero
hardware dependencies:

  - models.py      GateCommand dataclass (no deps)
  - interfaces.py  GateCommandRepo Protocol (typing only, no deps)
  - relay.py       Relay Protocol + MockRelay (no deps) + GPIORelay (lazy
                   `RPi.GPIO` import, only touched if actually selected)
  - handler.py     CommandHandler: pending -> sent -> done|failed state
                   machine. Depends only on the two Protocols above.
  - repo.py        SupabaseGateCommandRepo: the *real* GateCommandRepo,
                   imports `supabase` at module level. Not imported by
                   handler.py or by the test suite.
  - realtime.py    Realtime subscription + reconnect-with-backoff loop.
                   Imports `supabase`.
  - config.py      Env-var loading, fails fast only when `Config.from_env()`
                   is actually called (i.e. at real-run time, from main.py).
  - main.py        Wires everything together; entrypoint for
                   `python -m gate_agent`.

See README.md for how to run in mock mode locally vs. on the Pi.
"""

__version__ = "0.1.0"
