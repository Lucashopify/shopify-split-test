/**
 * TEMPORARY — delete after demo recording.
 * GET /admin/set-plan?secret=splittest-reset&plan=scale
 */
import { type LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";

const PLANS: Record<string, { visitorCap: number; liftAssist: boolean }> = {
  free_trial: { visitorCap: 10_000, liftAssist: false },
  starter:    { visitorCap: 20_000, liftAssist: false },
  growth:     { visitorCap: 100_000, liftAssist: true },
  scale:      { visitorCap: 500_000, liftAssist: true },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("secret") !== "splittest-reset") {
    return new Response("Forbidden", { status: 403 });
  }

  const planName = url.searchParams.get("plan") ?? "scale";
  const plan = PLANS[planName];
  if (!plan) return new Response("Unknown plan", { status: 400 });

  const shop = await prisma.shop.findFirst({
    where: { shopDomain: { contains: "arkticstudio-demo" } },
  });
  if (!shop) return new Response("Shop not found", { status: 404 });

  await prisma.billingPlan.upsert({
    where: { shopId: shop.id },
    create: {
      shopId: shop.id,
      planName,
      monthlyVisitorCap: plan.visitorCap,
      status: "active",
      liftAssistEnabled: plan.liftAssist,
    },
    update: {
      planName,
      monthlyVisitorCap: plan.visitorCap,
      status: "active",
      liftAssistEnabled: plan.liftAssist,
      shopifyChargeId: null,
      trialEndsAt: null,
    },
  });

  return new Response(`Plan set to ${planName} for ${shop.shopDomain}`, {
    headers: { "Content-Type": "text/plain" },
  });
};
