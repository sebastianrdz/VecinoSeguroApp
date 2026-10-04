-- VecinoSeguro — Milestone A
-- Atomic RPC for open-gate: combines the rate-limit check, the
-- gate_commands insert, and the gate_events audit insert into a single
-- transaction, serialized per-user via an advisory lock.
--
-- Why this exists: the Edge Function could instead issue the rate-limit
-- SELECT and the two INSERTs as three separate supabase-js calls, but that
-- has two problems this function fixes:
--   1. Race condition: two concurrent requests from the same user could
--      both read "no recent command" before either has inserted one,
--      defeating the rate limit (classic check-then-act race).
--   2. Partial writes: if the gate_commands insert succeeds but the
--      gate_events insert then fails (network blip, etc.), you're left
--      with a command row and no matching audit event -- violating
--      "writes exactly one command + one audit row on success".
-- pg_advisory_xact_lock(hashtext(user_id)) serializes concurrent calls for
-- the same user for the duration of the transaction; combined with doing
-- everything inside one plpgsql function call (one implicit transaction),
-- both problems are eliminated. Different users never contend with each
-- other (lock key is per-user).
create or replace function public.accept_gate_command(
  p_user_id uuid,
  p_rate_limit_seconds int
)
returns table (
  command_id uuid,
  status public.gate_command_status,
  rate_limited boolean,
  retry_after_seconds int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_last_created_at timestamptz;
  v_elapsed_seconds numeric;
  v_command_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select gc.created_at
    into v_last_created_at
    from public.gate_commands gc
   where gc.requested_by = p_user_id
   order by gc.created_at desc
   limit 1;

  if v_last_created_at is not null then
    v_elapsed_seconds := extract(epoch from (clock_timestamp() - v_last_created_at));
    if v_elapsed_seconds < p_rate_limit_seconds then
      return query select
        null::uuid,
        null::public.gate_command_status,
        true,
        ceil(p_rate_limit_seconds - v_elapsed_seconds)::int;
      return;
    end if;
  end if;

  insert into public.gate_commands (requested_by, status)
  values (p_user_id, 'pending')
  returning id into v_command_id;

  -- Acceptance audit row. result='success' here means "the API accepted the
  -- request", not the physical gate outcome -- the Pi writes a second
  -- gate_events row (source='pi') with the real physical result later.
  insert into public.gate_events (actor_id, action, source, result, command_id, detail)
  values (p_user_id, 'open', 'app', 'success', v_command_id, 'accepted by open-gate edge function');

  return query select v_command_id, 'pending'::public.gate_command_status, false, null::int;
end;
$$;

comment on function public.accept_gate_command(uuid, int) is
  'Atomic rate-limit-check + gate_commands insert + gate_events audit insert for the open-gate Edge Function. service_role only.';

-- Callable only via the service-role key (the open-gate Edge Function).
-- Not exposed to authenticated/anon clients directly -- they must go
-- through the Edge Function, which enforces active-status + JWT identity.
revoke all on function public.accept_gate_command(uuid, int) from public;
revoke all on function public.accept_gate_command(uuid, int) from authenticated, anon;
grant execute on function public.accept_gate_command(uuid, int) to service_role;
