import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });

  if (!shop) {
    return Response.json({ experiments: [], currency: "USD" }, { headers: { "Set-Cookie": setCookie } });
  }

  const experiments = await prisma.experiment.findMany({
    where: { shopId: shop.id, status: { in: ["RUNNING", "PAUSED", "COMPLETED"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      variants: {
        orderBy: [{ isControl: "desc" }, { createdAt: "asc" }],
        include: {
          _count: { select: { allocations: true, orders: true } },
          orders: { select: { revenue: true } },
        },
      },
    },
  });

  const data = experiments.map((exp) => {
    const variants = exp.variants.map((v) => {
      const visitors = v._count.allocations;
      const orders = v._count.orders;
      const revenue = v.orders.reduce((s, o) => s + o.revenue, 0);
      const cvr = visitors > 0 ? orders / visitors : 0;
      const aov = orders > 0 ? revenue / orders : 0;
      const rpv = visitors > 0 ? revenue / visitors : 0;
      return { id: v.id, name: v.name, isControl: v.isControl, visitors, orders, revenue, cvr, aov, rpv };
    });

    // Compute lift vs control
    const control = variants.find((v) => v.isControl);
    const variantsWithLift = variants.map((v) => {
      const lift = control && !v.isControl && control.cvr > 0
        ? ((v.cvr - control.cvr) / control.cvr) * 100
        : null;
      return { ...v, lift };
    });

    return {
      id: exp.id,
      name: exp.name,
      type: exp.type,
      status: exp.status,
      updatedAt: exp.updatedAt.toISOString(),
      variants: variantsWithLift,
    };
  });

  return Response.json({ experiments: data, currency: shop.currency ?? "USD" }, { headers: { "Set-Cookie": setCookie } });
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "#16a34a",
  PAUSED: "#d97706",
  COMPLETED: "#2563eb",
};

function pct(n: number) { return (n * 100).toFixed(2) + "%"; }
function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}

type VariantRow = {
  id: string; name: string; isControl: boolean;
  visitors: number; orders: number; revenue: number;
  cvr: number; aov: number; rpv: number; lift: number | null;
};
type ExpRow = {
  id: string; name: string; type: string; status: string;
  updatedAt: string; variants: VariantRow[];
};

export default function ResultsPage() {
  const { experiments, currency } = useLoaderData<typeof loader>() as { experiments: ExpRow[]; currency: string };
  const navigate = useNavigate();

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1080, margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>Results</h1>
        <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0.25rem 0 0" }}>Variant performance across all active and completed experiments.</p>
      </div>

      {experiments.length === 0 ? (
        <div style={{ border: "1px dashed #e9e9e9", borderRadius: 8, padding: "4rem", textAlign: "center" }}>
          <p style={{ fontSize: "0.875rem", color: "#999", margin: "0 0 1rem" }}>No results yet. Start an experiment to see data here.</p>
          <button onClick={() => navigate("/dashboard/experiments/new")} style={{ fontSize: "0.8125rem", color: "#111", background: "none", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.4rem 0.875rem", cursor: "pointer" }}>
            Create experiment
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {experiments.map((exp) => {
            const winner = exp.variants.reduce<VariantRow | null>((best, v) => {
              if (!best) return v;
              return v.cvr > best.cvr ? v : best;
            }, null);

            return (
              <div key={exp.id} style={{ border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
                {/* Experiment header */}
                <div
                  onClick={() => navigate(`/dashboard/experiments/${exp.id}`)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", borderBottom: "1px solid #e9e9e9", cursor: "pointer", background: "#fafafa" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111" }}>{exp.name}</span>
                    <span style={{ fontSize: "0.7rem", color: "#999", background: "#f3f3f3", borderRadius: 4, padding: "0.15rem 0.5rem" }}>{exp.type.replace(/_/g, " ")}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: STATUS_COLORS[exp.status] ?? "#999" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[exp.status] ?? "#999", display: "inline-block" }} />
                      {exp.status.toLowerCase()}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#aaa" }}>{new Date(exp.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Variants table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                      {["Variant", "Visitors", "Orders", "CVR", "AOV", "RPV", "Revenue", "Lift vs control"].map((h) => (
                        <th key={h} style={{ textAlign: "left", padding: "0.6rem 1rem", fontWeight: 500, color: "#999", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {exp.variants.map((v) => {
                      const isWinner = winner?.id === v.id && !v.isControl && v.visitors > 0;
                      return (
                        <tr key={v.id} style={{ borderBottom: "1px solid #f7f7f7" }}>
                          <td style={{ padding: "0.75rem 1rem", fontWeight: 500, color: "#111" }}>
                            <span>{v.name}</span>
                            {v.isControl && <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", color: "#999", background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.4rem" }}>control</span>}
                            {isWinner && <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", color: "#16a34a", background: "#f0fdf4", borderRadius: 3, padding: "0.1rem 0.4rem" }}>↑ leading</span>}
                          </td>
                          <td style={{ padding: "0.75rem 1rem", color: "#555" }}>{v.visitors.toLocaleString()}</td>
                          <td style={{ padding: "0.75rem 1rem", color: "#555" }}>{v.orders.toLocaleString()}</td>
                          <td style={{ padding: "0.75rem 1rem", color: "#111", fontWeight: 500 }}>{pct(v.cvr)}</td>
                          <td style={{ padding: "0.75rem 1rem", color: "#555" }}>{v.aov > 0 ? fmt(v.aov, currency) : "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", color: "#555" }}>{v.rpv > 0 ? fmt(v.rpv, currency) : "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", color: "#555" }}>{v.revenue > 0 ? fmt(v.revenue, currency) : "—"}</td>
                          <td style={{ padding: "0.75rem 1rem" }}>
                            {v.isControl ? (
                              <span style={{ color: "#ccc", fontSize: "0.75rem" }}>baseline</span>
                            ) : v.lift !== null ? (
                              <span style={{ color: v.lift >= 0 ? "#16a34a" : "#dc2626", fontWeight: 500 }}>
                                {v.lift >= 0 ? "+" : ""}{v.lift.toFixed(1)}%
                              </span>
                            ) : (
                              <span style={{ color: "#ccc", fontSize: "0.75rem" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
