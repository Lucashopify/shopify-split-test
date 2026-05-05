import { randomBytes } from "node:crypto";

export const COOKIE_NAME = "spt_vid";
export const ASSIGN_COOKIE_NAME = "spt_asgn";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * FNV-1a 32-bit hash — identical algorithm to the client-side embed script.
 * Using FNV-1a (not SHA-256) so the browser can compute the same bucket
 * synchronously without SubtleCrypto (which is async).
 *
 * Distribution is uniform enough for A/B testing at any practical traffic level.
 */
export function fnv1a32(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime — Math.imul keeps it in uint32 range
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0; // ensure unsigned
}

/**
 * Deterministic bucketing: fnv1a(visitorId:experimentId) % 100 → cohort 0–99.
 * Matches the client-side getBucket() in split-test-embed.liquid exactly.
 */
export function getBucket(visitorId: string, experimentId: string): number {
  return fnv1a32(`${visitorId}:${experimentId}`) % 100;
}

/**
 * Deterministic traffic allocation check.
 * Visitors are consistently in or out of the experiment regardless of when
 * they first visit.
 */
export function isInAllocation(
  visitorId: string,
  experimentId: string,
  allocationPct: number,
): boolean {
  const bucket = fnv1a32(`${visitorId}:${experimentId}:alloc`) % 100;
  return bucket < allocationPct;
}

/**
 * Given the experiment's variants (ordered), find which variant the bucket
 * falls into based on cumulative traffic weights.
 *
 * Example: weights [50, 50] → bucket 0–49 = variant[0], 50–99 = variant[1]
 */
export function assignVariant<T extends { id: string; trafficWeight: number }>(
  variants: T[],
  bucket: number,
): T | null {
  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.trafficWeight;
    if (bucket < cumulative) return variant;
  }
  return null;
}

/**
 * Generate a cryptographically random visitor token (128-bit hex, 32 chars).
 * The client generates its own token if it arrives before the server sets one,
 * but both use the same format so the system is consistent.
 */
export function generateVisitorToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Read and parse the visitor token from the request cookie.
 * The token is stored unsigned (raw hex) — no HMAC needed since visitor IDs
 * are not security credentials.
 */
export function getVisitorToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;)\s*spt_vid=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Parse the assignment cookie into a map of experimentId → variantId.
 */
export function getAssignmentCookie(
  request: Request,
): Record<string, string> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader.match(/(?:^|;)\s*spt_asgn=([^;]+)/);
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return {};
  }
}

/**
 * Build the Set-Cookie header value for the visitor token.
 * Not HttpOnly — the Theme App Extension script must be able to read it.
 * SameSite=Lax — sent on top-level navigations, not third-party.
 */
export function buildVisitorCookie(token: string): string {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function buildAssignCookie(
  assignments: Record<string, string>,
): string {
  const parts = [
    `${ASSIGN_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(assignments))}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `SameSite=Lax`,
  ];
  if (process.env.NODE_ENV === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}
