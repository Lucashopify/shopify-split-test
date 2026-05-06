/**
 * Google Analytics 4 integration helpers.
 *
 * OAuth flow:
 *   1. Settings action (ga4_connect) → buildGoogleAuthUrl() → redirect to Google
 *   2. /auth/google/callback → exchangeGoogleCode() → save tokens → redirect to settings
 *   3. Settings loader → listGa4Properties() → merchant picks property
 *   4. Settings action (ga4_save_property) → save propertyId → ensureGa4CustomDimension()
 *
 * Data flow:
 *   - Storefront snippet fires gtag('set', 'user_properties', { split_test_variant: ... })
 *   - GA4 custom dimension "split_test_variant" captures it per user
 *   - Merchants filter any GA4 report by this dimension to see per-variant data
 */
import { prisma } from "../db.server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GA4_ADMIN_URL = "https://analyticsadmin.googleapis.com/v1beta";

export function getGoogleRedirectUri(): string {
  return `${(process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "")}/auth/google/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/analytics.edit",
    ].join(" "),
    access_type: "offline",
    prompt: "consent", // always prompt so we get a refresh_token
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export function encodeOAuthState(shop: string): string {
  const nonce = Math.random().toString(36).slice(2);
  return Buffer.from(JSON.stringify({ shop, nonce })).toString("base64url");
}

export function decodeOAuthState(state: string): { shop: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    if (typeof parsed.shop !== "string") return null;
    return { shop: parsed.shop };
  } catch {
    return null;
  }
}

export async function exchangeGoogleCode(code: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: getGoogleRedirectUri(),
      grant_type: "authorization_code",
      code,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }
  return resp.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

/**
 * Returns a valid GA4 access token for the shop, refreshing if needed.
 * Returns null if the shop has no GA4 connection.
 */
export async function getGa4AccessToken(shopId: string): Promise<string | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { ga4RefreshToken: true, ga4AccessToken: true, ga4AccessTokenExpiry: true },
  });

  if (!shop?.ga4RefreshToken) return null;

  // Return cached token if still valid (with 60s buffer)
  if (
    shop.ga4AccessToken &&
    shop.ga4AccessTokenExpiry &&
    shop.ga4AccessTokenExpiry.getTime() > Date.now() + 60_000
  ) {
    return shop.ga4AccessToken;
  }

  // Refresh
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: shop.ga4RefreshToken,
    }),
  });

  if (!resp.ok) {
    console.error("[ga4] token refresh failed:", resp.status, await resp.text());
    return null;
  }

  const data = await resp.json() as { access_token: string; expires_in: number };

  await prisma.shop.update({
    where: { id: shopId },
    data: {
      ga4AccessToken: data.access_token,
      ga4AccessTokenExpiry: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token;
}

export type Ga4Property = {
  id: string;        // "properties/123456789"
  displayName: string;
};

export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const resp = await fetch(`${GA4_ADMIN_URL}/accountSummaries?pageSize=200`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GA4 Admin API failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    accountSummaries?: Array<{
      propertySummaries?: Array<{ property: string; displayName: string }>;
    }>;
  };

  const properties: Ga4Property[] = [];
  for (const account of data.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      properties.push({ id: prop.property, displayName: prop.displayName });
    }
  }
  return properties;
}

/**
 * Creates the "split_test_variant" user-scoped custom dimension in the GA4 property.
 * Safe to call if it already exists — ignores ALREADY_EXISTS errors.
 */
export async function ensureGa4CustomDimension(
  propertyId: string,
  accessToken: string,
): Promise<void> {
  const resp = await fetch(`${GA4_ADMIN_URL}/${propertyId}/customDimensions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parameterName: "split_test_variant",
      displayName: "Split Test Variant",
      scope: "USER",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    // 409 = already exists — fine
    if (resp.status === 409 || text.includes("ALREADY_EXISTS")) return;
    console.error("[ga4] custom dimension creation failed:", resp.status, text);
  }
}
