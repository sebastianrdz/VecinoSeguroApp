-- VecinoSeguro — Milestone A security fixes (Fix 1b)
-- Admin-triggered global sign-out by user_id.
--
-- Why not supabase-js's `auth.admin.signOut(jwt, scope)`: that method takes
-- the TARGET USER'S OWN access-token JWT as its argument (GoTrue resolves
-- the token to a user, then revokes refresh tokens per scope) -- it has no
-- "sign out by user_id" form. admin-manage-user only ever receives a
-- user_id in its request body, never that user's live access token, so
-- this method cannot be called from that context.
--
-- Instead we revoke the target user's refresh tokens directly at the
-- database layer -- the documented/community-standard workaround for
-- forcing logout by user_id from an admin/server context. This stops
-- refresh-token renewal immediately; per Supabase's own limitation, an
-- already-issued access token (JWT) remains cryptographically valid until
-- its natural ~1h expiry regardless of method (stateless JWTs can't be
-- revoked early) -- which is exactly why every Edge Function in this
-- project (open-gate, admin-manage-user, issue-video-token) re-checks
-- profiles.status live on every call: that live check, not token
-- revocation, is the actual fast revocation point for a blocked user.
--
-- Schema-version-defensive: modern GoTrue has both auth.sessions and a
-- session-scoped auth.refresh_tokens (FK session_id -> sessions.id ON
-- DELETE CASCADE); some older/self-hosted GoTrue versions only have
-- auth.refresh_tokens keyed directly by user_id with no sessions table.
-- We handle both: always delete matching auth.refresh_tokens rows by
-- user_id, and additionally delete auth.sessions rows (which cascades to
-- any remaining refresh_tokens) only if that table exists.
create or replace function public.force_sign_out_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  delete from auth.refresh_tokens where user_id = p_user_id::text;

  if to_regclass('auth.sessions') is not null then
    execute 'delete from auth.sessions where user_id = $1' using p_user_id;
  end if;
end;
$$;

comment on function public.force_sign_out_user(uuid) is
  'Revokes all refresh tokens / sessions for a user by id. Used by admin-manage-user on block/remove. service_role only.';

revoke all on function public.force_sign_out_user(uuid) from public;
revoke all on function public.force_sign_out_user(uuid) from authenticated, anon;
grant execute on function public.force_sign_out_user(uuid) to service_role;
