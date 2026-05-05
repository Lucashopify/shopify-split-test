/**
 * CORS helpers for unauthenticated storefront API routes.
 * Allows requests from *.myshopify.com and any custom storefront domain.
 * Used by /api/assign, /api/events, /api/config/:.
 */

const ALLOWED_ORIGINS = [
  /^https:\/\/[a-z0-9-]+\.myshopify\.com$/,
  /^https:\/\/.+\.shopifypreview\.com$/,
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some((re) => re.test(origin));
}

export function corsHeaders(
  request: Request,
): Record<string, string> {
  const origin = request.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };

  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  } else {
    // Fallback: allow from any origin (storefront domains are merchant-controlled)
    headers["Access-Control-Allow-Origin"] = "*";
  }

  return headers;
}

export function handlePreflight(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function jsonResponse(
  data: unknown,
  request: Request,
  init: ResponseInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request),
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
}
