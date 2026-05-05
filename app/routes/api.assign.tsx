import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";
import { assignVisitor } from "../lib/assignment/assign.server";
import { corsHeaders, handlePreflight, jsonResponse } from "../lib/cors.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") return handlePreflight(request);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, request, { status: 400 });
  }

  const shopDomain = String(body.shopDomain ?? "");
  const visitorToken = String(body.visitorToken ?? "").slice(0, 64);

  if (!shopDomain || !visitorToken) {
    return jsonResponse(
      { error: "shopDomain and visitorToken required" },
      request,
      { status: 422 },
    );
  }

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { billingPlan: true },
  });

  if (!shop || shop.uninstalledAt) {
    return jsonResponse({ error: "Shop not found" }, request, { status: 404 });
  }

  if (shop.billingPlan?.status === "frozen") {
    return jsonResponse({ assignments: {} }, request);
  }

  const result = await assignVisitor({
    shopId: shop.id,
    visitorToken,
    clientAssignments: (body.assignments as Record<string, string>) ?? {},
    device: body.device ? String(body.device) : undefined,
    pageUrl: body.pageUrl ? String(body.pageUrl) : undefined,
    referrer: body.referrer ? String(body.referrer) : undefined,
    utmSource: body.utmSource ? String(body.utmSource) : undefined,
    utmMedium: body.utmMedium ? String(body.utmMedium) : undefined,
    utmCampaign: body.utmCampaign ? String(body.utmCampaign) : undefined,
  });

  return jsonResponse(result, request);
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return handlePreflight(request);
  return jsonResponse({ error: "Method not allowed" }, request, { status: 405 });
};
