/**
 * Shared CORS handling for all VecinoSeguro edge functions.
 *
 * Functions in this project only accept POST (plus the OPTIONS preflight),
 * so the allow-list is intentionally narrow.
 */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * If the incoming request is a CORS preflight (OPTIONS), returns the
 * Response to send back immediately. Otherwise returns null and the caller
 * should continue handling the request normally.
 */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}

/** Builds a JSON Response with CORS headers applied. */
export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
