/**
 * Minimal HS256 JWT signer for the `issue-video-token` Edge Function.
 *
 * DECISION: hand-rolled via the Deno/Web-standard SubtleCrypto API instead
 * of pulling in a JWT library (e.g. `djwt`). The token shape needed here is
 * tiny and fixed (three claims, one algorithm), so a ~30-line function
 * using only the runtime's built-in crypto is easier to audit than trusting
 * an additional remote dependency, and avoids adding a new dependency
 * without it being a deliberate, flagged choice.
 *
 * Produces a standard `header.payload.signature` compact JWS, HS256,
 * verifiable by any standard JWT library (including Caddy's) using the
 * same shared secret (SUPABASE_JWT_SECRET).
 */

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlFromString(input: string): string {
  return base64url(new TextEncoder().encode(input));
}

export interface VideoTokenClaims {
  sub: string;
  purpose: "video";
  iat: number;
  exp: number;
}

export interface SignedVideoToken {
  token: string;
  expiresAt: string;
  claims: VideoTokenClaims;
}

/**
 * Signs a short-lived HS256 JWT for video access.
 * Claims: { sub: userId, purpose: "video", iat, exp } (exp = now + ttlSeconds).
 */
export async function signVideoToken(
  secret: string,
  userId: string,
  ttlSeconds: number,
): Promise<SignedVideoToken> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + ttlSeconds;

  const claims: VideoTokenClaims = {
    sub: userId,
    purpose: "video",
    iat: nowSeconds,
    exp,
  };

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64urlFromString(JSON.stringify(header));
  const encodedPayload = base64urlFromString(JSON.stringify(claims));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signingInput),
  );
  const encodedSignature = base64url(new Uint8Array(signatureBuffer));

  const token = `${signingInput}.${encodedSignature}`;
  const expiresAt = new Date(exp * 1000).toISOString();

  return { token, expiresAt, claims };
}
