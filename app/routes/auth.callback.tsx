import { redirect, type LoaderFunctionArgs } from "react-router";
import { createHmac } from "crypto";
import { prisma } from "../db.server";
import { validateOAuthState, clearOAuthState } from "../lib/oauth-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const shop = url.searchParams.get("shop");
  const hmac = url.searchParams.get("hmac");
  const state = url.searchParams.get("state") ?? "";

  console.log("[auth/callback] shop:", shop, "code:", code?.slice(0, 8));

  if (!code || !shop || !hmac) {
    console.error("[auth/callback] Missing required params");
    throw redirect("/");
  }

  // Validate state to prevent CSRF
  const stateValid = await validateOAuthState(request, state);
  if (!stateValid) {
    console.error("[auth/callback] State mismatch — possible CSRF");
    throw redirect("/");
  }
  const clearStateCookie = await clearOAuthState(request);

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
  const tokenParams = new URLSearchParams({
    client_id: process.env.SHOPIFY_API_KEY ?? "",
    client_secret: process.env.SHOPIFY_API_SECRET ?? "",
    code,
    expiring: "1",
  });
  const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams.toString(),
  });

  if (!tokenResp.ok) {
    const body = await tokenResp.text();
    console.error("[auth/callback] Token exchange failed:", tokenResp.status, body);
    throw redirect("/");
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    scope: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };
  const { access_token, scope } = tokenData;
  const tokenExpiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;
  const refreshTokenExpiresAt = tokenData.refresh_token_expires_in
    ? new Date(Date.now() + tokenData.refresh_token_expires_in * 1000)
    : null;

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
      ...(tokenExpiresAt && { tokenExpiresAt }),
      ...(tokenData.refresh_token && { refreshToken: tokenData.refresh_token }),
      ...(refreshTokenExpiresAt && { refreshTokenExpiresAt }),
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
      ...(tokenExpiresAt && { tokenExpiresAt }),
      ...(tokenData.refresh_token && { refreshToken: tokenData.refresh_token }),
      ...(refreshTokenExpiresAt && { refreshTokenExpiresAt }),
    },
  });

  console.log("[auth/callback] Shop saved:", dbShop.id);

  // Fetch shop metadata (Plus status, timezone, currency)
  try {
    const metaResp = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": access_token },
      body: JSON.stringify({ query: `{ shop { myshopifyDomain currencyCode ianaTimezone plan { shopifyPlus } } }` }),
    });
    const metaJson = await metaResp.json() as { data?: { shop?: { myshopifyDomain?: string; currencyCode?: string; ianaTimezone?: string; plan?: { shopifyPlus?: boolean } } } };
    const meta = metaJson.data?.shop;
    if (meta) {
      await prisma.shop.update({
        where: { id: dbShop.id },
        data: {
          myshopifyDomain: meta.myshopifyDomain,
          currency: meta.currencyCode,
          timezone: meta.ianaTimezone,
          isShopifyPlus: meta.plan?.shopifyPlus ?? false,
        },
      });
    }
  } catch (err) {
    console.error("[auth/callback] Failed to fetch shop metadata (non-fatal):", err);
  }

  // Create metafield definition with PUBLIC_READ storefront access so Liquid can read it
  try {
    const gqlHeaders = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": access_token,
    };
    const gqlUrl = `https://${shop}/admin/api/2025-01/graphql.json`;

    const createResp = await fetch(gqlUrl, {
      method: "POST",
      headers: gqlHeaders,
      body: JSON.stringify({
        query: `mutation EnsureMetafieldDef($definition: MetafieldDefinitionInput!) {
          metafieldDefinitionCreate(definition: $definition) {
            createdDefinition { id }
            userErrors { field message code }
          }
        }`,
        variables: {
          definition: {
            namespace: "split_test_app",
            key: "config",
            name: "Split Test Config",
            type: "json",
            ownerType: "SHOP",
            access: { storefront: "PUBLIC_READ" },
          },
        },
      }),
    });
    const createData = await createResp.json() as { data?: { metafieldDefinitionCreate?: { userErrors?: Array<{ code: string; message: string }> } } };
    const createErrs = createData.data?.metafieldDefinitionCreate?.userErrors ?? [];
    const taken = createErrs.some((e) => e.code === "TAKEN");
    const fatal = createErrs.filter((e) => e.code !== "TAKEN");
    if (fatal.length) console.warn("[auth/callback] Metafield create errors:", fatal);

    // Definition already exists — update it to ensure storefront access is set
    if (taken) {
      const updateResp = await fetch(gqlUrl, {
        method: "POST",
        headers: gqlHeaders,
        body: JSON.stringify({
          query: `mutation UpdateMetafieldDef($definition: MetafieldDefinitionUpdateInput!) {
            metafieldDefinitionUpdate(definition: $definition) {
              updatedDefinition { id }
              userErrors { field message code }
            }
          }`,
          variables: {
            definition: {
              namespace: "split_test_app",
              key: "config",
              ownerType: "SHOP",
              access: { storefront: "PUBLIC_READ" },
            },
          },
        }),
      });
      const updateData = await updateResp.json() as { data?: { metafieldDefinitionUpdate?: { userErrors?: Array<{ field: string; message: string }> } } };
      const updateErrs = updateData.data?.metafieldDefinitionUpdate?.userErrors ?? [];
      if (updateErrs.length) console.warn("[auth/callback] Metafield update errors:", updateErrs);
      else console.log("[auth/callback] Metafield definition updated with PUBLIC_READ access");
    } else {
      console.log("[auth/callback] Metafield definition created with PUBLIC_READ access");
    }
  } catch (err) {
    console.error("[auth/callback] Metafield definition setup failed (non-fatal):", err);
  }

  // Register order webhooks programmatically (toml deploy can't subscribe to
  // protected customer data topics without Partner Dashboard approval)
  try {
    const appUrl = process.env.SHOPIFY_APP_URL ?? "";
    const webhookUrl = `${appUrl}/webhooks`;
    const restBase = `https://${shop}/admin/api/2025-01/webhooks.json`;
    const restHeaders = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": access_token,
    };
    const topics = ["orders/create", "orders/paid", "orders/cancelled", "orders/updated"];
    for (const topic of topics) {
      const r = await fetch(restBase, {
        method: "POST",
        headers: restHeaders,
        body: JSON.stringify({ webhook: { topic, address: webhookUrl, format: "json" } }),
      });
      if (!r.ok && r.status !== 422) {
        // 422 = already exists — fine
        const body = await r.text();
        console.warn(`[auth/callback] Webhook ${topic} registration failed:`, r.status, body);
      } else {
        console.log(`[auth/callback] Webhook ${topic} registered (or already exists)`);
      }
    }
  } catch (err) {
    console.error("[auth/callback] Webhook registration failed (non-fatal):", err);
  }

  throw redirect(`/dashboard?shop=${shop}`, { headers: { "Set-Cookie": clearStateCookie } });
};
