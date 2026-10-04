/**
 * POST /functions/v1/open-gate
 *
 * Any *active* profile (neighbor or admin) may request the gate be opened.
 * v1 has no role restriction on this endpoint (see CONTRACT.md).
 *
 * Flow:
 *   1. Verify the caller's JWT and load their profile.
 *   2. Reject if not active.
 *   3. Call the `accept_gate_command` Postgres RPC (service role), which
 *      atomically: rate-limits (max 1 accepted command per
 *      GATE_RATE_LIMIT_SECONDS per user), inserts one gate_commands row
 *      (status='pending'), and inserts one gate_events audit row -- all in
 *      a single transaction serialized per-user via an advisory lock. This
 *      avoids both a check-then-act race between concurrent requests and
 *      the risk of a partial write (command inserted, audit row lost) that
 *      two separate client-side inserts would be exposed to.
 */
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { authenticate, requireActive, AuthError } from "../_shared/auth.ts";

const DEFAULT_RATE_LIMIT_SECONDS = 8;

function getRateLimitSeconds(): number {
  const raw = Deno.env.get("GATE_RATE_LIMIT_SECONDS");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_SECONDS;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const { userId, profile, serviceClient } = await authenticate(req);
    requireActive(profile);

    const rateLimitSeconds = getRateLimitSeconds();

    // Atomic rate-limit-check + gate_commands insert + gate_events insert.
    // See supabase/migrations/20260101000006_gate_rpc.sql for why this is a
    // single RPC rather than separate SELECT/INSERT/INSERT calls.
    const { data: rows, error: rpcError } = await serviceClient.rpc(
      "accept_gate_command",
      { p_user_id: userId, p_rate_limit_seconds: rateLimitSeconds },
    );

    if (rpcError) {
      console.error("open-gate: accept_gate_command RPC failed", rpcError);
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }

    const result = Array.isArray(rows) ? rows[0] : rows;
    if (!result) {
      console.error("open-gate: accept_gate_command returned no row");
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }

    if (result.rate_limited) {
      return jsonResponse(
        { ok: false, error: "rate_limited", retry_after_seconds: result.retry_after_seconds },
        429,
      );
    }

    return jsonResponse({ ok: true, command_id: result.command_id, status: result.status }, 200);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.code }, err.status);
    }
    console.error("open-gate: unexpected error", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
