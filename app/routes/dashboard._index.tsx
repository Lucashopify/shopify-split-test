import { data, useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

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

  const [
    activeCount,
    totalCount,
    visitorCount,
    revenueAgg,
    recentEvents,
    recentOrders,
    statusCounts,
    funnelCounts,
  ] = await Promise.all([
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
          select: { occurredAt: true, type: true },
        })
      : Promise.resolve([]),
    shopId
      ? prisma.order.findMany({
          where: { shopId, processedAt: { gte: sevenDaysAgo } },
          select: { processedAt: true, revenue: true },
        })
      : Promise.resolve([]),
    shopId
      ? prisma.experiment.groupBy({
          by: ["status"],
          where: { shopId },
          _count: { id: true },
        })
      : Promise.resolve([]),
    shopId
      ? prisma.event.groupBy({
          by: ["type"],
          where: { shopId, occurredAt: { gte: sevenDaysAgo } },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  // 7-day event sparkline
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

  // 7-day revenue sparkline
  const revMap: Record<string, number> = {};
  for (const o of recentOrders) {
    const key = new Date(o.processedAt).toISOString().slice(0, 10);
    revMap[key] = (revMap[key] ?? 0) + (o.revenue ?? 0);
  }
  const revenueSparkline = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, revenue: revMap[key] ?? 0 };
  });

  // Events by type
  const typeOrder = ["PAGE_VIEW", "ADD_TO_CART", "INITIATE_CHECKOUT", "PURCHASE", "CLICK", "CUSTOM"] as const;
  const eventsByType = typeOrder.map((t) => ({
    type: t,
    count: funnelCounts.find((f) => f.type === t)?._count.id ?? 0,
  }));

  // Experiment status breakdown
  const experimentsByStatus = statusCounts.map((s) => ({
    status: s.status,
    count: s._count.id,
  }));

  // Conversion funnel (distinct visitor-level counts)
  const pageViews = eventsByType.find((e) => e.type === "PAGE_VIEW")?.count ?? 0;
  const atcCount = eventsByType.find((e) => e.type === "ADD_TO_CART")?.count ?? 0;
  const checkoutCount = eventsByType.find((e) => e.type === "INITIATE_CHECKOUT")?.count ?? 0;
  const purchaseCount = eventsByType.find((e) => e.type === "PURCHASE")?.count ?? 0;

  return data({
    shopDomain,
    activeExperiments: activeCount,
    totalExperiments: totalCount,
    visitorsTested: visitorCount,
    attributedRevenue: revenueAgg._sum.revenue ?? 0,
    currency: shop?.currency ?? "USD",
    recentExperiments: shop?.experiments ?? [],
    billingPlan: shop?.billingPlan?.planName ?? "free_trial",
    eventSparkline,
    revenueSparkline,
    eventsByType,
    experimentsByStatus,
    funnel: [
      { label: "Page views", count: pageViews },
      { label: "Add to cart", count: atcCount },
      { label: "Checkout", count: checkoutCount },
      { label: "Purchase", count: purchaseCount },
    ],
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

const TYPE_COLORS: Record<string, string> = {
  PAGE_VIEW: "#6366f1",
  ADD_TO_CART: "#f59e0b",
  INITIATE_CHECKOUT: "#3b82f6",
  PURCHASE: "#16a34a",
  CLICK: "#8b5cf6",
  CUSTOM: "#9ca3af",
};

const TYPE_LABELS: Record<string, string> = {
  PAGE_VIEW: "Page views",
  ADD_TO_CART: "Add to cart",
  INITIATE_CHECKOUT: "Checkout",
  PURCHASE: "Purchase",
  CLICK: "Click",
  CUSTOM: "Custom",
};

function Sparkline({ points, color = "#111" }: { points: number[]; color?: string }) {
  const max = Math.max(...points, 1);
  const W = 160, H = 44, PAD = 2;
  const pts = points.map((v, i) => {
    const x = PAD + (i / Math.max(points.length - 1, 1)) * (W - PAD * 2);
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  // fill area
  const fillPts = [
    `${PAD},${H - PAD}`,
    ...pts,
    `${(W - PAD).toFixed(1)},${H - PAD}`,
  ].join(" ");
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polygon points={fillPts} fill={color} fillOpacity={0.08} />
      <path d={"M" + pts.join(" L")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function FunnelChart({ steps }: { steps: { label: string; count: number }[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.5rem" }}>
      {steps.map((step, i) => {
        const pct = (step.count / max) * 100;
        const convRate = i > 0 && steps[i - 1].count > 0
          ? ((step.count / steps[i - 1].count) * 100).toFixed(1)
          : null;
        const colors = ["#6366f1", "#f59e0b", "#3b82f6", "#16a34a"];
        return (
          <div key={step.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#555" }}>{step.label}</span>
              <span style={{ fontSize: "0.75rem", color: "#111", fontWeight: 500 }}>
                {step.count.toLocaleString()}
                {convRate && <span style={{ color: "#aaa", fontWeight: 400, marginLeft: "0.4rem" }}>({convRate}%)</span>}
              </span>
            </div>
            <div style={{ background: "#f3f3f3", borderRadius: 4, height: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: colors[i] ?? "#6366f1", borderRadius: 4, transition: "width 0.3s" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ bars }: { bars: { label: string; count: number; color: string }[] }) {
  const max = Math.max(...bars.map((b) => b.count), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem", marginTop: "0.5rem" }}>
      {bars.filter((b) => b.count > 0).map((bar) => (
        <div key={bar.label}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#555" }}>{bar.label}</span>
            <span style={{ fontSize: "0.75rem", color: "#111", fontWeight: 500 }}>{bar.count.toLocaleString()}</span>
          </div>
          <div style={{ background: "#f3f3f3", borderRadius: 4, height: 6, overflow: "hidden" }}>
            <div style={{ width: `${(bar.count / max) * 100}%`, height: "100%", background: bar.color, borderRadius: 4 }} />
          </div>
        </div>
      ))}
      {bars.every((b) => b.count === 0) && (
        <p style={{ fontSize: "0.75rem", color: "#bbb", margin: 0 }}>No data yet</p>
      )}
    </div>
  );
}

function StatusDonut({ slices }: { slices: { status: string; count: number }[] }) {
  const total = slices.reduce((s, v) => s + v.count, 0);
  if (total === 0) return <p style={{ fontSize: "0.75rem", color: "#bbb", margin: "0.5rem 0 0" }}>No experiments yet</p>;

  const R = 30, CX = 40, CY = 40, strokeWidth = 12;
  const circumference = 2 * Math.PI * R;

  let offset = 0;
  const arcs = slices.map((s) => {
    const fraction = s.count / total;
    const arc = { status: s.status, count: s.count, dashArray: fraction * circumference, dashOffset: -offset };
    offset += fraction * circumference;
    return arc;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", marginTop: "0.5rem" }}>
      <svg width={80} height={80} viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="#f3f3f3" strokeWidth={strokeWidth} />
        {arcs.map((arc) => (
          <circle
            key={arc.status}
            cx={CX} cy={CY} r={R}
            fill="none"
            stroke={STATUS_COLORS[arc.status] ?? "#ccc"}
            strokeWidth={strokeWidth}
            strokeDasharray={`${arc.dashArray} ${circumference}`}
            strokeDashoffset={arc.dashOffset}
            style={{ transform: "rotate(-90deg)", transformOrigin: `${CX}px ${CY}px` }}
          />
        ))}
        <text x={CX} y={CY + 5} textAnchor="middle" style={{ fontSize: 14, fontWeight: 600, fill: "#111" }}>{total}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {slices.map((s) => (
          <div key={s.status} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem", color: "#555" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[s.status] ?? "#ccc", flexShrink: 0 }} />
            <span style={{ textTransform: "capitalize" }}>{s.status.toLowerCase()}</span>
            <span style={{ color: "#aaa", marginLeft: "auto", paddingLeft: "0.75rem" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ points, color = "#111" }: { points: { date: string; value: number }[]; color?: string }) {
  const max = Math.max(...points.map((p) => p.value), 1);
  const W = 320, H = 64, PAD = 4;
  const coords = points.map((p, i) => ({
    x: PAD + (i / Math.max(points.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - (p.value / max) * (H - PAD * 2),
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const fillPts = [
    `${PAD},${H - PAD}`,
    ...coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    `${(W - PAD).toFixed(1)},${H - PAD}`,
  ].join(" ");
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block", overflow: "visible" }}>
        {/* Gridlines */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H - PAD - f * (H - PAD * 2)} y2={H - PAD - f * (H - PAD * 2)} stroke="#f0f0f0" strokeWidth={1} />
        ))}
        <polygon points={fillPts} fill={color} fillOpacity={0.08} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={2.5} fill={color} />
        ))}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
        {points.map((p) => (
          <span key={p.date} style={{ fontSize: "0.6rem", color: "#ccc" }}>{p.date.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

export default function DashboardIndex() {
  const {
    shopDomain, activeExperiments, totalExperiments, visitorsTested,
    attributedRevenue, currency, recentExperiments, billingPlan,
    eventSparkline, revenueSparkline, eventsByType, experimentsByStatus, funnel,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const totalEvents = eventSparkline.reduce((s: number, d: { count: number }) => s + d.count, 0);
  const totalRevenue7d = revenueSparkline.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0);
  const fmtRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(attributedRevenue);
  const fmt7dRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(totalRevenue7d);

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1040, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>Overview</h1>
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

      {/* Row 1: Events sparkline + Revenue sparkline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Events 7d */}
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>Events · last 7 days</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111", marginBottom: "0.75rem" }}>{totalEvents.toLocaleString()}</div>
          <LineChart
            points={eventSparkline.map((d: { date: string; count: number }) => ({ date: d.date, value: d.count }))}
            color="#6366f1"
          />
        </div>

        {/* Revenue 7d */}
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>Revenue attributed · last 7 days</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111", marginBottom: "0.75rem" }}>{fmt7dRevenue}</div>
          <LineChart
            points={revenueSparkline.map((d: { date: string; revenue: number }) => ({ date: d.date, value: d.revenue }))}
            color="#16a34a"
          />
        </div>
      </div>

      {/* Row 2: Funnel + Events by type */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        {/* Conversion funnel */}
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.1rem" }}>Conversion funnel · 7 days</div>
          <div style={{ fontSize: "0.75rem", color: "#bbb", marginBottom: "0.75rem" }}>Across all experiments</div>
          <FunnelChart steps={funnel} />
        </div>

        {/* Events by type */}
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.1rem" }}>Events by type · 7 days</div>
          <div style={{ fontSize: "0.75rem", color: "#bbb", marginBottom: "0.75rem" }}>All tracked event types</div>
          <BarChart
            bars={eventsByType.map((e: { type: string; count: number }) => ({
              label: TYPE_LABELS[e.type] ?? e.type,
              count: e.count,
              color: TYPE_COLORS[e.type] ?? "#9ca3af",
            }))}
          />
        </div>
      </div>

      {/* Row 3: Experiment status breakdown + Total revenue card */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2.5rem" }}>
        {/* Status breakdown */}
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
          <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.1rem" }}>Experiments by status</div>
          <div style={{ fontSize: "0.75rem", color: "#bbb", marginBottom: "0.5rem" }}>All time</div>
          <StatusDonut slices={experimentsByStatus} />
        </div>

        {/* Total attributed revenue */}
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>Total attributed revenue</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111", marginBottom: "0.5rem" }}>{fmtRevenue}</div>
            <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.5 }}>Revenue from orders matched to an experiment variant via first-party visitor tracking.</div>
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
