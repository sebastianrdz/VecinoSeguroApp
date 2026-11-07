# VecinoSeguro — Supabase backend (Milestone A)

This directory is the complete, self-contained Supabase project definition for
VecinoSeguro: schema, RLS, Edge Functions, and seed data. It implements
`/Users/sebastian/Code/VecinoSeguroApp/CONTRACT.md` exactly — read that file
first if you're touching anything here.

## Layout

```
supabase/
├── config.toml                       # local `supabase start` config
├── migrations/                       # applied in filename (timestamp) order
│   ├── 20260101000000_extensions.sql
│   ├── 20260101000001_enums.sql
│   ├── 20260101000002_tables.sql
│   ├── 20260101000003_functions.sql  # is_admin(), is_active()
│   ├── 20260101000004_triggers.sql   # auto-create profile, protect role/status
│   ├── 20260101000005_rls_policies.sql
│   ├── 20260101000006_gate_rpc.sql   # atomic accept_gate_command() RPC
│   ├── 20260101000007_household_id_protection.sql  # lock household_id (Fix 4)
│   └── 20260101000008_force_sign_out_rpc.sql        # force_sign_out_user() RPC (Fix 1b)
├── seed.sql                          # placeholder-only local dev data
└── functions/
    ├── _shared/
    │   ├── cors.ts
    │   ├── auth.ts
    │   └── videoJwt.ts
    ├── open-gate/index.ts
    ├── admin-manage-user/index.ts
    └── issue-video-token/index.ts
```

No real secrets, IPs, emails, or credentials appear anywhere in this
directory — only clearly-fake placeholders (`*.placeholder@example.com`,
`555-0100`, synthetic fixed UUIDs).

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase` or see docs)
- Docker Desktop, running, with `docker` on your `PATH` (for local `supabase start`;
  if the CLI says `docker: command not found`, add `export PATH="$HOME/.docker/bin:$PATH"`
  to `~/.zshrc`)
- A Supabase project (for staging/prod deploys) — create one at
  [supabase.com/dashboard](https://supabase.com/dashboard) or via
  `supabase projects create`

## 1. Local development

From the repo root:

```bash
cd supabase
supabase start          # boots local Postgres/Auth/Realtime/Studio/Edge Runtime
supabase db reset        # applies migrations/*.sql then seed.sql, in order
```

`supabase db reset` runs every file in `migrations/` in filename order
(hence the timestamp prefixes — do not reorder or rename existing files;
add new ones with a later timestamp), then `seed.sql`.

Local URLs after `supabase start` (see its printed output for the actual
local keys):
- API: `http://127.0.0.1:54321`
- Studio: `http://127.0.0.1:54323`
- Mailpit (test email; config section is `[local_smtp]`): `http://127.0.0.1:54324`

### Local Edge Functions

```bash
supabase functions serve open-gate --env-file ./functions/.env.local
supabase functions serve admin-manage-user --env-file ./functions/.env.local
supabase functions serve issue-video-token --env-file ./functions/.env.local
```

Create `supabase/functions/.env.local` (untracked — add to `.gitignore` if not
already covered) with at least:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=<the "Secret" key (`sb_secret_...`) from `supabase start` output>
GATE_RATE_LIMIT_SECONDS=8
VIDEO_JWT_SECRET=<any random string locally, e.g. `openssl rand -base64 32`>
```

Newer CLIs print `sb_secret_...` in place of the old `service_role` JWT. If a
client rejects it, use `SERVICE_ROLE_KEY` (`eyJ...`) from
`supabase status -o env`.

`VIDEO_JWT_SECRET` is the shared HS256 secret `issue-video-token` signs
video tokens with (not `SUPABASE_`-prefixed: Supabase reserves that prefix, so
`supabase secrets set` rejects it). It must be the **identical value**
configured on the Pi/Caddy side (`pi/.env`'s `SUPABASE_JWT_SECRET`, per CONTRACT.md) — Caddy
validates the signature Supabase Edge Functions produce, so both sides need
the same secret. This is a cross-package deployment step, not something
either package can derive on its own; coordinate the value at deploy time
and never commit it.

Call it locally, e.g.:

```bash
curl -X POST http://127.0.0.1:54321/functions/v1/open-gate \
  -H "Authorization: Bearer <a real Supabase user JWT>" \
  -H "Content-Type: application/json" -d '{}'
```

## 2. Link to a real Supabase project

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

### Email templates (es-MX)

`templates/confirmation.html`, `invite.html` and `recovery.html` are the
Spanish auth emails. `config.toml` loads them for the **local** stack (see them
in Mailpit after `supabase start`). A hosted project keeps its own copy: in the
dashboard open **Authentication → Emails → Templates**, and for each template
paste the matching file's HTML and the subject from `config.toml`. Repeat for
every hosted project (dev and prod).

## 3. Apply migrations to the linked project

```bash
supabase db push --remote
```

(On CLI 3.x a bare `supabase db push` targets the local stack; `--remote`
targets the linked project. Add `--dry-run` first to preview.)

This applies every file in `migrations/` that hasn't already been recorded
as applied on the remote project, in order. Review the diff Supabase prints
before confirming — some of these are structural (enums, RLS) and, per the
brief, **destructive schema changes should be flagged to the user before
running**, but nothing in the current migration set is destructive (no
`DROP`s of existing data).

Seed data is for local dev only — do **not** run `seed.sql` against a real
project as-is; it inserts synthetic `auth.users` rows with non-functional
passwords. For a real environment, create your admin user via
`supabase auth admin` / the Studio dashboard, then use
`admin-manage-user` (`action: "approve"`, `action: "set_role"`) to promote
them, and insert real `households`/`cameras` rows via the dashboard or a
one-off script.

## 4. Set Edge Function secrets

These are the exact env var names from CONTRACT.md's `supabase/` section.
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-provided by the
Supabase platform for every deployed Edge Function — you normally do **not**
need to set them yourself for a linked project. `GATE_RATE_LIMIT_SECONDS` is
the one function-specific secret you should set explicitly:

```bash
supabase secrets set GATE_RATE_LIMIT_SECONDS=8

# shared with the Pi (pi/.env SUPABASE_JWT_SECRET) — copy the printed value there
SECRET=$(openssl rand -base64 32)
supabase secrets set VIDEO_JWT_SECRET="$SECRET"
echo "$SECRET"
```

(Only override `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` manually if
you're running functions against a project other than the linked one — e.g.
some local-against-remote testing setup. Never commit real values for
either.)

Verify what's set (values are not printed):

```bash
supabase secrets list
```

## 5. Deploy Edge Functions

```bash
supabase functions deploy open-gate
supabase functions deploy admin-manage-user
supabase functions deploy issue-video-token
```

Both functions require `Authorization: Bearer <supabase jwt>` per
CONTRACT.md. Neither trusts any client-supplied identity — the caller is
always derived from the verified JWT (`supabase/functions/_shared/auth.ts`).

## Schema summary

Enums: `user_role`, `user_status`, `gate_command_status`, `gate_result`,
`event_source` — exact values per CONTRACT.md.

Tables: `profiles` (1:1 with `auth.users`, auto-created on signup via the
`on_auth_user_created` trigger with `role='neighbor'`, `status='pending'`),
`households`, `cameras`, `gate_commands`, `gate_events` (immutable audit
log), `invites`.

Helper functions `is_admin()` / `is_active()` are `security definer` so RLS
policies on `profiles` can call them without recursing into `profiles`'
own RLS.

`gate_commands` / `gate_events` have **no INSERT policy for
authenticated/anon at all** — writes only happen via the service-role key
(the `open-gate` Edge Function, and the Pi gate-agent for status
transitions). `accept_gate_command()` (`20260101000006_gate_rpc.sql`) is the
single atomic entry point `open-gate` uses to rate-limit + insert both rows
in one transaction, and is itself only `GRANT EXECUTE`'d to `service_role`.

`household_id` on `profiles` is locked the same way `role`/`status` are: the
`protect_profile_role_status` trigger (extended in
`20260101000007_household_id_protection.sql`) silently reverts a
non-admin/non-service-role actor's attempt to change their own
`household_id`. Only an admin (via `admin-manage-user`'s `approve` or
`set_household` actions) or a service-role caller can set it.

`force_sign_out_user()` (`20260101000008_force_sign_out_rpc.sql`) revokes a
user's refresh tokens/sessions by `user_id` directly at the DB layer (see
its migration comment for why `supabase-js`'s `auth.admin.signOut()` can't
be used here — it requires the target's own access-token JWT, which
`admin-manage-user` never has). `GRANT EXECUTE` is `service_role`-only.

## Edge Functions summary

- **`open-gate`** — any `active` profile may call it. Verifies the JWT,
  checks `status='active'`, then calls `accept_gate_command()` which
  atomically rate-limits (`GATE_RATE_LIMIT_SECONDS`, default 8s per user)
  and inserts one `gate_commands` row + one `gate_events` audit row.
  Responses match CONTRACT.md exactly: `200 {ok:true,command_id,status}`,
  `429 {ok:false,error:"rate_limited",retry_after_seconds}`,
  `401 {ok:false,error:"unauthorized"}`, `403 {ok:false,error:"not_active"}`.

- **`admin-manage-user`** — caller must be an active admin. Supports
  `approve` / `set_role` / `set_household` / `block` / `unblock` / `remove` /
  `invite` per the request body shape (`set_household` is a coordinator-
  directed security-fix addition beyond CONTRACT.md's currently-documented
  action enum — see the in-code header comment; CONTRACT.md's owner should
  fold it in). `remove` is implemented as a soft remove
  (`status='blocked'`, `household_id=null`) rather than a hard delete,
  since `profiles.id` is referenced by the immutable `gate_events` audit
  log. `block` and `remove` also force a global sign-out
  (`force_sign_out_user()`) for the target user, best-effort (logged, not
  fatal to the request — see in-code comment on why). `block` / `remove` /
  `set_role(role:"neighbor")` are rejected with `409 {ok:false,
  error:"last_admin"}` if they would leave zero active admins.

- **`issue-video-token`** — any `active` profile may call it. Re-checks
  `profiles.status` fresh on every call (this IS the revocation point per
  CONTRACT.md's video security model) and mints a 60-second HS256 JWT
  (`{ sub, purpose: "video", iat, exp }`) signed with `VIDEO_JWT_SECRET`.
  Returns `200 { token, expires_at }` or `401/403 { ok:false, error:
  "unauthorized"|"not_active" }`. The app refreshes this token every ~45s
  while a stream is mounted and sends it (never the raw user JWT) to
  Caddy, which only accepts tokens with `purpose == "video"`.

## Known open item

`seed.sql` targets the current/modern `auth.users` shape that a real
`supabase start` (running live GoTrue migrations) produces. It has been
verified end-to-end (trigger → profile creation → role/status promotion →
RLS) against a real Supabase Postgres instance, but that verification used
an older cached `supabase/postgres` Docker image whose baked-in
`auth.users` predates a couple of column renames (e.g. `confirmed_at` vs.
`email_confirmed_at`). Run `supabase db reset` once against your actual
local stack before relying on `seed.sql` verbatim, and adjust the
`auth.users` column list in `seed.sql` if your CLI/GoTrue version ever
drifts further.
