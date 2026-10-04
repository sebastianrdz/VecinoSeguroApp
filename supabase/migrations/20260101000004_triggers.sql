-- VecinoSeguro — Milestone A
-- Triggers: (1) auto-create a profile row on signup, (2) prevent
-- non-admins from self-granting role/status changes on their own profile.

-- 1) auth.users AFTER INSERT -> public.profiles -----------------------------
-- Standard Supabase pattern: security definer function owned by a role that
-- bypasses RLS (postgres), so the insert into public.profiles succeeds
-- regardless of RLS on that table. full_name is pulled from
-- raw_user_meta_data->>'full_name' when present, else '' (see profiles.full_name
-- default/comment in 20260101000002_tables.sql).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, role, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'neighbor',
    'pending'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 2) profiles BEFORE UPDATE -> protect role/status ---------------------------
-- A user may update their own row (full_name, phone, household_id) per the
-- profiles_update_own RLS policy, but must not be able to change their own
-- role or status (e.g. self-promote to admin, or self-approve). RLS alone
-- can't express "this column may change only if X"; the standard approach
-- is a BEFORE UPDATE trigger that silently reverts role/status to their
-- prior values unless the actor is an admin.
--
-- Service-role bypass: the admin-manage-user Edge Function updates role/
-- status using the service role key, which bypasses RLS but NOT triggers.
-- auth.uid() is null in that context (no end-user JWT), so is_admin() would
-- be false and this trigger would incorrectly revert the very changes the
-- Edge Function is making. We special-case auth.role() = 'service_role'
-- (the JWT role claim Supabase's PostgREST/service-role connections carry)
-- to let service-role writes through untouched.
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
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_role_status on public.profiles;

create trigger trg_protect_profile_role_status
before update on public.profiles
for each row execute function public.protect_profile_role_status();
