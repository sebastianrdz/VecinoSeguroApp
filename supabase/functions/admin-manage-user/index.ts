/**
 * POST /functions/v1/admin-manage-user
 *
 * Caller must be an active admin. Body:
 *   { action: "approve"|"set_role"|"set_household"|"block"|"unblock"|"remove"|"invite",
 *     user_id?: uuid, role?: user_role, email?: string, household_id?: uuid }
 *
 * NOTE on `set_household`: CONTRACT.md's documented admin-manage-user action
 * enum (as of this writing) is approve|set_role|block|unblock|remove|invite.
 * `set_household` is added here per an explicit coordinator security-review
 * instruction (Fix 4) so admins can (re)assign a neighbor's household_id
 * after approval, now that neighbors are blocked from self-assigning it
 * (see migrations/20260101000007_household_id_protection.sql). This is a
 * contract *addition*, not a contradiction, but CONTRACT.md itself should
 * still be updated by its owner to document this action -- flagged in the
 * handoff notes, since this repo's rule is that only the contract owner
 * edits CONTRACT.md. `approve` also still accepts an optional household_id
 * (harmless, pre-existing, kept for convenience at approval time).
 *
 * Error codes used (CONTRACT.md only specifies the generic
 * `{ ok:false, error:"<code>" }` shape for this endpoint, so the specific
 * codes below are this implementation's decision -- documented in the
 * handoff notes):
 *   401 unauthorized        - missing/invalid JWT
 *   403 not_active          - authenticated, but caller's profile isn't active
 *   403 not_admin           - active, but caller isn't an admin
 *   400 invalid_action      - action missing/unrecognized
 *   400 missing_params      - required params for the action are missing/malformed
 *   400 household_not_found - household_id doesn't reference a real household row
 *   404 not_found           - user_id doesn't match an existing profile
 *   409 last_admin          - action would leave zero active admins (Fix 5)
 *   500 internal_error      - DB failure
 *
 * Security fixes applied in this revision (coordinator security review):
 *   Fix 1b - block/remove now also force a global sign-out (revoke refresh
 *            tokens) for the target user -- see force_sign_out_user() RPC.
 *   Fix 4  - new `set_household` action (household_id is now locked against
 *            neighbor self-edits at the DB trigger layer).
 *   Fix 5  - block/remove/set_role(->neighbor) are rejected if they would
 *            leave zero active admins in the system.
 */
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import {
  authenticate,
  requireAdmin,
  AuthError,
  type CallerProfile,
  type UserRole,
} from "../_shared/auth.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Action =
  | "approve"
  | "set_role"
  | "set_household"
  | "block"
  | "unblock"
  | "remove"
  | "invite";
const VALID_ACTIONS: readonly Action[] = [
  "approve",
  "set_role",
  "set_household",
  "block",
  "unblock",
  "remove",
  "invite",
];
const VALID_ROLES: readonly UserRole[] = ["neighbor", "admin"];

interface RequestBody {
  action?: string;
  user_id?: string;
  role?: string;
  email?: string;
  household_id?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

// Deliberately simple email check -- Supabase itself validates deliverability
// at signup time; this only guards against obviously malformed input.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isEmail(value: unknown): value is string {
  return typeof value === "string" && EMAIL_RE.test(value);
}

const PROFILE_COLUMNS = "id, full_name, phone, household_id, role, status, created_at";

/** Maps a Postgres FK-violation on household_id to a friendly error code. */
function isHouseholdFkViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "23503";
}

/**
 * Fetches the target profile's current role/status (for the last-admin
 * guard). Throws AuthError(404, "not_found") if it doesn't exist.
 */
async function loadTargetProfile(
  serviceClient: SupabaseClient,
  userId: string,
): Promise<Pick<CallerProfile, "id" | "role" | "status">> {
  const { data, error } = await serviceClient
    .from("profiles")
    .select("id, role, status")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("admin-manage-user: failed to load target profile", error);
    throw new AuthError(500, "internal_error");
  }
  if (!data) throw new AuthError(404, "not_found");
  return data;
}

/**
 * Security fix 5: refuse an action that would leave zero active admins.
 * Only meaningful when the target is *currently* an active admin -- an
 * action on a neighbor, or on an already-inactive admin, can never reduce
 * the active-admin count and is always allowed.
 */
async function assertActionKeepsAnActiveAdmin(
  serviceClient: SupabaseClient,
  target: Pick<CallerProfile, "id" | "role" | "status">,
): Promise<void> {
  const targetIsCurrentlyActiveAdmin = target.role === "admin" && target.status === "active";
  if (!targetIsCurrentlyActiveAdmin) return;

  const { count, error } = await serviceClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
    .eq("status", "active")
    .neq("id", target.id);

  if (error) {
    console.error("admin-manage-user: failed to count active admins", error);
    throw new AuthError(500, "internal_error");
  }
  if ((count ?? 0) === 0) {
    throw new AuthError(409, "last_admin");
  }
}

/**
 * Security fix 1b: force a global sign-out (revoke refresh tokens) for the
 * target user. Best-effort -- logged on failure but does not fail the
 * whole request, since the primary state change (status='blocked') has
 * already committed and is independently enforced by every Edge Function's
 * live `profiles.status` re-check (the actual fast revocation point; see
 * force_sign_out_user()'s migration comment for why the access token
 * itself can't be revoked before its natural expiry regardless of this
 * call's outcome).
 */
async function forceSignOutBestEffort(serviceClient: SupabaseClient, userId: string): Promise<void> {
  const { error } = await serviceClient.rpc("force_sign_out_user", { p_user_id: userId });
  if (error) {
    console.error("admin-manage-user: force_sign_out_user failed (non-fatal)", userId, error);
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const { profile, serviceClient } = await authenticate(req);
    requireAdmin(profile);

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, error: "missing_params" }, 400);
    }

    if (!body.action || !VALID_ACTIONS.includes(body.action as Action)) {
      return jsonResponse({ ok: false, error: "invalid_action" }, 400);
    }
    const action = body.action as Action;

    switch (action) {
      case "approve": {
        if (!isUuid(body.user_id)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        // household_id is optional here (kept for convenience at approval
        // time); dedicated reassignment later goes through set_household.
        if (body.household_id !== undefined && body.household_id !== null && !isUuid(body.household_id)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }

        const update: Record<string, unknown> = { status: "active" };
        if (body.household_id !== undefined) update.household_id = body.household_id;

        const { data, error } = await serviceClient
          .from("profiles")
          .update(update)
          .eq("id", body.user_id)
          .select(PROFILE_COLUMNS)
          .maybeSingle();
        if (error) {
          if (isHouseholdFkViolation(error)) {
            return jsonResponse({ ok: false, error: "household_not_found" }, 400);
          }
          console.error("admin-manage-user: approve failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        if (!data) return jsonResponse({ ok: false, error: "not_found" }, 404);
        return jsonResponse({ ok: true, user: data }, 200);
      }

      case "set_household": {
        // household_id: null is allowed (unassign a household); omitted or
        // malformed is not.
        if (!isUuid(body.user_id)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        if (body.household_id === undefined || (body.household_id !== null && !isUuid(body.household_id))) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }

        const { data, error } = await serviceClient
          .from("profiles")
          .update({ household_id: body.household_id })
          .eq("id", body.user_id)
          .select(PROFILE_COLUMNS)
          .maybeSingle();
        if (error) {
          if (isHouseholdFkViolation(error)) {
            return jsonResponse({ ok: false, error: "household_not_found" }, 400);
          }
          console.error("admin-manage-user: set_household failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        if (!data) return jsonResponse({ ok: false, error: "not_found" }, 404);
        return jsonResponse({ ok: true, user: data }, 200);
      }

      case "unblock": {
        if (!isUuid(body.user_id)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        const { data, error } = await serviceClient
          .from("profiles")
          .update({ status: "active" })
          .eq("id", body.user_id)
          .select(PROFILE_COLUMNS)
          .maybeSingle();
        if (error) {
          console.error("admin-manage-user: unblock failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        if (!data) return jsonResponse({ ok: false, error: "not_found" }, 404);
        return jsonResponse({ ok: true, user: data }, 200);
      }

      case "block": {
        if (!isUuid(body.user_id)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        const target = await loadTargetProfile(serviceClient, body.user_id);
        await assertActionKeepsAnActiveAdmin(serviceClient, target);

        const { data, error } = await serviceClient
          .from("profiles")
          .update({ status: "blocked" })
          .eq("id", body.user_id)
          .select(PROFILE_COLUMNS)
          .maybeSingle();
        if (error) {
          console.error("admin-manage-user: block failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        if (!data) return jsonResponse({ ok: false, error: "not_found" }, 404);

        // Security fix 1b: stop refresh-token renewal for the blocked user.
        await forceSignOutBestEffort(serviceClient, body.user_id);

        return jsonResponse({ ok: true, user: data }, 200);
      }

      case "set_role": {
        if (!isUuid(body.user_id) || !VALID_ROLES.includes(body.role as UserRole)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        const newRole = body.role as UserRole;

        if (newRole === "neighbor") {
          const target = await loadTargetProfile(serviceClient, body.user_id);
          await assertActionKeepsAnActiveAdmin(serviceClient, target);
        }

        const { data, error } = await serviceClient
          .from("profiles")
          .update({ role: newRole })
          .eq("id", body.user_id)
          .select(PROFILE_COLUMNS)
          .maybeSingle();
        if (error) {
          console.error("admin-manage-user: set_role failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        if (!data) return jsonResponse({ ok: false, error: "not_found" }, 404);
        return jsonResponse({ ok: true, user: data }, 200);
      }

      case "remove": {
        if (!isUuid(body.user_id)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        const target = await loadTargetProfile(serviceClient, body.user_id);
        await assertActionKeepsAnActiveAdmin(serviceClient, target);

        // DECISION (flagged for review): "remove" is a *soft* remove --
        // status set to 'blocked' and household_id cleared -- rather than a
        // hard delete of the profiles row / supabase.auth.admin.deleteUser().
        // profiles.id is referenced by gate_commands.requested_by and
        // gate_events.actor_id, which CONTRACT.md describes as an immutable
        // audit log; hard-deleting would either violate that FK or require
        // an ON DELETE policy this function shouldn't decide unilaterally.
        // If true hard-delete is required, coordinate with the
        // migrations/schema owner first.
        const { data, error } = await serviceClient
          .from("profiles")
          .update({ status: "blocked", household_id: null })
          .eq("id", body.user_id)
          .select(PROFILE_COLUMNS)
          .maybeSingle();
        if (error) {
          console.error("admin-manage-user: remove failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        if (!data) return jsonResponse({ ok: false, error: "not_found" }, 404);

        // Security fix 1b: stop refresh-token renewal for the removed user.
        await forceSignOutBestEffort(serviceClient, body.user_id);

        return jsonResponse({ ok: true }, 200);
      }

      case "invite": {
        if (!isEmail(body.email)) {
          return jsonResponse({ ok: false, error: "missing_params" }, 400);
        }
        const role: UserRole =
          body.role && VALID_ROLES.includes(body.role as UserRole) ? (body.role as UserRole) : "neighbor";

        // NOTE: CONTRACT.md's `invites` table columns are
        // (id, email, role, invited_by, accepted_at, created_at) -- there is
        // no household_id column. Per scope instructions we do not invent a
        // schema column; any household_id passed in the request body is
        // accepted-but-ignored here. Flagged as a discrepancy: if
        // household-scoped invites are needed, that column must be added via
        // a migration by the schema owner first.
        const { error } = await serviceClient.from("invites").insert({
          email: body.email,
          role,
          invited_by: profile.id,
        });
        if (error) {
          console.error("admin-manage-user: invite failed", error);
          return jsonResponse({ ok: false, error: "internal_error" }, 500);
        }
        return jsonResponse({ ok: true }, 200);
      }
    }

    // Unreachable: VALID_ACTIONS.includes() above guarantees `action` is one
    // of the cases handled. Kept only so the function has an explicit return
    // on every path for the type checker.
    return jsonResponse({ ok: false, error: "invalid_action" }, 400);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.code }, err.status);
    }
    console.error("admin-manage-user: unexpected error", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
