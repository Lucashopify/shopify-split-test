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

function smoothPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  let d = `M${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i - 1], c = coords[i];
    const cpx = ((p.x + c.x) / 2).toFixed(1);
    d += ` C${cpx},${p.y.toFixed(1)} ${cpx},${c.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`;
  }
  return d;
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
  const W = 320, H = 90, PAD_L = 4, PAD_R = 4, PAD_T = 14, PAD_B = 4;
  const gradId = `lg-${color.replace("#", "")}`;

  const coords = points.map((p, i) => ({
    x: PAD_L + (i / Math.max(points.length - 1, 1)) * (W - PAD_L - PAD_R),
    y: PAD_T + (1 - p.value / max) * (H - PAD_T - PAD_B),
  }));

  const pathD = smoothPath(coords);
  const fillD = coords.length > 0
    ? pathD + ` L${(W - PAD_R).toFixed(1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`
    : "";

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const svgX = PAD_L + relX * (W - PAD_L - PAD_R);
    let closest = 0, minDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - svgX);
      if (d < minDist) { minDist = d; closest = i; }
    });
    setHoverIdx(closest);
  }, [coords, points.length]);

  const stride = Math.max(1, Math.floor(points.length / 5));
  const labelPoints = points.filter((_, i) => i === 0 || i === points.length - 1 || i % stride === 0);
  const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const hoverPt = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverCoord = hoverIdx !== null ? coords[hoverIdx] : null;

  // Y-axis: 3 reference lines
  const yLines = [0.25, 0.5, 0.75, 1].map(f => ({
    y: PAD_T + (1 - f) * (H - PAD_T - PAD_B),
    label: valueFormatter ? valueFormatter(max * f) : (max * f).toLocaleString(undefined, { maximumFractionDigits: 0 }),
  }));

  const PILL_W = 74, PILL_H = 20, PILL_R = 10;

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
            <stop offset="0%" stopColor={color} stopOpacity={0.12} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Y-axis dashed grid */}
        {yLines.map((l) => (
          <line key={l.y} x1={PAD_L} x2={W - PAD_R} y1={l.y} y2={l.y} stroke="#ebebeb" strokeWidth={1} strokeDasharray="4 3" />
        ))}

        <path d={fillD} fill={`url(#${gradId})`} />
        <path d={pathD} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />

        {/* Hover vertical line + dot */}
        {hoverCoord && (
          <>
            <line x1={hoverCoord.x} x2={hoverCoord.x} y1={PAD_T} y2={H - PAD_B} stroke="#ccc" strokeWidth={1} strokeDasharray="3 2" />
            <circle cx={hoverCoord.x} cy={hoverCoord.y} r={4} fill="#fff" stroke={color} strokeWidth={2} />
            {/* Dark pill tooltip at the point */}
            {hoverPt && (() => {
              const px = Math.min(Math.max(hoverCoord.x, PILL_W / 2 + 2), W - PILL_W / 2 - 2);
              const py = hoverCoord.y - PILL_H - 8;
              const label = valueFormatter ? valueFormatter(hoverPt.value) : hoverPt.value.toLocaleString();
              return (
                <g>
                  <rect x={px - PILL_W / 2} y={py} width={PILL_W} height={PILL_H} rx={PILL_R} fill="#111" />
                  <text x={px} y={py + PILL_H * 0.68} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600} fontFamily="inherit">{label}</text>
                </g>
              );
            })()}
          </>
        )}
      </svg>

      {/* X-axis labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem" }}>
        {labelPoints.map((p) => (
          <span key={p.date} style={{ fontSize: "0.6rem", color: "#ccc" }}>{fmtDate(p.date)}</span>
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

  const rangeBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.25rem 0.6rem",
    fontSize: "0.75rem",
    border: "1px solid #e9e9e9",
    borderRadius: 5,
    cursor: "pointer",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#777",
    fontWeight: active ? 500 : 400,
  });

  const CARD: React.CSSProperties = { background: "#fff", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)" };

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1040, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>Overview</h1>
          <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0.25rem 0 0" }}>{shopDomain}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.25rem" }}>
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                style={rangeBtnStyle(range === opt.value)}
                onClick={() => setSearchParams({ range: String(opt.value) })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => navigate("/dashboard/experiments/new")}
            style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", letterSpacing: "-0.01em" }}
          >
            + New experiment
          </button>
        </div>
      </div>

      {/* Top stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
        {[
          { label: "Running", value: String(activeExperiments) },
          { label: "Total experiments", value: String(totalExperiments) },
          { label: "Visitors tested", value: visitorsTested.toLocaleString() },
          { label: "Plan", value: billingPlan.replace(/_/g, " ") },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{ ...CARD, padding: "1.25rem 1.5rem", position: "relative", cursor: "default" }}
            onMouseEnter={() => setHoveredStat(stat.label)}
            onMouseLeave={() => setHoveredStat(null)}
          >
            <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>{stat.label}</div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, letterSpacing: "-0.04em", color: "#111" }}>{stat.value}</div>
            {hoveredStat === stat.label && (
              <div style={{
                position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                background: "#111", color: "#fff", padding: "0.3rem 0.6rem", borderRadius: 6,
                fontSize: "0.7rem", whiteSpace: "normal" as const, pointerEvents: "none", zIndex: 20, lineHeight: 1.5,
                maxWidth: 220, textAlign: "center",
              }}>
                {STAT_TOOLTIPS[stat.label]}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Row 1: Events sparkline + Revenue sparkline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{ ...CARD, padding: "1.375rem 1.5rem" }}>
          <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>Events · last {rangeLabel}</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.04em", color: "#111", marginBottom: "0.875rem" }}>{totalEvents.toLocaleString()}</div>
          <LineChart
            points={eventSparkline.map((d: { date: string; count: number }) => ({ date: d.date, value: d.count }))}
            color="#6366f1"
            valueFormatter={(v) => v.toLocaleString()}
          />
        </div>
        <div style={{ ...CARD, padding: "1.375rem 1.5rem" }}>
          <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>Revenue attributed · last {rangeLabel}</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.04em", color: "#111", marginBottom: "0.875rem" }}>{fmtRangeRevenue}</div>
          <LineChart
            points={revenueSparkline.map((d: { date: string; revenue: number }) => ({ date: d.date, value: d.revenue }))}
            color="#16a34a"
            valueFormatter={(v) => fmtMoney(v)}
          />
        </div>
      </div>

      {/* Row 2: Funnel + Events by type */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div style={{ ...CARD, padding: "1.375rem 1.5rem" }}>
          <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.15rem" }}>Conversion funnel · {rangeLabel}</div>
          <div style={{ fontSize: "0.75rem", color: "#ccc", marginBottom: "0.875rem" }}>Across all experiments</div>
          <FunnelChart steps={funnel} />
        </div>
        <div style={{ ...CARD, padding: "1.375rem 1.5rem" }}>
          <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.15rem" }}>Events by type · {rangeLabel}</div>
          <div style={{ fontSize: "0.75rem", color: "#ccc", marginBottom: "0.875rem" }}>All tracked event types</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "2.5rem" }}>
        <div style={{ ...CARD, padding: "1.375rem 1.5rem" }}>
          <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.15rem" }}>Experiments by status</div>
          <div style={{ fontSize: "0.75rem", color: "#ccc", marginBottom: "0.5rem" }}>All time</div>
          <StatusDonut slices={experimentsByStatus} />
        </div>
        <div style={{ ...CARD, padding: "1.375rem 1.5rem", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.68rem", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.2rem" }}>Total attributed revenue</div>
            <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.04em", color: "#111", marginBottom: "0.5rem" }}>{fmtRevenue}</div>
            <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.6 }}>Revenue from orders matched to an experiment variant via first-party visitor tracking.</div>
          </div>
          <button
            onClick={() => navigate("/dashboard/results")}
            style={{ alignSelf: "flex-start", marginTop: "1rem", fontSize: "0.75rem", color: "#111", background: "none", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.3rem 0.75rem", cursor: "pointer" }}
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
