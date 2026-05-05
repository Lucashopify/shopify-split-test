/**
 * Cloudflare Worker — URL-redirect split test handler.
 *
 * Intercepts requests for URLs under test and issues a 302 redirect to the
 * appropriate variant URL before the origin is hit.
 *
 * Decision flow:
 *  1. Parse the visitor token from the spt_vid cookie.
 *  2. Look up active URL-redirect experiments from the app origin (cached).
 *  3. Compute bucket = hash(visitorId + experimentId) % 100.
 *  4. Resolve variant URL and 302 redirect.
 *  5. Write back a Set-Cookie with a per-experiment assignment so the
 *     storefront can fire the right analytics event.
 *
 * Target latency: <50ms added TTFB (P99).
 * Deployed to: workers.dev for development; custom route for production.
 *
 * Phase 4 implementation note:
 * - The experiment config fetch in step 2 will be KV-cached with a 30s TTL.
 * - The visitor token in step 1 must be verified with HMAC (same secret as app).
 * - The 302 must NOT be cached (Cache-Control: no-store) to prevent CDN bleed.
 */

export interface Env {
  APP_ORIGIN: string;
  COOKIE_SECRET: string;
  // ASSIGNMENTS: KVNamespace; // uncomment after creating KV namespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/_edge/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // TODO Phase 4: implement URL-redirect experiment decisioning
    // For now, pass through to origin
    return fetch(request);
  },
};

/**
 * Parse the visitor token cookie from the request.
 * Returns null if absent.
 */
function getVisitorToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;)\s*spt_vid=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Deterministic bucketing — must match the server-side implementation in
 * app/lib/assignment/bucket.server.ts exactly.
 *
 * Uses SubtleCrypto (available in Workers runtime).
 */
async function getBucket(
  visitorId: string,
  experimentId: string,
): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${visitorId}:${experimentId}`);

  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);

  // First 4 bytes as big-endian uint32
  const int32 =
    ((hashArray[0] << 24) |
      (hashArray[1] << 16) |
      (hashArray[2] << 8) |
      hashArray[3]) >>>
    0;

  return int32 % 100;
}
