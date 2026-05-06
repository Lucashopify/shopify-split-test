import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { syncConfigToMetafield } from "../lib/experiments/config.server";

/**
 * Single webhook endpoint — topic determined from X-Shopify-Topic header.
 * HMAC is verified by @shopify/shopify-app-remix before this handler runs.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } =
    await authenticate.webhook(request);

  console.log(`[webhook] ${topic} from ${shop}`);

  switch (topic) {
    // -----------------------------------------------------------------------
    case "APP_UNINSTALLED": {
      if (session) {
        await prisma.session.deleteMany({ where: { shop } });
      }
      await prisma.shop.updateMany({
        where: { shopDomain: shop },
        data: { uninstalledAt: new Date() },
      });
      break;
    }

    // -----------------------------------------------------------------------
    case "SHOP_UPDATE": {
      const data = payload as {
        currency?: string;
        iana_timezone?: string;
        myshopify_domain?: string;
      };
      await prisma.shop.updateMany({
        where: { shopDomain: shop },
        data: {
          currency: data.currency ?? undefined,
          timezone: data.iana_timezone ?? undefined,
          myshopifyDomain: data.myshopify_domain ?? undefined,
        },
      });
      break;
    }

    // -----------------------------------------------------------------------
    // Order lifecycle — server-side attribution
    // -----------------------------------------------------------------------
    case "ORDERS_CREATE":
    case "ORDERS_PAID": {
      await handleOrderCreate(shop, payload as ShopifyOrderPayload);
      break;
    }

    case "ORDERS_CANCELLED": {
      await handleOrderCancelled(shop, payload as ShopifyOrderPayload);
      break;
    }

    case "ORDERS_UPDATED": {
      await handleOrderUpdated(shop, payload as ShopifyOrderPayload);
      break;
    }

    // -----------------------------------------------------------------------
    // Theme lifecycle — re-sync config if a variant theme was published/deleted
    case "THEMES_CREATE":
    case "THEMES_UPDATE":
    case "THEMES_DELETE": {
      if (admin) {
        const shopRecord = await prisma.shop.findUnique({
          where: { shopDomain: shop },
        });
        if (shopRecord) {
          await syncConfigToMetafield(admin, shopRecord.id).catch((err) => {
            console.error("[webhook] theme sync failed:", err);
          });
        }
      }
      break;
    }

    // -----------------------------------------------------------------------
    // Billing — keep our DB in sync if Shopify changes subscription status
    case "APP_SUBSCRIPTIONS_UPDATE": {
      const data = payload as {
        app_subscription?: {
          admin_graphql_api_id?: string;
          status?: string;
          name?: string;
        };
      };
      const sub = data.app_subscription;
      const status = sub?.status?.toLowerCase();
      const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
      if (shopRecord && status) {
        if (status === "cancelled" || status === "declined" || status === "expired" || status === "frozen") {
          await prisma.billingPlan.upsert({
            where: { shopId: shopRecord.id },
            create: { shopId: shopRecord.id, planName: "free_trial", monthlyVisitorCap: 10_000, status: "cancelled" },
            update: { planName: "free_trial", monthlyVisitorCap: 10_000, status: "cancelled", shopifyChargeId: null },
          });
          console.log(`[billing] Subscription ${status} for ${shop} — downgraded to free`);
        } else if (status === "active") {
          // Re-activate if Shopify marks it active (e.g. after frozen payment resolved)
          await prisma.billingPlan.updateMany({
            where: { shopId: shopRecord.id },
            data: { status: "active" },
          });
          console.log(`[billing] Subscription reactivated for ${shop}`);
        }
      }
      break;
    }

    // -----------------------------------------------------------------------
    case "PRODUCTS_UPDATE": {
      // TODO Phase 4: invalidate price-test Shopify Function if product price
      // was changed outside the app
      break;
    }

    // -----------------------------------------------------------------------
    // GDPR mandatory webhooks
    case "CUSTOMERS_DATA_REQUEST": {
      console.log(`[webhook] GDPR data request for shop ${shop}`);
      // TODO Phase 6: surface in data-export UI, respond within 30 days
      break;
    }

    case "CUSTOMERS_REDACT": {
      // Anonymize visitor rows for the affected customer
      const data = payload as { customer?: { id?: number } };
      const customerId = String(data.customer?.id ?? "");
      if (customerId) {
        const shopRecord = await prisma.shop.findUnique({ where: { shopDomain: shop } });
        await prisma.visitor.updateMany({
          where: {
            shopifyCustomerId: customerId,
            shopId: shopRecord?.id ?? "",
          },
          data: {
            shopifyCustomerId: null,
            country: null,
            region: null,
            city: null,
            utmSource: null,
            utmMedium: null,
            utmCampaign: null,
            referrer: null,
          },
        });
      }
      break;
    }

    case "SHOP_REDACT": {
      // Called 48h after uninstall — delete all shop data
      console.log(`[webhook] GDPR shop redact for shop ${shop}`);
      // TODO Phase 6: cascade delete all shop data behind a job queue
      // (do it async so the webhook responds in time)
      break;
    }

    default:
      console.warn(`[webhook] Unhandled topic: ${topic}`);
      return new Response("Unhandled topic", { status: 404 });
  }

  return new Response(null, { status: 200 });
};

// ---------------------------------------------------------------------------
// Order attribution helpers
// ---------------------------------------------------------------------------

type ShopifyOrderPayload = {
  id?: number;
  admin_graphql_api_id?: string;
  note_attributes?: Array<{ name: string; value: string }>;
  cart_token?: string;
  total_price?: string;
  currency?: string;
  line_items?: Array<{ id: number }>;
  financial_status?: string;
  cancel_reason?: string | null;
  cancelled_at?: string | null;
  refunds?: Array<{
    transactions?: Array<{ amount?: string; kind?: string }>;
  }>;
  tags?: string;
  customer?: { id?: number; orders_count?: number };
  source_name?: string;
  created_at?: string;
  processed_at?: string;
};

async function handleOrderCreate(
  shopDomain: string,
  payload: ShopifyOrderPayload,
) {
  if (!payload.id) return;

  const shopifyOrderId = String(payload.id);
  const shopifyOrderGid =
    payload.admin_graphql_api_id ?? `gid://shopify/Order/${payload.id}`;

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;

  // De-duplicate
  const existing = await prisma.order.findUnique({
    where: { shopId_shopifyOrderId: { shopId: shop.id, shopifyOrderId } },
  });
  if (existing) return;

  // Read visitor token from note_attributes (set by split-test-events.js cart update)
  const attrs: Record<string, string> = {};
  for (const { name, value } of payload.note_attributes ?? []) {
    attrs[name] = value;
  }

  console.log(`[order] note_attributes raw:`, JSON.stringify(payload.note_attributes ?? []));
  console.log(`[order] attrs:`, JSON.stringify(attrs));

  const visitorToken = attrs._spt_vid ?? null;
  let assignments: Record<string, string> = {};
  try {
    assignments = attrs._spt_asgn ? JSON.parse(attrs._spt_asgn) : {};
  } catch {}

  console.log(`[order] visitorToken=${visitorToken} assignments=${JSON.stringify(assignments)}`);

  // Resolve visitor
  const visitor = visitorToken
    ? await prisma.visitor.findUnique({
        where: { shopId_visitorToken: { shopId: shop.id, visitorToken } },
      })
    : null;

  const revenue = parseFloat(payload.total_price ?? "0");
  const itemCount = payload.line_items?.length ?? 0;
  const processedAt = payload.processed_at
    ? new Date(payload.processed_at)
    : new Date();

  // Detect order type
  const orderType = detectOrderType(payload);

  const [firstExpId, firstVarId] =
    Object.entries(assignments)[0] ?? [null, null];

  // Validate that the experiment/variant IDs actually exist before writing
  let resolvedExpId: string | null = firstExpId ?? null;
  let resolvedVarId: string | null = firstVarId ?? null;
  if (resolvedExpId) {
    const expExists = await prisma.experiment.findUnique({ where: { id: resolvedExpId }, select: { id: true } });
    if (!expExists) { resolvedExpId = null; resolvedVarId = null; }
  }

  await prisma.order.create({
    data: {
      shopId: shop.id,
      shopifyOrderId,
      shopifyOrderGid,
      experimentId: resolvedExpId,
      variantId: resolvedVarId,
      visitorId: visitor?.id ?? null,
      revenue,
      revenueAdjusted: revenue,
      currency: payload.currency ?? "USD",
      orderType,
      status: "paid",
      itemCount,
      processedAt,
    },
  });
}

async function handleOrderCancelled(
  shopDomain: string,
  payload: ShopifyOrderPayload,
) {
  if (!payload.id) return;

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;

  await prisma.order.updateMany({
    where: {
      shopId: shop.id,
      shopifyOrderId: String(payload.id),
    },
    data: {
      status: "cancelled",
      revenueAdjusted: 0,
      reconciledAt: new Date(),
    },
  });
}

async function handleOrderUpdated(
  shopDomain: string,
  payload: ShopifyOrderPayload,
) {
  if (!payload.id) return;

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return;

  const order = await prisma.order.findUnique({
    where: {
      shopId_shopifyOrderId: {
        shopId: shop.id,
        shopifyOrderId: String(payload.id),
      },
    },
  });

  if (!order) {
    // May arrive before orders/create — handle it as create
    await handleOrderCreate(shopDomain, payload);
    return;
  }

  // Recompute revenue after refunds
  const totalRefunded = (payload.refunds ?? []).reduce((sum, refund) => {
    const refundTotal = (refund.transactions ?? [])
      .filter((t) => t.kind === "refund")
      .reduce((s, t) => s + parseFloat(t.amount ?? "0"), 0);
    return sum + refundTotal;
  }, 0);

  const revenueAdjusted = Math.max(0, order.revenue - totalRefunded);
  const status =
    totalRefunded >= order.revenue
      ? "refunded"
      : totalRefunded > 0
      ? "partially_refunded"
      : order.status;

  await prisma.order.update({
    where: { id: order.id },
    data: { revenueAdjusted, status, reconciledAt: new Date() },
  });
}

function detectOrderType(payload: ShopifyOrderPayload): string {
  const tags = (payload.tags ?? "").toLowerCase();
  if (tags.includes("subscription")) return "subscription";
  if (payload.source_name === "gift_card") return "gift_card";
  if (payload.source_name === "draft_orders") return "draft";
  const isReturning = (payload.customer?.orders_count ?? 0) > 1;
  return isReturning ? "one_time" : "one_time"; // distinguish new/returning at visitor level
}
