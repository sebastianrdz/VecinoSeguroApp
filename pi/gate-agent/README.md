# gate-agent

Raspberry Pi "gate control" bridge for VecinoSeguro (Milestone C).

Subscribes to Supabase Realtime Postgres Changes on `public.gate_commands`
(`INSERT`, `status=eq.pending`). For each pending command: marks it `sent`,
pulses a relay wired in parallel with the physical gate remote's button,
then marks it `done`/`failed` and writes an audit row to `gate_events`. See
`CONTRACT.md` (repo root) for the authoritative schema/enum names — this
service does not invent its own field names.

## Layout

```
gate_agent/
  models.py        GateCommand dataclass (no deps)
  interfaces.py     GateCommandRepo Protocol (typing only, no deps)
  relay.py          Relay Protocol + MockRelay + GPIORelay (lazy RPi.GPIO import)
  handler.py        CommandHandler — the pending->sent->done|failed state machine
  repo.py           SupabaseGateCommandRepo (real, imports `supabase`)
  realtime.py       Subscription + reconnect-with-backoff loop (imports `supabase`)
  singleton.py      Single-instance file lock (fcntl.flock), no deps
  config.py         Env-var loading; fails fast only when Config.from_env() is called
  logging_setup.py  Structured JSON logging
  main.py           Wires it all together; entrypoint
  __main__.py       `python -m gate_agent`
tests/
  test_handler.py   Unit tests for the state machine (MockRelay + fake repo, no network/hardware)
  test_singleton.py Unit tests for the single-instance file lock (tempfile, no real /run needed)
```

## Run locally (mock mode, no hardware, no live Supabase project needed for tests)

```bash
cd pi/gate-agent
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest -v
```

The unit tests exercise `CommandHandler` directly with `MockRelay` and a
hand-rolled in-memory fake repo — they need neither network access nor a
real Supabase project, and (by construction — see "Architecture" below)
don't even require the `supabase` package to be importable, since
`handler.py` only depends on the `GateCommandRepo` Protocol.

To actually run the agent end-to-end locally against a real (or Supabase
local dev) project, in mock relay mode:

```bash
cp .env.example .env   # fill in SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
export $(grep -v '^#' .env | xargs)   # or use python-dotenv / direnv
export GATE_AGENT_MODE=mock
python -m gate_agent
```

You'll see structured JSON logs on stdout, and `MockRelay` will just record
pulses in-process (nothing physical happens).

## Run for real on the Pi

1. Wire the opto-isolated relay in parallel with the gate remote's button
   per `pi/setup/HARDWARE.md` (owned by another workstream) — **bench-test
   with the mock relay first, then the real one**, per `docs/SETUP.md` step 4.
2. `pip install -r requirements.txt` (add `RPi.GPIO` too, e.g.
   `pip install RPi.GPIO`; it's deliberately not in requirements.txt so this
   package stays installable off-Pi — see `relay.py`).
3. Copy `.env.example` to `.env` **on the Pi only** (never commit it) and
   fill in real values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
   `GATE_GPIO_PIN`, `GATE_PULSE_MS`. Two more additive, optional vars were
   added in this hardening pass (not yet reflected in `.env.example` — see
   note below): `GATE_AGENT_LOCK_FILE` and `GATE_AGENT_DEDUPE_MAX_SIZE`,
   documented in `gate_agent/config.py` and in "Architecture notes" /
   "Known limitations" below. Both have sane defaults and don't need to be
   set for a normal run.
4. Set `GATE_AGENT_MODE=gpio` (or leave `auto` — it will pick GPIO
   automatically once `RPi.GPIO` is installed).
5. Run via the systemd unit in `pi/systemd/` (owned by another workstream),
   which also restarts the process if it ever exits — a second line of
   defense on top of this module's own Realtime reconnect loop.

## Architecture notes

- **Relay selection** (`GATE_AGENT_MODE=mock|gpio|auto`, default `auto`):
  `auto` picks `GPIORelay` if `RPi.GPIO` is importable, else falls back to
  `MockRelay` and logs a warning. `RPi.GPIO` is imported lazily inside
  `GPIORelay.__init__` — never at module import time — so `relay.py` (and
  everything that imports it, including the test suite) stays importable on
  a plain dev machine with no GPIO libraries installed.
- **Realtime client**: the official `supabase` (supabase-py) client's
  `channel(...).on_postgres_changes(...).subscribe()`, rather than a
  hand-rolled websocket client — see the module docstring in
  `gate_agent/realtime.py` for the full rationale and the reconnect/backoff
  design.
- **The state machine is I/O-free**: `CommandHandler` (`handler.py`) depends
  only on the `Relay` and `GateCommandRepo` Protocols, not on any concrete
  GPIO or Supabase client — that's what makes `tests/test_handler.py` able
  to cover the whole pending->sent->done|failed flow, dedup, and debounce
  with plain Python objects.
- **Dedup / debounce**: `CommandHandler` keeps an in-memory set of command
  ids already handled (guards against duplicate Realtime deliveries, e.g.
  after a reconnect), bounded to at most `GATE_AGENT_DEDUPE_MAX_SIZE`
  entries (default 256) by evicting the oldest once the cap is exceeded —
  see "Known limitations" below — and serializes relay pulses so commands
  arriving within `GATE_MIN_INTERVAL_MS` of each other don't hammer the
  relay back-to-back.
- **Cross-process duplicate-pulse guard (physical-safety hardening)**: two
  layers, in order of authority:
  1. **DB-level conditional update (authoritative, correct across any
     number of hosts)**: `SupabaseGateCommandRepo.mark_sent` does
     `UPDATE gate_commands SET status='sent', picked_up_at=... WHERE
     id=$1 AND status='pending'` and reports back whether *this* call
     actually claimed the row. If two `gate-agent` processes both see the
     same pending row, only one wins that conditional update; the other
     gets `claimed=False` in `CommandHandler.handle_command` and returns
     without touching the relay, without calling `mark_completed`, and
     without writing a `gate_events` row (the winner owns that command's
     full lifecycle/audit trail). This is correct even if the two
     processes are on entirely different hosts, since Postgres — not any
     local state — arbitrates the race.
  2. **Single-instance file lock (defense-in-depth, host-local only)**:
     `gate_agent/singleton.py`'s `SingleInstanceLock` takes an exclusive,
     non-blocking `fcntl.flock` on `GATE_AGENT_LOCK_FILE` at startup,
     before the Realtime subscription starts. If another `gate-agent`
     process on the *same host* already holds it, the new process logs a
     fatal error and exits non-zero instead of starting a second
     subscriber. **This does NOT protect against two independent hosts**
     each with their own local filesystem pointed at the same Supabase
     project — only the DB-level check above does. Its purpose is to fail
     fast and loudly in the common single-host accidental-double-start
     case (e.g. a deploy overlap where the old systemd unit hasn't been
     reaped yet), rather than relying solely on the DB race to sort itself
     out silently at runtime.
- **Structured logging**: JSON lines via `logging_setup.py`, one object per
  line with `ts`, `level`, `logger`, `msg`, plus structured fields like
  `command_id`, `event`, `duration_ms` attached via `extra=`. Secrets (the
  service-role key, JWTs) are never logged.

## Known limitations / assumptions (CONTRACT.md was silent on these)

- **`detail` string format**: free-text, human-readable, e.g. `"relay pulse
  failed: <exception message>"` or `"failed to update status to 'sent':
  <exception message>"`. Not a structured/coded format — CONTRACT.md just
  says `detail text nullable`.
- **`actor_id` sourcing**: taken directly from the command row's
  `requested_by` (per the task description); `None` if the payload has no
  `requested_by`. `gate_events.actor_id` is nullable in CONTRACT.md so this
  is allowed.
- **Physical pulse succeeds but the subsequent DB write fails**: we do
  *not* write a `'failed'` gate_events row in this case (the gate did open —
  saying `failed` would be a false audit record). We only log an ERROR;
  the `gate_commands` row may be left in `'sent'` and no `gate_events` row
  exists for that particular open. This is a genuine gap CONTRACT.md doesn't
  address; a reasonable follow-up would be a periodic reconciliation job
  that retries writing a `'done'` event for any `sent` row whose relay pulse
  is known (from logs) to have succeeded, or simply alerting on it.
- **`_seen_ids` dedup set is bounded** to `GATE_AGENT_DEDUPE_MAX_SIZE`
  entries (default 256), evicting the oldest-inserted id once the cap is
  exceeded. Supabase Realtime doesn't replay history to a fresh
  subscription, so this dedupe only needs to cover a short window around
  delivery/reconnect overlap, not the whole process lifetime — a fixed
  small cap comfortably covers realistic redelivery bursts without
  growing unbounded for a long-lived process.
- **Single-instance file lock is host-local only** (see "Architecture
  notes" above) — it does not prevent two different hosts from both
  running an instance against the same Supabase project. The DB-level
  conditional `mark_sent` update is what actually prevents a duplicate
  relay pulse in that case.
- **supabase-py realtime API surface**: `realtime.py` targets supabase-py
  2.x's `channel().on_postgres_changes().subscribe()` shape. This could not
  be exercised against a live Supabase project in the environment this was
  built in (no live project / credentials available) — verify against a
  real project before relying on it, and re-check the shape if bumping the
  `supabase` pin in `requirements.txt`.
