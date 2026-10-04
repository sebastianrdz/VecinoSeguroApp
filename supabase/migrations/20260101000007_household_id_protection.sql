-- VecinoSeguro — Milestone A security fixes (Fix 4)
-- Extends the existing role/status self-protection trigger to also lock
-- household_id: a neighbor must not be able to reassign their own
-- household by editing their own profile row. Only an admin (checked via
-- is_admin()) or a service-role caller (the admin-manage-user Edge
-- Function, or the Pi/other privileged jobs) may change it.
--
-- This is a forward migration that replaces the FUNCTION BODY of
-- protect_profile_role_status() via CREATE OR REPLACE -- it does not edit
-- or rewrite 20260101000004_triggers.sql, which still owns the original
-- CREATE FUNCTION/CREATE TRIGGER statements. The trigger itself
-- (trg_protect_profile_role_status) is unchanged and does not need to be
-- re-created since CREATE OR REPLACE FUNCTION updates its behavior in
-- place for the already-attached trigger.
create or replace function public.protect_profile_role_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
    new.household_id := old.household_id;
  end if;

  return new;
end;
$$;

comment on function public.protect_profile_role_status() is
  'BEFORE UPDATE trigger on profiles: reverts role/status/household_id changes made by a non-admin, non-service-role actor to their prior values. Admin (is_admin()) and service_role writes pass through unchanged.';
