/**
 * Simple in-memory sliding window rate limiter.
 * Works for single-instance deployments (Railway default).
 * For multi-instance, replace the Map with a Redis store.
 */

type Window = { count: number; resetAt: number };

const store = new Map<string, Window>();

// Clean up expired entries every 5 minutes to avoid unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, w] of store) {
    if (w.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Returns true if the request is allowed, false if rate limited.
 * @param key    Unique key, e.g. "assign:1.2.3.4"
 * @param limit  Max requests per window
 * @param windowMs  Window duration in milliseconds
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const w = store.get(key);

  if (!w || w.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (w.count >= limit) return false;

  w.count++;
  return true;
}

export function getClientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??       // Cloudflare
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? // Railway / proxies
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}
