/**
 * Shared auth helpers for VecinoSeguro edge functions.
 *
 * SECURITY: the caller's identity is ALWAYS derived from the verified
 * Supabase JWT (via supabase.auth.getUser()), never from a user_id in the
 * request body. Callers must not be able to act "as" another user by
 * putting someone else's id in the payload.
 */
import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";

export type UserRole = "neighbor" | "admin";
export type UserStatus = "pending" | "active" | "blocked";

export interface CallerProfile {
  id: string;
  full_name: string | null;
  phone: string | null;
  household_id: string | null;
  role: UserRole;
  status: UserStatus;
  created_at: string;
}

/** Error codes used across both edge functions' `{ ok:false, error:<code> }` responses. */
export type ErrorCode =
  | "unauthorized"
  | "not_active"
  | "not_admin"
  | "not_found"
  | "invalid_action"
  | "missing_params"
  | "rate_limited"
  | "method_not_allowed"
  | "last_admin"
  | "household_not_found"
  | "internal_error";

/** Thrown by the helpers below; carries the HTTP status + contract error code to send. */
export class AuthError extends Error {
  status: number;
  code: ErrorCode;
  constructor(status: number, code: ErrorCode) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/**
 * Service-role client: bypasses RLS. Used for privileged writes/reads that
 * the contract designates as service-role-only (gate_commands, gate_events,
 * invites, and admin profile mutations), and to look up the caller's own
 * profile without depending on RLS self-read policies being correct.
 */
export function getServiceRoleClient(): SupabaseClient {
  const url = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export interface AuthenticatedCaller {
  userId: string;
  profile: CallerProfile;
  serviceClient: SupabaseClient;
}

/**
 * Verifies the Authorization header's JWT against Supabase Auth and loads
 * the caller's profiles row. Throws AuthError(401, "unauthorized") if the
 * token is missing/invalid or the profile can't be found.
 */
export async function authenticate(req: Request): Promise<AuthenticatedCaller> {
  const token = extractBearerToken(req);
  if (!token) {
    throw new AuthError(401, "unauthorized");
  }

  // DECISION: verify the JWT using the service-role client's auth.getUser(jwt)
  // rather than constructing a second client keyed with SUPABASE_ANON_KEY.
  // supabase-js's auth.getUser(jwt) sends the *given* token to the Auth
  // server's /user endpoint and returns whichever identity it decodes to --
  // the client's own configured key only affects request routing/rate
  // limiting, not whose identity is returned. This keeps us to exactly the
  // env vars CONTRACT.md lists for supabase/ (SUPABASE_URL,
  // SUPABASE_SERVICE_ROLE_KEY, GATE_RATE_LIMIT_SECONDS) with no implicit
  // dependency on an unlisted SUPABASE_ANON_KEY.
  const serviceClient = getServiceRoleClient();

  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError(401, "unauthorized");
  }
  const userId = data.user.id;
  const { data: profile, error: profileError } = await serviceClient
    .from("profiles")
    .select("id, full_name, phone, household_id, role, status, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    throw new AuthError(401, "unauthorized");
  }

  return { userId, profile: profile as CallerProfile, serviceClient };
}

/** Throws AuthError(403, "not_active") unless the caller's profile is active. */
export function requireActive(profile: CallerProfile): void {
  if (profile.status !== "active") {
    throw new AuthError(403, "not_active");
  }
}

/**
 * Throws unless the caller is an active admin.
 * - not active            -> 403 not_active
 * - active but not admin  -> 403 not_admin
 */
export function requireAdmin(profile: CallerProfile): void {
  requireActive(profile);
  if (profile.role !== "admin") {
    throw new AuthError(403, "not_admin");
  }
}
