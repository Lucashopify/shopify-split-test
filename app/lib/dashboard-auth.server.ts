import { redirect, createCookieSessionStorage } from "react-router";
import { prisma } from "../db.server";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__dashboard",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secrets: [process.env.SHOPIFY_API_SECRET ?? "fallback-secret"],
  },
});

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  scope: string;
};

async function doRefreshToken(shop: string, refreshToken: string): Promise<TokenResponse | null> {
  const params = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    client_secret: process.env.SHOPIFY_API_SECRET ?? "",
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const resp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error("[tokenRefresh] Failed:", resp.status, text);
    return null;
  }
  return resp.json() as Promise<TokenResponse>;
}

async function registerOrderWebhooks(shop: string, token: string, shopId: string) {
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  const webhookUrl = `${appUrl}/webhooks`;
  const restBase = `https://${shop}/admin/api/2025-01/webhooks.json`;
  const headers = { "Content-Type": "application/json", "X-Shopify-Access-Token": token };
  const topics = ["orders/create", "orders/paid", "orders/cancelled", "orders/updated"];

  for (const topic of topics) {
    const r = await fetch(restBase, {
      method: "POST",
      headers,
      body: JSON.stringify({ webhook: { topic, address: webhookUrl, format: "json" } }),
    });
    if (!r.ok && r.status !== 422) {
      console.warn(`[webhooks] Failed to register ${topic}:`, r.status, await r.text());
      return; // don't mark as registered if any failed
    }
    console.log(`[webhooks] Registered ${topic} (or already exists)`);
  }

  await prisma.shop.update({ where: { id: shopId }, data: { webhooksRegisteredAt: new Date() } });
  console.log("[webhooks] All order webhooks registered for", shop);
}

function buildAdminClient(shop: string, token: string) {
  const gqlUrl = `https://${shop}/admin/api/2025-01/graphql.json`;
  return {
    graphql: async (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ): Promise<Response> => {
      const body: Record<string, unknown> = { query };
      if (options?.variables) body.variables = options.variables;
      return fetch(gqlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
        body: JSON.stringify(body),
      });
    },
  };
}

export async function requireDashboardSession(request: Request) {
  const url = new URL(request.url);
  const cookieHeader = request.headers.get("Cookie");
  const cookieSession = await sessionStorage.getSession(cookieHeader);

  let shop = url.searchParams.get("shop") ?? cookieSession.get("shop");
  if (!shop) throw redirect("/");

  const dbShop = await prisma.shop.findFirst({
    where: { shopDomain: shop, uninstalledAt: null, accessToken: { not: "" } },
    include: { billingPlan: true },
  });

  if (!dbShop?.accessToken) throw redirect(`/?shop=${shop}`);

  // Check for missing scopes — redirect to OAuth if new scopes were added
  const REQUIRED_SCOPES = [
    "read_products", "write_products",
    "read_themes", "write_themes",
    "read_orders", "write_discounts",
  ];
  const grantedScopes = (dbShop.scopes ?? "").split(",").map((s) => s.trim());
  const missingScopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));
  if (missingScopes.length > 0) {
    throw redirect(`/auth?shop=${shop}`);
  }

  let token = dbShop.accessToken;
  const now = new Date();
  const fiveMinutes = 5 * 60 * 1000;

  if (dbShop.tokenExpiresAt && dbShop.tokenExpiresAt.getTime() - now.getTime() < fiveMinutes) {
    // Token is expired or near expiry — refresh it
    if (dbShop.refreshToken && dbShop.refreshTokenExpiresAt && dbShop.refreshTokenExpiresAt > now) {
      const refreshed = await doRefreshToken(shop, dbShop.refreshToken);
      if (refreshed) {
        await prisma.shop.update({
          where: { id: dbShop.id },
          data: {
            accessToken: refreshed.access_token,
            tokenExpiresAt: new Date(now.getTime() + refreshed.expires_in * 1000),
            refreshToken: refreshed.refresh_token,
            refreshTokenExpiresAt: new Date(now.getTime() + refreshed.refresh_token_expires_in * 1000),
          },
        });
        token = refreshed.access_token;
        console.log("[tokenRefresh] Success for", shop);
      }
    } else {
      // Refresh token expired — merchant needs to re-auth
      console.warn("[tokenRefresh] Refresh token expired for", shop, "— re-auth required");
    }
  }

  const admin = buildAdminClient(shop, token);

  // Register order webhooks once per shop (fire-and-forget, non-blocking)
  if (!dbShop.webhooksRegisteredAt) {
    registerOrderWebhooks(shop, token, dbShop.id).catch((err) =>
      console.error("[webhooks] Registration failed:", err),
    );
  }

  cookieSession.set("shop", shop);
  const setCookie = await sessionStorage.commitSession(cookieSession);

  // Enforce trial expiry — redirect to billing unless already there
  const billingPlan = dbShop.billingPlan;
  const isBillingPath = url.pathname.startsWith("/dashboard/billing");
  if (
    billingPlan?.planName === "free_trial" &&
    billingPlan?.trialEndsAt &&
    billingPlan.trialEndsAt < now &&
    !isBillingPath
  ) {
    throw redirect("/dashboard/billing", { headers: { "Set-Cookie": setCookie } });
  }

  const restFetch = (path: string, init?: RequestInit) =>
    fetch(`https://${shop}/admin/api/2025-01${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
        ...(init?.headers ?? {}),
      },
    });

  return { session: { shop }, shop, admin, restFetch, headers: new Headers({ "Set-Cookie": setCookie }), setCookie, shopId: dbShop.id, myshopifyDomain: dbShop.myshopifyDomain ?? shop, billingPlanName: dbShop.billingPlan?.planName ?? "free_trial" };
}
