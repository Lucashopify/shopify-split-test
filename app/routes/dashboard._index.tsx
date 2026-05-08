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
  const colors = ["#6366f1", "#f59e0b", "#3b82f6", "#16a34a"];
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
                  <span style={{ fontSize: "0.68rem", color: "#aaa", background: "#f5f5f5", borderRadius: 3, padding: "0.1rem 0.35rem" }}>
                    ↓ {convRate}%
                  </span>
                )}
                <span style={{ fontSize: "0.75rem", color: "#111", fontWeight: 600 }}>{step.count.toLocaleString()}</span>
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
  const W = 320, H = 80, PAD = 4;
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
  const [hoveredStat, setHoveredStat] = useState<string | null>(null);

  const totalEvents = eventSparkline.reduce((s: number, d: { count: number }) => s + d.count, 0);
  const totalRevenueRange = revenueSparkline.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0);
  const fmtRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency }).format(attributedRevenue);
  const fmtRangeRevenue = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(totalRevenueRange);
  const fmtMoney = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  const rangeLabel = range === 7 ? "7 days" : range === 30 ? "30 days" : "90 days";

  const C: React.CSSProperties = {
    background: "#fff",
    borderRadius: 14,
    boxShadow: "0 0 0 1px rgba(0,0,0,0.05), 0 4px 24px rgba(0,0,0,0.05), 0 1px 4px rgba(0,0,0,0.04)",
    transition: "box-shadow 0.25s cubic-bezier(0.32,0.72,0,1), transform 0.25s cubic-bezier(0.32,0.72,0,1)",
  };
  const LABEL: React.CSSProperties = { fontSize: "0.65rem", fontWeight: 600, color: "#b0b0b0", textTransform: "uppercase", letterSpacing: "0.09em" };
  const BIG: React.CSSProperties = { fontSize: "2rem", fontWeight: 800, letterSpacing: "-0.045em", color: "#0a0a0a", lineHeight: 1 };

  const rangeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.3rem 0.75rem",
    fontSize: "0.75rem",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
    background: active ? "#0a0a0a" : "transparent",
    color: active ? "#fff" : "#999",
    fontWeight: active ? 600 : 400,
    transition: "all 0.15s ease",
  });

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1060, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.625rem", fontWeight: 800, margin: 0, letterSpacing: "-0.045em", color: "#0a0a0a" }}>Overview</h1>
          <p style={{ fontSize: "0.75rem", color: "#bbb", margin: "0.2rem 0 0", letterSpacing: "0.01em" }}>{shopDomain}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {/* Range pills */}
          <div style={{ display: "flex", gap: "0.125rem", background: "#f4f4f4", borderRadius: 10, padding: "0.25rem" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button key={opt.value} style={rangeBtnStyle(range === opt.value)} onClick={() => setSearchParams({ range: String(opt.value) })}>
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate("/dashboard/experiments/new")}
            style={{ padding: "0.45rem 1rem", background: "#0a0a0a", color: "#fff", border: "none", borderRadius: 9, fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer", letterSpacing: "-0.02em", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }}
          >
            + New experiment
          </button>
        </div>
      </div>

      {/* Top stats — 4 floating cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "0.75rem" }}>
        {[
          { label: "Running", value: String(activeExperiments) },
          { label: "Total experiments", value: String(totalExperiments) },
          { label: "Visitors tested", value: visitorsTested.toLocaleString() },
          { label: "Plan", value: billingPlan.replace(/_/g, " ") },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{ ...C, padding: "1.375rem 1.5rem", position: "relative", cursor: "default" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 1px rgba(0,0,0,0.07), 0 8px 32px rgba(0,0,0,0.09), 0 2px 8px rgba(0,0,0,0.05)"; (e.currentTarget as HTMLDivElement).style.transform = "translateY(-1px)"; setHoveredStat(stat.label); }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = C.boxShadow as string; (e.currentTarget as HTMLDivElement).style.transform = ""; setHoveredStat(null); }}
          >
            <div style={{ ...LABEL, marginBottom: "0.6rem" }}>{stat.label}</div>
            <div style={BIG}>{stat.value}</div>
            {hoveredStat === stat.label && (
              <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: "#0a0a0a", color: "#fff", padding: "0.35rem 0.7rem", borderRadius: 7, fontSize: "0.7rem", whiteSpace: "normal" as const, pointerEvents: "none", zIndex: 20, lineHeight: 1.5, maxWidth: 220, textAlign: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
                {STAT_TOOLTIPS[stat.label]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Row 1: Events + Revenue line charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{ ...C, padding: "1.5rem" }}>
          <div style={LABEL}>Events · last {rangeLabel}</div>
          <div style={{ ...BIG, marginTop: "0.4rem", marginBottom: "1.25rem" }}>{totalEvents.toLocaleString()}</div>
          <LineChart points={eventSparkline.map((d: { date: string; count: number }) => ({ date: d.date, value: d.count }))} color="#6366f1" valueFormatter={(v) => v.toLocaleString() + " events"} />
        </div>
        <div style={{ ...C, padding: "1.5rem" }}>
          <div style={LABEL}>Revenue attributed · last {rangeLabel}</div>
          <div style={{ ...BIG, marginTop: "0.4rem", marginBottom: "1.25rem" }}>{fmtRangeRevenue}</div>
          <LineChart points={revenueSparkline.map((d: { date: string; revenue: number }) => ({ date: d.date, value: d.revenue }))} color="#16a34a" valueFormatter={(v) => fmtMoney(v)} />
        </div>
      </div>

      {/* Row 2: Funnel + Events by type */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{ ...C, padding: "1.5rem" }}>
          <div style={LABEL}>Conversion funnel · {rangeLabel}</div>
          <div style={{ fontSize: "0.72rem", color: "#d0d0d0", marginTop: "0.2rem", marginBottom: "1rem" }}>Across all experiments</div>
          <FunnelChart steps={funnel} />
        </div>
        <div style={{ ...C, padding: "1.5rem" }}>
          <div style={LABEL}>Events by type · {rangeLabel}</div>
          <div style={{ fontSize: "0.72rem", color: "#d0d0d0", marginTop: "0.2rem", marginBottom: "1rem" }}>All tracked event types</div>
          <BarChart bars={eventsByType.map((e: { type: string; count: number }) => ({ label: TYPE_LABELS[e.type] ?? e.type, count: e.count, color: TYPE_COLORS[e.type] ?? "#9ca3af" }))} />
        </div>
      </div>

      {/* Row 3: Status donut + Total attributed revenue */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "2.5rem" }}>
        <div style={{ ...C, padding: "1.5rem" }}>
          <div style={LABEL}>Experiments by status</div>
          <div style={{ fontSize: "0.72rem", color: "#d0d0d0", marginTop: "0.2rem", marginBottom: "0.75rem" }}>All time</div>
          <StatusDonut slices={experimentsByStatus} />
        </div>
        <div style={{ ...C, padding: "1.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={LABEL}>Total attributed revenue</div>
            <div style={{ ...BIG, fontSize: "2.25rem", marginTop: "0.4rem", marginBottom: "0.625rem" }}>{fmtRevenue}</div>
            <div style={{ fontSize: "0.75rem", color: "#bbb", lineHeight: 1.65 }}>Revenue from orders matched to an experiment variant via first-party visitor tracking.</div>
          </div>
          <button
            onClick={() => navigate("/dashboard/results")}
            style={{ alignSelf: "flex-start", marginTop: "1.25rem", fontSize: "0.75rem", fontWeight: 600, color: "#0a0a0a", background: "#f4f4f4", border: "none", borderRadius: 8, padding: "0.45rem 0.875rem", cursor: "pointer", letterSpacing: "-0.01em", transition: "background 0.15s" }}
            onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.background = "#ebebeb")}
            onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.background = "#f4f4f4")}
          >
            View results →
          </button>
        </div>
      </div>

      {/* Active experiments table */}
      <div style={{ ...C, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.5rem", borderBottom: "1px solid #f0f0f0" }}>
          <h2 style={{ fontSize: "0.875rem", fontWeight: 700, margin: 0, color: "#0a0a0a", letterSpacing: "-0.02em" }}>Active experiments</h2>
          <button onClick={() => navigate("/dashboard/experiments")} style={{ fontSize: "0.75rem", color: "#bbb", background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 500 }}>
            View all →
          </button>
        </div>

        {recentExperiments.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center" }}>
            <p style={{ fontSize: "0.875rem", color: "#bbb", margin: "0 0 1rem" }}>No experiments yet</p>
            <button onClick={() => navigate("/dashboard/experiments/new")} style={{ fontSize: "0.8125rem", color: "#0a0a0a", background: "#f4f4f4", border: "none", borderRadius: 8, padding: "0.45rem 0.875rem", cursor: "pointer", fontWeight: 600 }}>
              Create your first experiment
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                {["Name", "Type", "Status", "Variants", "Updated"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "0.625rem 1.5rem", fontWeight: 600, color: "#c0c0c0", fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentExperiments.map((exp) => (
                <tr key={exp.id} onClick={() => navigate(`/dashboard/experiments/${exp.id}`)} style={{ borderBottom: "1px solid #f7f7f7", cursor: "pointer", transition: "background 0.12s" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
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
