/**
 * POST /functions/v1/issue-video-token
 *
 * Mints a short-lived (60s) HS256 video-access token so the app never
 * hands its raw ~1h Supabase user JWT to Caddy/go2rtc. Caddy validates the
 * token's signature + exp AND requires claim purpose == "video" before
 * proxying to go2rtc; a leaked raw user token therefore cannot view
 * cameras, and refreshing every ~45s means a blocked user stops getting
 * new video tokens within 60s of being blocked -- this endpoint's live
 * `status === 'active'` re-check on every call IS that revocation point.
 *
 * Flow:
 *   1. Verify the caller's JWT and load their profile.
 *   2. Reject if not active (re-checked fresh on every call -- see above).
 *   3. Sign { sub, purpose: "video", iat, exp } with VIDEO_JWT_SECRET.
 */
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";
import { authenticate, requireActive, AuthError } from "../_shared/auth.ts";
import { signVideoToken } from "../_shared/videoJwt.ts";

const VIDEO_TOKEN_TTL_SECONDS = 60;

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const { userId, profile } = await authenticate(req);
    requireActive(profile);

    const jwtSecret = Deno.env.get("VIDEO_JWT_SECRET");
    if (!jwtSecret) {
      console.error("issue-video-token: missing VIDEO_JWT_SECRET secret");
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }

    const { token, expiresAt } = await signVideoToken(
      jwtSecret,
      userId,
      VIDEO_TOKEN_TTL_SECONDS,
    );

    return jsonResponse({ token, expires_at: expiresAt }, 200);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonResponse({ ok: false, error: err.code }, err.status);
    }
    console.error("issue-video-token: unexpected error", err);
    return jsonResponse({ ok: false, error: "internal_error" }, 500);
  }
});
