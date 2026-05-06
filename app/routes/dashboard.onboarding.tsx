import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { getPlanLimits } from "../lib/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, setCookie } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const [experimentCount, runningCount, eventCount, planLimits] = await Promise.all([
    prisma.experiment.count({ where: { shopId: shop.id } }),
    prisma.experiment.count({ where: { shopId: shop.id, status: "RUNNING" } }),
    prisma.event.count({ where: { shopId: shop.id }, take: 1 }),
    getPlanLimits(shop.id),
  ]);

  return Response.json(
    {
      shop: session.shop,
      embedActive: eventCount > 0,
      hasExperiment: experimentCount > 0,
      hasRunning: runningCount > 0,
      isPaid: planLimits.planName !== "free_trial",
    },
    { headers: { "Set-Cookie": setCookie } },
  );
};

const checkStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontSize: "0.7rem",
  fontWeight: 700,
};

export default function Onboarding() {
  const { shop, embedActive, hasExperiment, hasRunning, isPaid } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const themeEditorUrl = `https://${shop}/admin/themes/current/editor?context=apps`;
  const completedCount = [embedActive, hasExperiment, hasRunning, isPaid].filter(Boolean).length;
  const allDone = completedCount === 4;

  const steps = [
    {
      done: embedActive,
      number: "1",
      title: "Enable the Split Test embed",
      description:
        "Open your Theme Editor, go to App embeds, and toggle on Split Tester. This loads the tracking script on your storefront — without it, no tests will run.",
      note: embedActive
        ? "Embed is active — we've received your first storefront event."
        : "After enabling, visit any page on your store. The status here updates automatically.",
      cta: "Open Theme Editor",
      action: () => window.open(themeEditorUrl, "_blank"),
    },
    {
      done: hasExperiment,
      number: "2",
      title: "Create your first experiment",
      description:
        "Choose what to test — a theme, price, section content, URL redirect, or page template. Set a hypothesis, configure your variants, and define your traffic split.",
      note: hasExperiment ? "You have at least one experiment created." : null,
      cta: "Create experiment",
      action: () => navigate("/dashboard/experiments/new"),
    },
    {
      done: hasRunning,
      number: "3",
      title: "Start your experiment",
      description:
        "Once your variants are configured, hit Start. Visitors are bucketed deterministically and results roll in automatically. Run for at least 7 days to account for day-of-week variation.",
      note: hasRunning ? "You have a running experiment — results are collecting." : null,
      cta: "Go to experiments",
      action: () => navigate("/dashboard/experiments"),
    },
    {
      done: isPaid,
      number: "4",
      title: "Upgrade your plan",
      description:
        "The free plan supports 3 running experiments and 10,000 visitors/month. Upgrade to unlock all test types, unlimited experiments, audience segments, and higher traffic limits.",
      note: isPaid ? "You're on a paid plan — all features unlocked." : null,
      cta: "View plans",
      action: () => navigate("/dashboard/billing"),
    },
  ];

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 680, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.4rem", letterSpacing: "-0.03em", color: "#111" }}>
          Get started
        </h1>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#777" }}>
          Follow these steps to run your first A/B test.
        </p>

        {/* Progress bar */}
        <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#f3f3f3", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              borderRadius: 2,
              background: "#111",
              width: `${(completedCount / 4) * 100}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
          <span style={{ fontSize: "0.75rem", color: "#999", flexShrink: 0 }}>
            {completedCount} / 4 complete
          </span>
        </div>
      </div>

      {/* All done banner */}
      {allDone && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem", background: "#f3f3f3", border: "1px solid #e9e9e9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111", marginBottom: "0.2rem" }}>
              You're all set
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#555" }}>
              Your experiment is live. Check the Results tab to see data as it comes in.
            </div>
          </div>
          <button
            onClick={() => navigate("/dashboard/experiments")}
            style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
          >
            View experiments
          </button>
        </div>
      )}

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #e9e9e9",
              borderRadius: 10,
              padding: "1.25rem 1.5rem",
              background: step.done ? "#fafafa" : "#fff",
              display: "flex",
              gap: "1.125rem",
              alignItems: "flex-start",
            }}
          >
            <div style={{
              ...checkStyle,
              background: step.done ? "#111" : "#f3f3f3",
              color: step.done ? "#fff" : "#aaa",
              marginTop: "0.1rem",
            }}>
              {step.done ? "✓" : step.number}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "0.4rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111" }}>
                  {step.title}
                </div>
                {!step.done && (
                  <button
                    onClick={step.action}
                    style={{ padding: "0.35rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                  >
                    {step.cta}
                  </button>
                )}
              </div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "#666", lineHeight: 1.6 }}>
                {step.description}
              </p>
              {step.note && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: step.done ? "#555" : "#aaa" }}>
                  {step.done ? "✓ " : ""}{step.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Help callout */}
      <div style={{ marginTop: "2rem", padding: "1rem 1.25rem", background: "#f9fafb", border: "1px solid #e9e9e9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111", marginBottom: "0.2rem" }}>Need help?</div>
          <div style={{ fontSize: "0.75rem", color: "#aaa" }}>Learn how each experiment type works and how to read your results.</div>
        </div>
        <a
          href="mailto:support@splittester.com"
          style={{ padding: "0.35rem 0.875rem", background: "none", color: "#555", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer", textDecoration: "none", flexShrink: 0 }}
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
