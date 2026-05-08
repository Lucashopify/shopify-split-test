import React from "react";
import { data, redirect, useFetcher, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

// ---------------------------------------------------------------------------
// Plan definitions — single source of truth for UI + billing API
// ---------------------------------------------------------------------------
const YEARLY_DISCOUNT = 0.25; // 25% off

const PLAN_CONFIG = {
  starter: {
    id: "starter",
    name: "Starter",
    shopifyName: "Starter — Arktic - A/B Split test",
    shopifyNameYearly: "Starter Annual — Arktic - A/B Split test",
    price: 79.0,
    visitorCap: 20_000,
    experimentsLabel: "10 running",
    trialDays: 7,
    features: ["All test types", "Full analytics", "Audience segments"],
    liftAssist: false,
  },
  growth: {
    id: "growth",
    name: "Growth",
    shopifyName: "Growth — Arktic - A/B Split test",
    shopifyNameYearly: "Growth Annual — Arktic - A/B Split test",
    price: 299.0,
    visitorCap: 100_000,
    experimentsLabel: "Unlimited",
    trialDays: 7,
    features: ["Everything in Starter", "Lift Assist AI", "Priority support"],
    liftAssist: true,
  },
  scale: {
    id: "scale",
    name: "Scale",
    shopifyName: "Scale — Arktic - A/B Split test",
    shopifyNameYearly: "Scale Annual — Arktic - A/B Split test",
    price: 749.0,
    visitorCap: 500_000,
    experimentsLabel: "Unlimited",
    trialDays: 7,
    features: ["Everything in Growth", "SRM detection", "Dedicated onboarding"],
    liftAssist: true,
  },
} as const;

type PaidPlanId = keyof typeof PLAN_CONFIG;

const PAID_PLANS = [PLAN_CONFIG.starter, PLAN_CONFIG.growth, PLAN_CONFIG.scale];

// ---------------------------------------------------------------------------
// Loader — also handles billing callback (?charge_id=xxx)
// ---------------------------------------------------------------------------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  const { shop: shopDomain, setCookie, admin } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { billingPlan: true },
  });

  // Handle post-approval redirect from Shopify
  if (chargeId && shop) {
    try {
      const gid = `gid://shopify/AppSubscription/${chargeId}`;
      const resp = await admin.graphql(`
        query GetSubscription($id: ID!) {
          node(id: $id) {
            ... on AppSubscription {
              id
              status
              name
            }
          }
        }
      `, { variables: { id: gid } });

      const { data: gqlData } = await resp.json();
      const sub = gqlData?.node;

      if (sub?.status === "ACTIVE") {
        // Match by either monthly or yearly plan name
        const matched = PAID_PLANS.find(
          (p) => sub.name === p.shopifyName || sub.name === p.shopifyNameYearly
        );
        const isYearly = matched ? sub.name === matched.shopifyNameYearly : false;
        const periodDays = isYearly ? 365 : 30;
        if (matched) {
          await prisma.billingPlan.upsert({
            where: { shopId: shop.id },
            create: {
              shopId: shop.id,
              shopifyChargeId: chargeId,
              planName: matched.id,
              monthlyVisitorCap: matched.visitorCap,
              trialEndsAt: null,
              currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000),
              status: "active",
              liftAssistEnabled: matched.liftAssist,
            },
            update: {
              shopifyChargeId: chargeId,
              planName: matched.id,
              monthlyVisitorCap: matched.visitorCap,
              trialEndsAt: null,
              currentPeriodEnd: new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000),
              status: "active",
              liftAssistEnabled: matched.liftAssist,
            },
          });
        }
      }
    } catch (err) {
      console.error("[billing] charge callback error:", err);
    }

    // Redirect to clean URL
    throw redirect("/dashboard/billing", { headers: { "Set-Cookie": setCookie } });
  }

  const plan = shop?.billingPlan;
  const periodStart = plan?.currentPeriodEnd
    ? new Date(plan.currentPeriodEnd.getTime() - 30 * 24 * 60 * 60 * 1000)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const visitorCount = shop
    ? await prisma.visitor.count({ where: { shopId: shop.id, firstSeenAt: { gte: periodStart } } })
    : 0;

  const isPaidActive = !!plan && plan.status === "active" && plan.planName !== "free_trial";

  return data({
    shopDomain,
    myshopifyDomain: shop?.myshopifyDomain ?? shopDomain,
    planName: plan?.planName ?? "free_trial",
    trialEndsAt: plan?.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: plan?.currentPeriodEnd?.toISOString() ?? null,
    status: plan?.status ?? "active",
    monthlyVisitorCap: plan?.monthlyVisitorCap ?? 10_000,
    liftAssistEnabled: plan?.liftAssistEnabled ?? false,
    visitorCount,
    isPaidActive,
  }, { headers: { "Set-Cookie": setCookie } });
};

// ---------------------------------------------------------------------------
// Action — create Shopify subscription and redirect to confirmation URL
// ---------------------------------------------------------------------------
export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  const { shop: shopDomain, setCookie, admin } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return data({ error: "Shop not found" }, { headers: { "Set-Cookie": setCookie } });

  if (intent === "upgrade") {
    const planId = String(formData.get("planId") ?? "") as PaidPlanId;
    const yearly = formData.get("yearly") === "true";
    const plan = PLAN_CONFIG[planId];
    if (!plan) return data({ error: "Invalid plan" }, { headers: { "Set-Cookie": setCookie } });

    const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
    const returnUrl = `${appUrl}/dashboard/billing?shop=${shop.myshopifyDomain ?? shopDomain}`;
    const isTest = process.env.NODE_ENV !== "production";

    const monthlyEquiv = yearly ? Math.round(plan.price * (1 - YEARLY_DISCOUNT)) : plan.price;
    const annualTotal = Math.round(monthlyEquiv * 12);
    const subscriptionName = yearly ? plan.shopifyNameYearly : plan.shopifyName;
    const interval = yearly ? "ANNUAL" : "EVERY_30_DAYS";
    const chargeAmount = yearly ? annualTotal : plan.price;

    // Determine if this is an upgrade or downgrade to set replacementBehavior
    const existingPlan = shop.billingPlan;
    const isExistingPaid = !!existingPlan && existingPlan.status === "active" && existingPlan.planName !== "free_trial";
    const existingPrice = isExistingPaid ? (PLAN_CONFIG[existingPlan.planName as PaidPlanId]?.price ?? 0) : 0;
    const isUpgrade = plan.price > existingPrice;
    const replacementBehavior = isUpgrade ? "APPLY_IMMEDIATELY" : "STANDARD";

    // Only pass trialDays for new (non-paid) subscribers
    const trialDays = isExistingPaid ? undefined : plan.trialDays;

    try {
      const resp = await admin.graphql(`
        mutation CreateSubscription($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int, $test: Boolean, $replacementBehavior: AppSubscriptionReplacementBehavior) {
          appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, trialDays: $trialDays, test: $test, replacementBehavior: $replacementBehavior) {
            appSubscription { id status }
            confirmationUrl
            userErrors { field message }
          }
        }
      `, {
        variables: {
          name: subscriptionName,
          returnUrl,
          trialDays,
          test: isTest,
          replacementBehavior,
          lineItems: [{
            plan: {
              appRecurringPricingDetails: {
                price: { amount: chargeAmount, currencyCode: "USD" },
                interval,
              },
            },
          }],
        },
      });

      const { data: gqlData } = await resp.json();
      const result = gqlData?.appSubscriptionCreate;

      if (result?.userErrors?.length) {
        const msg = result.userErrors.map((e: { message: string }) => e.message).join(", ");
        console.error("[billing] userErrors:", msg);
        return data({ error: msg }, { headers: { "Set-Cookie": setCookie } });
      }

      if (result?.confirmationUrl) {
        throw redirect(result.confirmationUrl, { headers: { "Set-Cookie": setCookie } });
      }
    } catch (err: unknown) {
      // Re-throw redirects
      if (err instanceof Response) throw err;
      console.error("[billing] subscription create error:", err);
      return data({ error: "Failed to create subscription. Please try again." }, { headers: { "Set-Cookie": setCookie } });
    }
  }

  if (intent === "cancel") {
    const plan = shop.billingPlan ? await prisma.billingPlan.findUnique({ where: { shopId: shop.id } }) : null;
    if (plan?.shopifyChargeId) {
      try {
        await admin.graphql(`
          mutation CancelSubscription($id: ID!) {
            appSubscriptionCancel(id: $id) {
              appSubscription { id status }
              userErrors { field message }
            }
          }
        `, { variables: { id: `gid://shopify/AppSubscription/${plan.shopifyChargeId}` } });
      } catch (err) {
        console.error("[billing] cancel error:", err);
      }
    }
    await prisma.billingPlan.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, planName: "free_trial", monthlyVisitorCap: 50_000, status: "cancelled" },
      update: { planName: "free_trial", monthlyVisitorCap: 50_000, status: "cancelled", shopifyChargeId: null },
    });
    return data({ ok: true }, { headers: { "Set-Cookie": setCookie } });
  }

  return data({ error: "Unknown intent" }, { headers: { "Set-Cookie": setCookie } });
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const CHECK = (
  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
    <path d="M2 6l3 3 5-5" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function BillingPage() {
  const {
    planName, trialEndsAt, currentPeriodEnd, status,
    monthlyVisitorCap, liftAssistEnabled, visitorCount, isPaidActive,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<{ error?: string; ok?: boolean }>();
  const upgrading = fetcher.state !== "idle";
  const [yearly, setYearly] = React.useState(false);

  const usagePct = Math.min((visitorCount / monthlyVisitorCap) * 100, 100);
  const daysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000))
    : null;

  const isFree = planName === "free_trial";

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 2rem", letterSpacing: "-0.03em", color: "#111" }}>Billing</h1>

      {/* Current plan */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>Current plan</div>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
            <div>
              <div style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111", letterSpacing: "-0.02em", textTransform: "capitalize" }}>
                {planName.replace(/_/g, " ")}
              </div>
              {daysLeft !== null && (
                <div style={{ fontSize: "0.8125rem", color: daysLeft < 3 ? "#dc2626" : "#d97706", marginTop: "0.25rem" }}>
                  {daysLeft > 0 ? `${daysLeft} days left in trial` : "Trial ended"}
                </div>
              )}
              {currentPeriodEnd && !trialEndsAt && (
                <div style={{ fontSize: "0.8125rem", color: "#999", marginTop: "0.25rem" }}>
                  Renews {new Date(currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </div>
              )}
            </div>
            <span style={{ fontSize: "0.75rem", color: status === "active" ? "#16a34a" : "#d97706", background: status === "active" ? "#f0fdf4" : "#fffbeb", borderRadius: 5, padding: "0.2rem 0.6rem", fontWeight: 500 }}>
              {status}
            </span>
          </div>

          {/* Visitor usage bar */}
          <div style={{ marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#777" }}>Visitor usage this month</span>
              <span style={{ fontSize: "0.75rem", color: "#111", fontWeight: 500 }}>
                {visitorCount.toLocaleString()} / {monthlyVisitorCap.toLocaleString()}
              </span>
            </div>
            <div style={{ height: 6, background: "#f3f3f3", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${usagePct}%`, background: usagePct > 90 ? "#dc2626" : "#111", borderRadius: 3, transition: "width 0.3s" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "#777" }}>
              Lift Assist: <strong style={{ color: liftAssistEnabled ? "#16a34a" : "#999" }}>{liftAssistEnabled ? "Enabled" : "Disabled"}</strong>
            </span>
            {!isFree && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="cancel" />
                <button type="submit" disabled={upgrading} style={{ fontSize: "0.75rem", color: "#dc2626", background: "none", border: "none", cursor: upgrading ? "default" : "pointer", padding: 0 }}>
                  Cancel plan
                </button>
              </fetcher.Form>
            )}
          </div>

          {fetcher.data?.error && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "#dc2626" }}>{fetcher.data.error}</div>
          )}
        </div>
      </section>

      {/* Free tier callout */}
      {isFree && (
        <div style={{ marginBottom: "2rem", padding: "1rem 1.25rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
          <div style={{ fontSize: "0.8125rem", color: "#92400e", fontWeight: 600, marginBottom: "0.2rem" }}>Free plan limits</div>
          <p style={{ fontSize: "0.8125rem", color: "#78350f", margin: 0, lineHeight: 1.5 }}>
            10,000 visitors/month · 3 running experiments · Theme and URL redirect tests only.
            Upgrade to unlock all test types, unlimited experiments, and higher traffic limits.
          </p>
        </div>
      )}

      {/* Plan cards */}
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em" }}>Plans</div>
          {/* Billing toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
            <span style={{ fontSize: "0.8125rem", color: yearly ? "#aaa" : "#111", fontWeight: yearly ? 400 : 500 }}>Monthly</span>
            <button
              onClick={() => setYearly(!yearly)}
              style={{
                width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer", padding: 0,
                background: yearly ? "#111" : "#e9e9e9", position: "relative", transition: "background 0.2s",
              }}
            >
              <span style={{
                position: "absolute", top: 3, left: yearly ? 21 : 3,
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", display: "block",
              }} />
            </button>
            <span style={{ fontSize: "0.8125rem", color: yearly ? "#111" : "#aaa", fontWeight: yearly ? 500 : 400 }}>
              Yearly
            </span>
            {yearly && (
              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#16a34a", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, padding: "0.1rem 0.45rem" }}>
                Save 25%
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
          {PAID_PLANS.map((plan) => {
            const isCurrent = plan.id === planName;
            const isHighlighted = plan.id === "growth";
            const currentPrice = isPaidActive ? (PLAN_CONFIG[planName as PaidPlanId]?.price ?? 0) : 0;
            const isUpgrade = plan.price > currentPrice;
            const btnLabel = isCurrent ? "Current plan" : isPaidActive ? (isUpgrade ? "Upgrade" : "Downgrade") : "Start free trial";
            return (
              <div
                key={plan.id}
                style={{
                  border: isCurrent ? "1.5px solid #111" : isHighlighted ? "1.5px solid #3a7968" : "1px solid #e9e9e9",
                  borderRadius: 8,
                  padding: "1.25rem",
                  position: "relative",
                  background: isHighlighted && !isCurrent ? "#f2f8f6" : "#fff",
                }}
              >
                {isCurrent && (
                  <span style={{ position: "absolute", top: "0.75rem", right: "0.75rem", fontSize: "0.65rem", fontWeight: 600, color: "#fff", background: "#111", borderRadius: 4, padding: "0.15rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</span>
                )}
                {isHighlighted && !isCurrent && (
                  <span style={{ position: "absolute", top: "0.75rem", right: "0.75rem", fontSize: "0.65rem", fontWeight: 600, color: "#3a7968", background: "#edf7f4", borderRadius: 4, padding: "0.15rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Popular</span>
                )}

                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#111", marginBottom: "0.2rem" }}>{plan.name}</div>
                <div style={{ marginBottom: yearly ? "0.1rem" : "0.75rem" }}>
                  <span style={{ fontSize: "1.375rem", fontWeight: 700, color: "#111", letterSpacing: "-0.03em" }}>
                    ${yearly ? Math.round(plan.price * (1 - YEARLY_DISCOUNT)) : plan.price}
                  </span>
                  <span style={{ fontSize: "0.8125rem", color: "#aaa" }}>/mo</span>
                  {yearly && (
                    <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", color: "#aaa", textDecoration: "line-through" }}>${plan.price}</span>
                  )}
                </div>
                {yearly && (
                  <div style={{ fontSize: "0.7rem", color: "#16a34a", fontWeight: 500, marginBottom: "0.75rem" }}>
                    ${Math.round(plan.price * (1 - YEARLY_DISCOUNT) * 12)}/year billed annually
                  </div>
                )}

                <div style={{ fontSize: "0.75rem", color: "#555", marginBottom: "0.25rem" }}>
                  <strong>{plan.visitorCap.toLocaleString()}</strong> visitors/mo
                </div>
                <div style={{ fontSize: "0.75rem", color: "#555", marginBottom: "0.75rem" }}>
                  <strong>{plan.experimentsLabel}</strong> experiments
                </div>

                <ul style={{ margin: "0 0 1rem", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ fontSize: "0.75rem", color: "#555", display: "flex", alignItems: "flex-start", gap: "0.35rem" }}>
                      {CHECK} {f}
                    </li>
                  ))}
                </ul>

                {!isPaidActive && (
                  <div style={{ fontSize: "0.7rem", color: "#aaa", marginBottom: "0.75rem" }}>
                    {plan.trialDays}-day free trial
                  </div>
                )}

                {!isCurrent && (
                  <fetcher.Form method="post">
                    <input type="hidden" name="intent" value="upgrade" />
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="yearly" value={String(yearly)} />
                    <button
                      type="submit"
                      disabled={upgrading}
                      style={{
                        width: "100%",
                        padding: "0.45rem",
                        background: isHighlighted ? "#3a7968" : "#111",
                        color: "#fff",
                        border: "none",
                        borderRadius: 6,
                        fontSize: "0.8125rem",
                        fontWeight: 500,
                        cursor: upgrading ? "default" : "pointer",
                        opacity: upgrading ? 0.6 : 1,
                      }}
                    >
                      {upgrading ? "Redirecting…" : btnLabel}
                    </button>
                  </fetcher.Form>
                )}
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: "0.75rem", color: "#bbb", marginTop: "0.875rem", textAlign: "center" }}>
          All plans billed monthly. Cancel anytime. Charges processed by Shopify.
        </p>
      </section>
    </div>
  );
}
