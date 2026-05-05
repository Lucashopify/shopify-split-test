import { data, useLoaderData, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

const PLANS = [
  { id: "free_trial", name: "Free trial", price: "$0", visitorCap: "50,000", experiments: "3 running", features: ["Theme tests", "URL redirect tests", "Basic analytics"] },
  { id: "starter", name: "Starter", price: "$29/mo", visitorCap: "100,000", experiments: "10 running", features: ["All test types", "Full analytics", "Segments"] },
  { id: "growth", name: "Growth", price: "$79/mo", visitorCap: "500,000", experiments: "Unlimited", features: ["All Starter features", "Lift Assist AI", "Priority support"] },
  { id: "scale", name: "Scale", price: "$199/mo", visitorCap: "2,000,000", experiments: "Unlimited", features: ["All Growth features", "SRM detection", "Dedicated onboarding"] },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: { billingPlan: true },
  });

  const visitorCount = shop
    ? await prisma.visitor.count({ where: { shopId: shop.id } })
    : 0;

  const plan = shop?.billingPlan;

  return data({
    planName: plan?.planName ?? "free_trial",
    trialEndsAt: plan?.trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: plan?.currentPeriodEnd?.toISOString() ?? null,
    status: plan?.status ?? "active",
    monthlyVisitorCap: plan?.monthlyVisitorCap ?? 50000,
    liftAssistEnabled: plan?.liftAssistEnabled ?? false,
    visitorCount,
  }, { headers: { "Set-Cookie": setCookie } });
};

export default function BillingPage() {
  const { planName, trialEndsAt, currentPeriodEnd, status, monthlyVisitorCap, liftAssistEnabled, visitorCount } =
    useLoaderData<typeof loader>();

  const usagePct = Math.min((visitorCount / monthlyVisitorCap) * 100, 100);
  const daysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)) : null;

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 2rem", letterSpacing: "-0.03em", color: "#111" }}>Billing</h1>

      {/* Current plan */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.75rem" }}>Current plan</h2>
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

          <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#777" }}>Lift Assist: <strong style={{ color: liftAssistEnabled ? "#16a34a" : "#999" }}>{liftAssistEnabled ? "Enabled" : "Disabled"}</strong></span>
          </div>
        </div>
      </section>

      {/* Plan comparison */}
      <section>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.75rem" }}>Plans</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
          {PLANS.map((plan) => {
            const isCurrent = plan.id === planName;
            return (
              <div key={plan.id} style={{ border: isCurrent ? "1.5px solid #111" : "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem", position: "relative" }}>
                {isCurrent && (
                  <span style={{ position: "absolute", top: "0.75rem", right: "0.75rem", fontSize: "0.65rem", fontWeight: 600, color: "#fff", background: "#111", borderRadius: 4, padding: "0.15rem 0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</span>
                )}
                <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "#111", marginBottom: "0.2rem" }}>{plan.name}</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111", letterSpacing: "-0.03em", marginBottom: "0.75rem" }}>{plan.price}</div>
                <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                  <li style={{ fontSize: "0.75rem", color: "#555", marginBottom: "0.3rem" }}>↑ {plan.visitorCap} visitors/mo</li>
                  <li style={{ fontSize: "0.75rem", color: "#555", marginBottom: "0.5rem" }}>↑ {plan.experiments}</li>
                  {plan.features.map((f) => (
                    <li key={f} style={{ fontSize: "0.75rem", color: "#777", marginBottom: "0.2rem" }}>· {f}</li>
                  ))}
                </ul>
                {!isCurrent && (
                  <button style={{ marginTop: "1rem", width: "100%", padding: "0.45rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}>
                    Upgrade
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
