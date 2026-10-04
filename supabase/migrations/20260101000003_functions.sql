-- VecinoSeguro — Milestone A
-- Helper functions used across RLS policies.
--
-- RLS-recursion note: is_admin()/is_active() are called from policies ON
-- public.profiles itself (e.g. "admin can select all profiles"). If these
-- functions ran as the calling (RLS-restricted) role and re-queried
-- profiles, Postgres would re-evaluate profiles' RLS policies for that
-- inner query, which is either recursive or would just silently apply the
-- caller's own "select own row" policy (subtly wrong, not just slow).
--
-- Standard Supabase-safe pattern: declare them `security definer`, owned by
-- the migration-running role (postgres), which has BYPASSRLS. A
-- `security definer` function executes with the privileges/role of its
-- owner, so the inner `select ... from public.profiles` bypasses RLS
-- entirely instead of recursing into it. `set search_path = public, pg_temp`
-- pins name resolution so the function can't be hijacked by a
-- search_path change, and `stable` lets the planner cache the result
-- within a single statement.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status <> 'blocked'
  );
$$;

comment on function public.is_admin() is
  'True if the calling user (auth.uid()) has role=admin and status<>blocked. security definer to avoid recursive RLS on profiles.';

create or replace function public.is_active()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
  );
$$;

comment on function public.is_active() is
  'True if the calling user (auth.uid()) has status=active. security definer to avoid recursive RLS on profiles.';

-- Callers need EXECUTE; table-level access to profiles is still gated by RLS
-- inside the function's security-definer context, not by these grants.
revoke all on function public.is_admin() from public;
revoke all on function public.is_active() from public;
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_active() to authenticated, anon;
