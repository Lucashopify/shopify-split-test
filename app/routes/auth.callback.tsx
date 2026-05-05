import { redirect, type LoaderFunctionArgs } from "react-router";
import { createHmac } from "crypto";
import { prisma } from "../db.server";
import { unauthenticated } from "../shopify.server";
import { ensureMetafieldDefinition, syncConfigToMetafield } from "../lib/experiments/config.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const hmac = url.searchParams.get("hmac");

  console.log("[auth/callback] shop:", shop, "code:", code?.slice(0, 8));

  if (!code || !shop || !hmac) {
    console.error("[auth/callback] Missing required params");
    throw redirect("/");
  }

  // Validate HMAC to confirm request is from Shopify
  const params = new URLSearchParams(url.searchParams);
  params.delete("hmac");
  const sortedMessage = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const computed = createHmac("sha256", process.env.SHOPIFY_API_SECRET ?? "")
    .update(sortedMessage)
    .digest("hex");

  if (computed !== hmac) {
    console.error("[auth/callback] HMAC validation failed");
    throw redirect("/");
  }

  // Exchange authorization code for access token
  const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      code,
    }),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.error("[auth/callback] Token exchange failed:", tokenResp.status, body);
    throw redirect("/");
  }

  const { access_token, scope } = (await tokenResp.json()) as {
    access_token: string;
    scope: string;
  };

  console.log("[auth/callback] Token received, scopes:", scope);

  // Write to Session table so unauthenticated.admin(shop) works
  await prisma.session.upsert({
    where: { id: `offline_${shop}` },
    create: {
      id: `offline_${shop}`,
      shop,
      state: "installed",
      isOnline: false,
      scope,
      accessToken: access_token,
    },
    update: {
      accessToken: access_token,
      scope,
    },
  });

  // Write to Shop table
  const dbShop = await prisma.shop.upsert({
    where: { shopDomain: shop },
    create: {
      shopDomain: shop,
      accessToken: access_token,
      scopes: scope,
      billingPlan: {
        create: {
          planName: "free_trial",
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      },
    },
    update: {
      accessToken: access_token,
      scopes: scope,
      uninstalledAt: null,
    },
  });

  console.log("[auth/callback] Shop saved:", dbShop.id);

  // Set up metafield definition and initial config (best-effort)
  try {
    const { admin } = await unauthenticated.admin(shop);
    await ensureMetafieldDefinition(admin);
    await syncConfigToMetafield(admin, dbShop.id);
    console.log("[auth/callback] Metafield definition ensured, config synced");
  } catch (err) {
    console.error("[auth/callback] Post-install setup failed (non-fatal):", err);
  }

  throw redirect(`/dashboard?shop=${shop}`);
};
