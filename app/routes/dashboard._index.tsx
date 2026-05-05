import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import type { ExperimentStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    include: {
      experiments: {
        where: { status: { in: ["RUNNING", "PAUSED", "SCHEDULED"] } },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { variants: true },
      },
      billingPlan: true,
    },
  });

  const shopId = shop?.id ?? "";
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [activeCount, totalCount, visitorCount, revenueAgg, recentEvents] = await Promise.all([
    prisma.experiment.count({ where: { shopId, status: "RUNNING" } }),
    prisma.experiment.count({ where: { shopId } }),
    prisma.visitor.count({ where: { shopId } }),
    prisma.order.aggregate({
      where: { shopId, experimentId: { not: null } },
      _sum: { revenue: true },
    }),
    shopId
      ? prisma.event.findMany({
          where: { shopId, occurredAt: { gte: sevenDaysAgo } },
          select: { occurredAt: true },
        })
      : Promise.resolve([]),
  ]);

  // Build 7-day sparkline
  const dayMap: Record<string, number> = {};
  for (const ev of recentEvents) {
    const key = new Date(ev.occurredAt).toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + 1;
  }
  const eventSparkline = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: dayMap[key] ?? 0 };
  });

  return Response.json({
    shopDomain,
    activeExperiments: activeCount,
    totalExperiments: totalCount,
    visitorsTested: visitorCount,
    attributedRevenue: revenueAgg._sum.revenue ?? 0,
    currency: shop?.currency ?? "USD",
    recentExperiments: shop?.experiments ?? [],
    billingPlan: shop?.billingPlan?.planName ?? "free_trial",
    eventSparkline,
  }, { headers: { "Set-Cookie": setCookie } });
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "#16a34a",
  PAUSED: "#d97706",
  DRAFT: "#6b7280",
  COMPLETED: "#2563eb",
  ARCHIVED: "#9ca3af",
  SCHEDULED: "#7c3aed",
};

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 160, H = 40, PAD = 2;
  const pts = data.map((d, i) => {
    const x = PAD + (i / (data.length - 1)) * (W - PAD * 2);
    const y = H - PAD - (d.count / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <path d={"M" + pts.join(" L")} fill="none" stroke="#111" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardIndex() {
  const { shopDomain, activeExperiments, totalExperiments, visitorsTested, attributedRevenue, currency, recentExperiments, billingPlan, eventSparkline } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const totalEvents = eventSparkline.reduce((s: number, d: { count: number }) => s + d.count, 0);
  const fmtRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(attributedRevenue);

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 960, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>
            Overview
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0.25rem 0 0" }}>{shopDomain}</p>
        </div>
        <button
          onClick={() => navigate("/dashboard/experiments/new")}
          style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", letterSpacing: "-0.01em" }}
        >
          + New experiment
        </button>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginBottom: "1.5rem", border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
        {[
          { label: "Running", value: String(activeExperiments) },
          { label: "Total experiments", value: String(totalExperiments) },
          { label: "Visitors tested", value: visitorsTested.toLocaleString() },
          { label: "Plan", value: billingPlan.replace(/_/g, " ") },
        ].map((stat, i) => (
          <div key={stat.label} style={{ padding: "1.25rem 1.5rem", borderRight: i < 3 ? "1px solid #e9e9e9" : "none" }}>
            <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>{stat.label}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111" }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Analytics row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2.5rem" }}>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>Events · last 7 days</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111" }}>{totalEvents.toLocaleString()}</div>
            </div>
          </div>
          <Sparkline data={eventSparkline} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem" }}>
            <span style={{ fontSize: "0.65rem", color: "#ccc" }}>{(eventSparkline as {date:string}[])[0]?.date.slice(5)}</span>
            <span style={{ fontSize: "0.65rem", color: "#ccc" }}>{(eventSparkline as {date:string}[])[6]?.date.slice(5)}</span>
          </div>
        </div>

        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>Attributed revenue</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111", marginBottom: "0.5rem" }}>{fmtRevenue}</div>
            <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.5 }}>Revenue from orders attributed to a running experiment via cart tagging.</div>
          </div>
          <button
            onClick={() => navigate("/dashboard/results")}
            style={{ alignSelf: "flex-start", marginTop: "1rem", fontSize: "0.75rem", color: "#111", background: "none", border: "1px solid #e9e9e9", borderRadius: 5, padding: "0.3rem 0.75rem", cursor: "pointer" }}
          >
            View results →
          </button>
        </div>
      </div>

      {/* Active experiments table */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "#111", letterSpacing: "-0.01em" }}>Active experiments</h2>
          <button onClick={() => navigate("/dashboard/experiments")} style={{ fontSize: "0.75rem", color: "#999", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            View all →
          </button>
        </div>

        {recentExperiments.length === 0 ? (
          <div style={{ border: "1px dashed #e9e9e9", borderRadius: 8, padding: "3rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "#999", margin: "0 0 1rem" }}>No experiments yet</p>
            <button onClick={() => navigate("/dashboard/experiments/new")} style={{ fontSize: "0.8125rem", color: "#111", background: "none", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.4rem 0.875rem", cursor: "pointer" }}>
              Create your first experiment
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e9e9e9" }}>
                {["Name", "Type", "Status", "Variants", "Updated"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontWeight: 500, color: "#999", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentExperiments.map((exp) => (
                <tr key={exp.id} onClick={() => navigate(`/dashboard/experiments/${exp.id}`)} style={{ borderBottom: "1px solid #f3f3f3", cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ padding: "0.75rem", fontWeight: 500, color: "#111" }}>{exp.name}</td>
                  <td style={{ padding: "0.75rem", color: "#777" }}>{exp.type.replace(/_/g, " ")}</td>
                  <td style={{ padding: "0.75rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: STATUS_COLORS[exp.status] ?? "#999" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[exp.status] ?? "#999", display: "inline-block" }} />
                      {exp.status.toLowerCase()}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem", color: "#777" }}>{exp.variants.length}</td>
                  <td style={{ padding: "0.75rem", color: "#aaa" }}>{new Date(exp.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
