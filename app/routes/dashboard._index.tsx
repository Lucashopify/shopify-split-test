import { data, redirect, useLoaderData, useNavigate, useSearchParams, type LoaderFunctionArgs } from "react-router";
import { useState, useRef, useCallback } from "react";
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

  // Redirect new merchants to onboarding on first visit
  if (shop) {
    const experimentCount = await prisma.experiment.count({ where: { shopId: shop.id } });
    if (experimentCount === 0) {
      throw redirect("/dashboard/onboarding", { headers: { "Set-Cookie": setCookie } });
    }
  }

  const shopId = shop?.id ?? "";
  const url = new URL(request.url);
  const range = Math.min(90, Math.max(7, parseInt(url.searchParams.get("range") ?? "7", 10)));
  const rangeStart = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

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
          where: { shopId, occurredAt: { gte: rangeStart } },
          select: { occurredAt: true, type: true },
        })
      : Promise.resolve([]),
    shopId
      ? prisma.order.findMany({
          where: { shopId, processedAt: { gte: rangeStart } },
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
          where: { shopId, occurredAt: { gte: rangeStart } },
          _count: { id: true },
        })
      : Promise.resolve([]),
  ]);

  // Event sparkline
  const dayMap: Record<string, number> = {};
  for (const ev of recentEvents) {
    const key = new Date(ev.occurredAt).toISOString().slice(0, 10);
    dayMap[key] = (dayMap[key] ?? 0) + 1;
  }
  const eventSparkline = Array.from({ length: range }, (_, i) => {
    const d = new Date(Date.now() - (range - 1 - i) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: dayMap[key] ?? 0 };
  });

  // Revenue sparkline
  const revMap: Record<string, number> = {};
  for (const o of recentOrders) {
    const key = new Date(o.processedAt).toISOString().slice(0, 10);
    revMap[key] = (revMap[key] ?? 0) + (o.revenue ?? 0);
  }
  const revenueSparkline = Array.from({ length: range }, (_, i) => {
    const d = new Date(Date.now() - (range - 1 - i) * 24 * 60 * 60 * 1000);
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

  // Conversion funnel
  const pageViews = eventsByType.find((e) => e.type === "PAGE_VIEW")?.count ?? 0;
  const atcCount = eventsByType.find((e) => e.type === "ADD_TO_CART")?.count ?? 0;
  const checkoutCount = eventsByType.find((e) => e.type === "INITIATE_CHECKOUT")?.count ?? 0;
  // Purchases come from the Order table (set by orders/paid webhook), not Event rows
  const purchaseCount = shopId
    ? await prisma.order.count({ where: { shopId, processedAt: { gte: rangeStart } } })
    : 0;

  return data({
    shopDomain,
    range,
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
  PAUSED: "#8b9299",
  DRAFT: "#9ca3af",
  COMPLETED: "#4b5563",
  ARCHIVED: "#d1d5db",
  SCHEDULED: "#6b7280",
};

const TYPE_COLORS: Record<string, string> = {
  PAGE_VIEW: "#3a7968",
  ADD_TO_CART: "#5a9b87",
  INITIATE_CHECKOUT: "#2d5e51",
  PURCHASE: "#7ab5a6",
  CLICK: "#1f4239",
  CUSTOM: "#9ecfc4",
};

const TYPE_LABELS: Record<string, string> = {
  PAGE_VIEW: "Page views",
  ADD_TO_CART: "Add to cart",
  INITIATE_CHECKOUT: "Checkout",
  PURCHASE: "Purchase",
  CLICK: "Click",
  CUSTOM: "Custom",
};


function FunnelChart({ steps }: { steps: { label: string; count: number }[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  const colors = ["#3a7968", "#5a9b87", "#2d5e51", "#7ab5a6"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginTop: "0.5rem" }}>
      {steps.map((step, i) => {
        const pct = (step.count / max) * 100;
        const convRate = i > 0 && steps[i - 1].count > 0
          ? ((step.count / steps[i - 1].count) * 100).toFixed(1)
          : null;
        const color = colors[i] ?? "#6366f1";
        return (
          <div key={step.label}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block", flexShrink: 0 }} />
                <span style={{ fontSize: "0.75rem", color: "#555" }}>{step.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {convRate && (
                  <span style={{ fontSize: "0.75rem", color: "#3a7968", fontWeight: 600 }}>
                    {convRate}%
                  </span>
                )}
                <span style={{ fontSize: "0.75rem", color: "#888", fontWeight: 400 }}>{step.count.toLocaleString()}</span>
              </div>
            </div>
            <div style={{ background: "#f0f0f0", borderRadius: 5, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${color}99, ${color})`, borderRadius: 5, transition: "width 0.4s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarChart({ bars }: { bars: { label: string; count: number; color: string }[] }) {
  const max = Math.max(...bars.map((b) => b.count), 1);
  const visible = bars.filter((b) => b.count > 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", marginTop: "0.5rem" }}>
      {visible.map((bar) => (
        <div key={bar.label}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: bar.color, display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: "0.75rem", color: "#555" }}>{bar.label}</span>
            </div>
            <span style={{ fontSize: "0.75rem", color: "#111", fontWeight: 600 }}>{bar.count.toLocaleString()}</span>
          </div>
          <div style={{ background: "#f0f0f0", borderRadius: 5, height: 8, overflow: "hidden" }}>
            <div style={{ width: `${(bar.count / max) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${bar.color}99, ${bar.color})`, borderRadius: 5, transition: "width 0.4s ease" }} />
          </div>
        </div>
      ))}
      {visible.length === 0 && (
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
      <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
        {slices.map((s) => (
          <div key={s.status} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.75rem", color: "#555" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS_COLORS[s.status] ?? "#ccc", flexShrink: 0 }} />
            <span style={{ textTransform: "capitalize", flex: 1 }}>{s.status.toLowerCase()}</span>
            <span style={{ color: "#111", fontWeight: 600, minWidth: 20, textAlign: "right" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({
  points,
  color = "#111",
  valueFormatter,
}: {
  points: { date: string; value: number }[];
  color?: string;
  valueFormatter?: (v: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const max = Math.max(...points.map((p) => p.value), 1);
  const W = 320, H = 140, PAD = 4;
  const gradId = `lg-${color.replace("#", "")}`;
  const coords = points.map((p, i) => ({
    x: PAD + (i / Math.max(points.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - (p.value / max) * (H - PAD * 2),
  }));
  const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const fillD = pathD + ` L${(W - PAD).toFixed(1)},${H - PAD} L${PAD},${H - PAD} Z`;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const svgX = PAD + relX * (W - PAD * 2);
    let closest = 0, minDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - svgX);
      if (d < minDist) { minDist = d; closest = i; }
    });
    setHoverIdx(closest);
  }, [coords, points.length]);

  const stride = Math.max(1, Math.floor(points.length / 6));
  const labelPoints = points.filter((_, i) => i === 0 || i === points.length - 1 || i % stride === 0);

  const fmtDate = (d: string) => {
    const dt = new Date(d + "T00:00:00");
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const hoverPt = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverCoord = hoverIdx !== null ? coords[hoverIdx] : null;
  const tooltipLeftPct = hoverCoord ? Math.min(Math.max((hoverCoord.x / W) * 100, 10), 90) : 0;

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible", cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.18} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={PAD} x2={W - PAD} y1={H - PAD - f * (H - PAD * 2)} y2={H - PAD - f * (H - PAD * 2)} stroke="#f0f0f0" strokeWidth={1} strokeDasharray="3 3" />
        ))}
        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hoverCoord !== null && (
          <>
            <line x1={hoverCoord.x} x2={hoverCoord.x} y1={PAD} y2={H - PAD} stroke={color} strokeWidth={1} strokeDasharray="3 2" opacity={0.3} />
            <circle cx={hoverCoord.x} cy={hoverCoord.y} r={4.5} fill="#fff" stroke={color} strokeWidth={2} />
          </>
        )}
      </svg>
      {hoverPt !== null && hoverCoord !== null && (
        <div style={{
          position: "absolute",
          top: -8,
          left: `${tooltipLeftPct}%`,
          transform: "translateX(-50%)",
          background: "#111",
          color: "#fff",
          padding: "0.3rem 0.65rem",
          borderRadius: 6,
          fontSize: "0.7rem",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          zIndex: 10,
          lineHeight: 1.6,
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        }}>
          <div style={{ color: "#888" }}>{fmtDate(hoverPt.date)}</div>
          <div style={{ fontWeight: 700, fontSize: "0.8125rem" }}>
            {valueFormatter ? valueFormatter(hoverPt.value) : hoverPt.value.toLocaleString()}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem" }}>
        {labelPoints.map((p) => (
          <span key={p.date} style={{ fontSize: "0.6rem", color: "#d0d0d0" }}>{fmtDate(p.date)}</span>
        ))}
      </div>
    </div>
  );
}

const RANGE_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

const STAT_TOOLTIPS: Record<string, string> = {
  "Running": "Experiments currently live and collecting data.",
  "Total experiments": "All experiments ever created — draft, running, paused, completed, and archived.",
  "Visitors tested": "Unique visitor IDs ever allocated to at least one experiment across all time.",
  "Plan": "Your current billing plan. Upgrade for higher visitor caps and advanced features.",
};

export default function DashboardIndex() {
  const {
    shopDomain, range, activeExperiments, totalExperiments, visitorsTested,
    attributedRevenue, currency, recentExperiments, billingPlan,
    eventSparkline, revenueSparkline, eventsByType, experimentsByStatus, funnel,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const totalEvents = eventSparkline.reduce((s: number, d: { count: number }) => s + d.count, 0);
  const totalRevenueRange = revenueSparkline.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0);
  const fmtRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(attributedRevenue);
  const fmtRangeRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(totalRevenueRange);
  const fmtMoney = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  const rangeLabel = range === 7 ? "7 days" : range === 30 ? "30 days" : "90 days";

  const card: React.CSSProperties = {
    background: "#fff",
    borderRadius: 8,
    border: "1px solid #e8e8e8",
  };
  const label: React.CSSProperties = {
    fontSize: "0.75rem",
    fontWeight: 500,
    color: "#9b9b9b",
  };
  const big: React.CSSProperties = {
    fontSize: "1.875rem",
    fontWeight: 500,
    letterSpacing: "-0.02em",
    color: "#1a1a1a",
    lineHeight: 1,
  };

  const rangeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.25rem 0.625rem",
    fontSize: "0.8125rem",
    border: "none",
    borderRadius: 5,
    cursor: "pointer",
    background: active ? "#f0f0f0" : "transparent",
    color: active ? "#1a1a1a" : "#aaa",
    fontWeight: active ? 500 : 400,
  });

  return (
    <div style={{ padding: "2.5rem 2.5rem", maxWidth: 1040, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0, color: "#1a1a1a", letterSpacing: "-0.02em" }}>Overview</h1>
          <p style={{ fontSize: "0.8125rem", color: "#bbb", margin: "0.15rem 0 0" }}>{shopDomain}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.125rem" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button key={opt.value} style={rangeBtnStyle(range === opt.value)} onClick={() => setSearchParams({ range: String(opt.value) })}>
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate("/dashboard/experiments/new")}
            style={{ padding: "0.4rem 0.875rem", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
          >
            New experiment
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", background: "#e8e8e8", border: "1px solid #e8e8e8", borderRadius: 8, overflow: "hidden", marginBottom: "1.25rem" }}>
        {[
          { label: "Running experiments", value: String(activeExperiments) },
          { label: "Total experiments", value: String(totalExperiments) },
          { label: "Visitors tested", value: visitorsTested.toLocaleString() },
          { label: "Plan", value: billingPlan.replace(/_/g, " ") },
        ].map((stat) => (
          <div key={stat.label} style={{ background: "#fff", padding: "1.25rem 1.5rem" }}>
            <div style={label}>{stat.label}</div>
            <div style={{ ...big, marginTop: "0.4rem" }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Row 1: Events + Revenue */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ ...card, padding: "1.25rem 1.5rem" }}>
          <div style={label}>Events · last {rangeLabel}</div>
          <div style={{ ...big, margin: "0.3rem 0 1.25rem" }}>{totalEvents.toLocaleString()}</div>
          <LineChart points={eventSparkline.map((d: { date: string; count: number }) => ({ date: d.date, value: d.count }))} color="#3a7968" valueFormatter={(v) => v.toLocaleString() + " events"} />
        </div>
        <div style={{ ...card, padding: "1.25rem 1.5rem" }}>
          <div style={label}>Revenue attributed · last {rangeLabel}</div>
          <div style={{ ...big, margin: "0.3rem 0 1.25rem" }}>{fmtRangeRevenue}</div>
          <LineChart points={revenueSparkline.map((d: { date: string; revenue: number }) => ({ date: d.date, value: d.revenue }))} color="#2d5e51" valueFormatter={(v) => fmtMoney(v)} />
        </div>
      </div>

      {/* Row 2: Funnel + Events by type */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ ...card, padding: "1.25rem 1.5rem" }}>
          <div style={label}>Conversion funnel · {rangeLabel}</div>
          <div style={{ fontSize: "0.75rem", color: "#ccc", margin: "0.2rem 0 1rem" }}>Across all experiments</div>
          <FunnelChart steps={funnel} />
        </div>
        <div style={{ ...card, padding: "1.25rem 1.5rem" }}>
          <div style={label}>Events by type · {rangeLabel}</div>
          <div style={{ fontSize: "0.75rem", color: "#ccc", margin: "0.2rem 0 1rem" }}>All tracked event types</div>
          <BarChart bars={eventsByType.map((e: { type: string; count: number }) => ({ label: TYPE_LABELS[e.type] ?? e.type, count: e.count, color: TYPE_COLORS[e.type] ?? "#9ca3af" }))} />
        </div>
      </div>

      {/* Row 3: Status donut + Total revenue */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "2rem" }}>
        <div style={{ ...card, padding: "1.25rem 1.5rem" }}>
          <div style={label}>Experiments by status</div>
          <div style={{ fontSize: "0.75rem", color: "#ccc", margin: "0.2rem 0 0.75rem" }}>All time</div>
          <StatusDonut slices={experimentsByStatus} />
        </div>
        <div style={{ ...card, padding: "1.25rem 1.5rem", display: "flex", flexDirection: "column" }}>
          <div style={label}>Total attributed revenue</div>
          <div style={{ ...big, fontSize: "2rem", margin: "0.3rem 0 0.5rem" }}>{fmtRevenue}</div>
          <div style={{ fontSize: "0.8125rem", color: "#aaa", lineHeight: 1.6, flex: 1 }}>
            Revenue from orders matched to an experiment variant via first-party visitor tracking.
          </div>
          <button
            onClick={() => navigate("/dashboard/results")}
            style={{ alignSelf: "flex-start", marginTop: "1rem", fontSize: "0.8125rem", fontWeight: 500, color: "#1a1a1a", background: "none", border: "1px solid #e8e8e8", borderRadius: 6, padding: "0.35rem 0.75rem", cursor: "pointer" }}
            onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.borderColor = "#ccc")}
            onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.borderColor = "#e8e8e8")}
          >
            View results →
          </button>
        </div>
      </div>

      {/* Active experiments table */}
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.5rem", borderBottom: "1px solid #f0f0f0" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1a1a1a" }}>Active experiments</span>
          <button onClick={() => navigate("/dashboard/experiments")} style={{ fontSize: "0.8125rem", color: "#aaa", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            View all →
          </button>
        </div>

        {recentExperiments.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "#bbb", margin: "0 0 1rem" }}>No experiments yet</p>
            <button onClick={() => navigate("/dashboard/experiments/new")} style={{ fontSize: "0.8125rem", color: "#1a1a1a", background: "none", border: "1px solid #e8e8e8", borderRadius: 6, padding: "0.35rem 0.75rem", cursor: "pointer" }}>
              Create your first experiment
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                {["Name", "Type", "Status", "Variants", "Updated"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.625rem 1.5rem", fontWeight: 500, color: "#bbb", fontSize: "0.75rem" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentExperiments.map((exp) => (
                <tr
                  key={exp.id}
                  onClick={() => navigate(`/dashboard/experiments/${exp.id}`)}
                  style={{ borderBottom: "1px solid #f5f5f5", cursor: "pointer" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#f4f4f4"; (e.currentTarget.querySelector("td") as HTMLElement).style.color = "#3a7968"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; (e.currentTarget.querySelector("td") as HTMLElement).style.color = "#1a1a1a"; }}
                >
                  <td style={{ padding: "0.75rem 1.5rem", fontWeight: 500, color: "#1a1a1a", transition: "color 0.15s" }}>{exp.name}</td>
                  <td style={{ padding: "0.75rem 1.5rem", color: "#888" }}>{exp.type.replace(/_/g, " ")}</td>
                  <td style={{ padding: "0.75rem 1.5rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem", color: STATUS_COLORS[exp.status] ?? "#999" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[exp.status] ?? "#999", flexShrink: 0 }} />
                      {exp.status.toLowerCase()}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1.5rem", color: "#888" }}>{exp.variants.length}</td>
                  <td style={{ padding: "0.75rem 1.5rem", color: "#bbb" }}>{new Date(exp.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
