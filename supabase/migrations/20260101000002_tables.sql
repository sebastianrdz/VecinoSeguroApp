-- VecinoSeguro — Milestone A
-- Tables, in dependency-safe order: households before profiles (FK),
-- profiles before gate_commands/gate_events/invites (FK).
-- Column shapes match CONTRACT.md EXACTLY.

-- households -----------------------------------------------------------
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  unit_label  text not null,
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table public.households is 'A resident unit/lot in the fraccionamiento (e.g. "Casa 12").';

-- profiles (1:1 with auth.users) ----------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null default '',
  phone         text,
  household_id  uuid references public.households (id) on delete set null,
  role          public.user_role not null default 'neighbor',
  status        public.user_status not null default 'pending',
  created_at    timestamptz not null default now()
);

comment on table public.profiles is 'App-level profile for an auth.users row; id = auth.uid(). Row is auto-created by the on_auth_user_created trigger.';
comment on column public.profiles.full_name is 'Defaults to empty string when raw_user_meta_data.full_name is absent at signup (see handle_new_user()).';

-- cameras -----------------------------------------------------------------
create table public.cameras (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  stream_key  text not null unique,
  sort_order  int not null,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table public.cameras is 'stream_key matches the go2rtc stream name configured in pi/go2rtc.yaml.';

-- gate_commands (Pi consumes via Realtime) ---------------------------------
create table public.gate_commands (
  id            uuid primary key default gen_random_uuid(),
  requested_by  uuid not null references public.profiles (id),
  status        public.gate_command_status not null default 'pending',
  created_at    timestamptz not null default now(),
  picked_up_at  timestamptz,
  completed_at  timestamptz
);

comment on table public.gate_commands is 'Written only by the open-gate Edge Function (service role); read/updated by the Pi gate-agent via service role. No client insert/update policy exists.';

-- gate_events (immutable audit log) ----------------------------------------
create table public.gate_events (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles (id),
  action      text not null,
  source      public.event_source not null,
  result      public.gate_result not null,
  command_id  uuid references public.gate_commands (id),
  detail      text,
  created_at  timestamptz not null default now()
);

comment on table public.gate_events is 'Immutable audit log. actor_id is nullable for system-originated events. Insert-only via service role.';

-- invites -------------------------------------------------------------------
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  role         public.user_role not null default 'neighbor',
  invited_by   uuid not null references public.profiles (id),
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.invites is 'Admin-managed invitations. Admin-only access via RLS.';

-- Indexes --------------------------------------------------------------------
-- FK lookups
create index idx_profiles_household_id on public.profiles (household_id);
create index idx_gate_commands_requested_by on public.gate_commands (requested_by);
create index idx_gate_events_actor_id on public.gate_events (actor_id);
create index idx_gate_events_command_id on public.gate_events (command_id);
create index idx_invites_invited_by on public.invites (invited_by);

-- Pi's Realtime filter / poll: `status=eq.pending`
create index idx_gate_commands_status on public.gate_commands (status);

-- Admin lookups on invites by email
create index idx_invites_email on public.invites (email);

-- cameras.stream_key is already indexed via its UNIQUE constraint.
