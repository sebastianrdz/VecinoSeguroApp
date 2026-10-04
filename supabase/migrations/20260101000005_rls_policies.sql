-- VecinoSeguro — Milestone A
-- Enable RLS on every table and define policies exactly per CONTRACT.md.
--
-- Grants note: Supabase's local/hosted Postgres already grants schema USAGE
-- and table-level privileges on public to anon/authenticated by default;
-- RLS (not table-level GRANT/REVOKE) is the actual access gate here, per
-- CONTRACT.md intent. We do not add extra GRANTs beyond function EXECUTE
-- (already done in 20260101000003_functions.sql) since that would not
-- widen access for anon on sensitive tables past what RLS allows.

alter table public.profiles      enable row level security;
alter table public.households    enable row level security;
alter table public.cameras       enable row level security;
alter table public.gate_commands enable row level security;
alter table public.gate_events   enable row level security;
alter table public.invites       enable row level security;

-- profiles --------------------------------------------------------------
-- User reads/updates own row (role/status self-changes are neutralized by
-- trg_protect_profile_role_status, not by these policies). Admin reads/
-- writes all rows.
create policy profiles_select_own on public.profiles
  for select
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_select on public.profiles
  for select
  using (public.is_admin());

create policy profiles_admin_insert on public.profiles
  for insert
  with check (public.is_admin());

create policy profiles_admin_update on public.profiles
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_admin_delete on public.profiles
  for delete
  using (public.is_admin());

-- households --------------------------------------------------------------
-- Authenticated active users read; admin writes.
create policy households_select_active on public.households
  for select
  using (public.is_active());

create policy households_admin_insert on public.households
  for insert
  with check (public.is_admin());

create policy households_admin_update on public.households
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy households_admin_delete on public.households
  for delete
  using (public.is_admin());

-- cameras --------------------------------------------------------------
-- Authenticated active users read; admin writes.
create policy cameras_select_active on public.cameras
  for select
  using (public.is_active());

create policy cameras_admin_insert on public.cameras
  for insert
  with check (public.is_admin());

create policy cameras_admin_update on public.cameras
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy cameras_admin_delete on public.cameras
  for delete
  using (public.is_admin());

-- gate_commands --------------------------------------------------------------
-- NO insert policy at all: only the open-gate Edge Function, using the
-- service role key (which bypasses RLS entirely), may create rows.
-- NO update policy at all: only the Pi gate-agent, using the service role
-- key, may transition status/picked_up_at/completed_at. Admin can read but
-- must not be able to fake being the Pi.
create policy gate_commands_select_own on public.gate_commands
  for select
  using (requested_by = auth.uid());

create policy gate_commands_admin_select on public.gate_commands
  for select
  using (public.is_admin());

-- gate_events --------------------------------------------------------------
-- NO insert/update/delete policy at all: immutable audit log, written only
-- by service-role callers (open-gate Edge Function, Pi gate-agent).
create policy gate_events_select_own on public.gate_events
  for select
  using (actor_id = auth.uid());

create policy gate_events_admin_select on public.gate_events
  for select
  using (public.is_admin());

-- invites --------------------------------------------------------------
-- Admin only, for every operation. No policy grants non-admins any access.
create policy invites_admin_select on public.invites
  for select
  using (public.is_admin());

create policy invites_admin_insert on public.invites
  for insert
  with check (public.is_admin());

create policy invites_admin_update on public.invites
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy invites_admin_delete on public.invites
  for delete
  using (public.is_admin());
