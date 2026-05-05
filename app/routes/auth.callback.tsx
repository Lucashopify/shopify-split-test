import { redirect, type LoaderFunctionArgs } from "react-router";
import { createHmac } from "crypto";
import { prisma } from "../db.server";

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

  // Create metafield definition using direct fetch (avoids SDK GraphQL client throwing on errors)
  try {
    const gqlResp = await fetch(`https://${shop}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": access_token,
      },
      body: JSON.stringify({
        query: `
          mutation EnsureMetafieldDef($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition { id }
              userErrors { field message code }
            }
          }
        `,
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
    const gqlData = await gqlResp.json() as { data?: { metafieldDefinitionCreate?: { userErrors?: Array<{ code: string; message: string }> } } };
    const errs = gqlData.data?.metafieldDefinitionCreate?.userErrors?.filter((e) => e.code !== "TAKEN") ?? [];
    if (errs.length) {
      console.warn("[auth/callback] Metafield definition errors:", errs);
    } else {
      console.log("[auth/callback] Metafield definition ensured");
    }
  } catch (err) {
    console.error("[auth/callback] Metafield definition setup failed (non-fatal):", err);
  }

  throw redirect(`/dashboard?shop=${shop}`);
};
