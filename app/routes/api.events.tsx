import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";
import { recordEvent } from "../lib/assignment/assign.server";
import { handlePreflight, jsonResponse } from "../lib/cors.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return handlePreflight(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false }, request, { status: 400 });
  }

  const shopDomain = String(body.shopDomain ?? "");
  const visitorToken = String(body.visitorId ?? "").slice(0, 64);
  const eventType = String(body.type ?? "");
  const assignments = (body.assignments as Record<string, string>) ?? {};

  if (!shopDomain || !visitorToken || !eventType) {
    return jsonResponse({ ok: false }, request, { status: 422 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop || shop.uninstalledAt) {
    return jsonResponse({ ok: false }, request);
  }

  if (eventType === "PURCHASE" || eventType === "checkout_completed") {
    await handlePurchaseEvent(shop.id, visitorToken, body, assignments);
  }

  await recordEvent({
    shopId: shop.id,
    visitorToken,
    type: eventType,
    assignments,
    pageUrl: body.pageUrl ? String(body.pageUrl) : undefined,
    metadata: {
      device: body.device,
      pageTemplate: body.pageTemplate,
      ...(body.productId ? { productId: body.productId } : {}),
    },
  });

  return jsonResponse({ ok: true }, request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return handlePreflight(request);
  return jsonResponse({ ok: false }, request, { status: 405 });
};

async function handlePurchaseEvent(
  shopId: string,
  visitorToken: string,
  body: Record<string, unknown>,
  assignments: Record<string, string>,
) {
  const shopifyOrderId = String(body.shopifyOrderId ?? "");
  if (!shopifyOrderId) return;

  const existing = await prisma.order.findUnique({
    where: { shopId_shopifyOrderId: { shopId, shopifyOrderId } },
  });
  if (existing) return;

  const visitor = await prisma.visitor.findUnique({
    where: { shopId_visitorToken: { shopId, visitorToken } },
  });

  const [firstExpId, firstVarId] = Object.entries(assignments)[0] ?? [null, null];

  await prisma.order.create({
    data: {
      shopId,
      shopifyOrderId,
      shopifyOrderGid: String(body.shopifyOrderGid ?? ""),
      experimentId: firstExpId ?? null,
      variantId: firstVarId ?? null,
      visitorId: visitor?.id ?? null,
      revenue: Number(body.revenue ?? 0),
      currency: String(body.currency ?? "USD"),
      itemCount: Number(body.itemCount ?? 0),
      processedAt: new Date(),
    },
  });
}
