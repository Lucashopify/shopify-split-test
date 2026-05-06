import { data, type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, setCookie } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return data({ experiments: [] }, { headers: { "Set-Cookie": setCookie } });

  const experiments = await prisma.experiment.findMany({
    where: { shopId: shop.id, status: { in: ["COMPLETED", "ARCHIVED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      variants: { orderBy: [{ isControl: "desc" }, { createdAt: "asc" }] },
    },
  });

  // Fetch results + orders for each experiment
  const ids = experiments.map((e) => e.id);

  const [allResults, allOrders] = await Promise.all([
    prisma.experimentResult.groupBy({
      by: ["experimentId", "variantId"],
      where: { experimentId: { in: ids } },
      _sum: { sessions: true, conversionCount: true, revenue: true },
      _max: { pValue: true, liftPct: true },
    }),
    prisma.order.groupBy({
      by: ["experimentId", "variantId"],
      where: { experimentId: { in: ids } },
      _count: { id: true },
      _sum: { revenue: true },
    }),
  ]);

  const enriched = experiments.map((exp) => {
    const expResults = allResults.filter((r) => r.experimentId === exp.id);
    const expOrders = allOrders.filter((o) => o.experimentId === exp.id);

    const totalRevenue = expOrders.reduce((s, o) => s + (o._sum.revenue ?? 0), 0);

    // Find best treatment variant by lift
    const treatments = exp.variants.filter((v) => !v.isControl);
    let winner: { name: string; liftPct: number; pValue: number | null } | null = null;

    for (const v of treatments) {
      const res = expResults.find((r) => r.variantId === v.id);
      const liftPct = res?._max.liftPct;
      const pValue = res?._max.pValue ?? null;
      if (liftPct != null && (winner == null || liftPct > winner.liftPct)) {
        winner = { name: v.name, liftPct, pValue };
      }
    }

    const totalSessions = expResults.reduce((s, r) => s + (r._sum.sessions ?? 0), 0);
    const significant = winner?.pValue != null && winner.pValue < 0.05;

    const durationDays = exp.startAt
      ? Math.round((new Date(exp.updatedAt).getTime() - new Date(exp.startAt).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      id: exp.id,
      name: exp.name,
      hypothesis: exp.hypothesis,
      type: exp.type,
      status: exp.status,
      startAt: exp.startAt?.toISOString() ?? null,
      endAt: exp.updatedAt.toISOString(),
      durationDays,
      totalSessions,
      totalRevenue,
      winner,
      significant,
      variantCount: exp.variants.length,
    };
  });

  return data({ experiments: enriched }, { headers: { "Set-Cookie": setCookie } });
};

const TYPE_LABELS: Record<string, string> = {
  THEME: "Theme", SECTION: "Section", PRICE: "Price",
  URL_REDIRECT: "URL redirect", TEMPLATE: "Template", PAGE: "Page",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "#2563eb", ARCHIVED: "#9ca3af",
};

export default function HistoryPage() {
  const { experiments } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const fmtMoney = (n: number) =>
    n > 0 ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 860, margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.3rem", letterSpacing: "-0.03em", color: "#111" }}>
          Experiment history
        </h1>
        <p style={{ fontSize: "0.8125rem", color: "#999", margin: 0 }}>
          All completed and archived experiments with their outcomes.
        </p>
      </div>

      {experiments.length === 0 ? (
        <div style={{ border: "1px dashed #e9e9e9", borderRadius: 8, padding: "3rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", color: "#999", margin: "0 0 0.5rem" }}>No completed experiments yet.</p>
          <p style={{ fontSize: "0.8125rem", color: "#bbb", margin: 0 }}>Completed and archived experiments will appear here with their results.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {experiments.map((exp) => (
            <div
              key={exp.id}
              onClick={() => navigate(`/dashboard/experiments/${exp.id}`)}
              style={{ border: "1px solid #e9e9e9", borderRadius: 10, padding: "1.25rem 1.5rem", cursor: "pointer", background: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
            >
              {/* Top row */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111" }}>{exp.name}</span>
                    <span style={{ fontSize: "0.7rem", color: "#777", background: "#f5f5f5", borderRadius: 4, padding: "0.1rem 0.45rem" }}>
                      {TYPE_LABELS[exp.type] ?? exp.type}
                    </span>
                    <span style={{ fontSize: "0.7rem", color: STATUS_COLORS[exp.status] ?? "#999", background: "#f5f5f5", borderRadius: 4, padding: "0.1rem 0.45rem" }}>
                      {exp.status.toLowerCase()}
                    </span>
                  </div>
                  {exp.hypothesis && (
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "#777", lineHeight: 1.5 }}>{exp.hypothesis}</p>
                  )}
                </div>
                {/* Winner badge */}
                {exp.winner && exp.significant && (
                  <div style={{ flexShrink: 0, marginLeft: "1rem", padding: "0.35rem 0.75rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontSize: "0.65rem", color: "#15803d", textTransform: "uppercase", letterSpacing: "0.05em" }}>Winner</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: "#111", letterSpacing: "-0.02em" }}>
                      {exp.winner.liftPct > 0 ? "+" : ""}{(exp.winner.liftPct * 100).toFixed(1)}%
                    </div>
                    <div style={{ fontSize: "0.65rem", color: "#555", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {exp.winner.name}
                    </div>
                  </div>
                )}
                {exp.winner && !exp.significant && (
                  <div style={{ flexShrink: 0, marginLeft: "1rem", padding: "0.35rem 0.75rem", background: "#f9fafb", border: "1px solid #e9e9e9", borderRadius: 6, textAlign: "center" }}>
                    <div style={{ fontSize: "0.65rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.05em" }}>No winner</div>
                    <div style={{ fontSize: "0.75rem", color: "#aaa" }}>Inconclusive</div>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
                {[
                  { label: "Sessions", value: exp.totalSessions > 0 ? exp.totalSessions.toLocaleString() : "—" },
                  { label: "Revenue", value: fmtMoney(exp.totalRevenue) },
                  { label: "Variants", value: String(exp.variantCount) },
                  { label: "Duration", value: exp.durationDays != null ? `${exp.durationDays}d` : "—" },
                  {
                    label: "Dates",
                    value: exp.startAt
                      ? `${new Date(exp.startAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(exp.endAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : new Date(exp.endAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
                  },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: "0.65rem", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.15rem" }}>{s.label}</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111" }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
