import { data, useLoaderData, useNavigate, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

// ── Statistics helpers ────────────────────────────────────────────────────────

/** Abramowitz & Stegun rational approximation of the standard normal CDF. */
function normalCDF(z: number): number {
  const sign = z >= 0 ? 1 : -1;
  const t = 1 / (1 + 0.3275911 * Math.abs(z));
  const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return 0.5 * (1 + sign * (1 - poly * Math.exp(-(z * z) / 2)));
}

/** Two-proportion z-test. Returns two-tailed p-value, or null if n too small. */
function twoProportionPValue(nCtrl: number, kCtrl: number, nVar: number, kVar: number): number | null {
  if (nCtrl < 20 || nVar < 20) return null;
  const pp = (kCtrl + kVar) / (nCtrl + nVar);
  if (pp === 0 || pp === 1) return null;
  const se = Math.sqrt(pp * (1 - pp) * (1 / nCtrl + 1 / nVar));
  if (se === 0) return null;
  const z = (kVar / nVar - kCtrl / nCtrl) / se;
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/** 95% confidence interval for the relative lift (in percent). */
function liftCI(nCtrl: number, kCtrl: number, nVar: number, kVar: number): { low: number; high: number } | null {
  if (nCtrl < 20 || nVar < 20 || kCtrl === 0) return null;
  const p1 = kCtrl / nCtrl, p2 = kVar / nVar;
  const seDelta = Math.sqrt(p1 * (1 - p1) / nCtrl + p2 * (1 - p2) / nVar);
  const delta = p2 - p1;
  return { low: ((delta - 1.96 * seDelta) / p1) * 100, high: ((delta + 1.96 * seDelta) / p1) * 100 };
}

/**
 * Chi-squared SRM test. Returns p-value (low = bad SRM).
 * observed: visitor counts per variant; weights: traffic weight per variant.
 */
function srmPValue(observed: number[], weights: number[]): number | null {
  const total = observed.reduce((s, c) => s + c, 0);
  if (total < 100) return null;
  const totalW = weights.reduce((s, w) => s + w, 0);
  const expected = weights.map((w) => (total * w) / totalW);
  const chi2 = observed.reduce((s, obs, i) => s + Math.pow(obs - expected[i], 2) / expected[i], 0);
  const df = observed.length - 1;
  if (df <= 0) return null;
  // df=1: exact; df>1: Wilson–Hilferty normal approximation
  if (df === 1) return 2 * (1 - normalCDF(Math.sqrt(chi2)));
  const z = ((chi2 / df) ** (1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCDF(z);
}

/**
 * Minimum visitors per variant to detect `mde` relative lift
 * at 95% confidence and 80% power.
 */
function sampleSizeNeeded(baselineCvr: number, mde = 0.05): number | null {
  if (baselineCvr <= 0 || baselineCvr >= 1) return null;
  const p2 = baselineCvr * (1 + mde);
  if (p2 >= 1) return null;
  const pp = (baselineCvr + p2) / 2;
  // (z_α/2 + z_β)^2 = (1.96+0.842)^2 ≈ 7.849
  return Math.ceil(7.849 * (baselineCvr * (1 - baselineCvr) + p2 * (1 - p2)) / Math.pow(p2 - baselineCvr, 2));
}

// ── Loader ────────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });

  if (!shop) {
    return data({ experiments: [], currency: "USD" }, { headers: { "Set-Cookie": setCookie } });
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

  const expIds = experiments.map((e) => e.id);

  // Fetch unique-visitor ATC + checkout counts per variant in parallel
  const [atcRows, checkoutRows] = await Promise.all([
    prisma.event.findMany({
      where: { shopId: shop.id, experimentId: { in: expIds }, type: "ADD_TO_CART" },
      select: { variantId: true, visitorId: true },
      distinct: ["variantId", "visitorId"],
    }),
    prisma.event.findMany({
      where: { shopId: shop.id, experimentId: { in: expIds }, type: "INITIATE_CHECKOUT" },
      select: { variantId: true, visitorId: true },
      distinct: ["variantId", "visitorId"],
    }),
  ]);

  function byVariant(rows: Array<{ variantId: string }>) {
    return rows.reduce<Record<string, number>>((acc, r) => { acc[r.variantId] = (acc[r.variantId] ?? 0) + 1; return acc; }, {});
  }
  const atcByVar = byVariant(atcRows);
  const checkoutByVar = byVariant(checkoutRows);

  const rows = experiments.map((exp) => {
    const variants = exp.variants.map((v) => {
      const visitors = v._count.allocations;
      const orders = v._count.orders;
      const revenue = v.orders.reduce((s, o) => s + o.revenue, 0);
      const atcCount = atcByVar[v.id] ?? 0;
      const checkoutCount = checkoutByVar[v.id] ?? 0;
      const cvr = visitors > 0 ? orders / visitors : 0;
      const atcRate = visitors > 0 ? atcCount / visitors : 0;
      const checkoutRate = visitors > 0 ? checkoutCount / visitors : 0;
      const aov = orders > 0 ? revenue / orders : 0;
      const rpv = visitors > 0 ? revenue / visitors : 0;
      return { id: v.id, name: v.name, isControl: v.isControl, trafficWeight: v.trafficWeight, visitors, orders, atcCount, checkoutCount, revenue, cvr, atcRate, checkoutRate, aov, rpv };
    });

    const control = variants.find((v) => v.isControl);

    const variantsFull = variants.map((v) => {
      if (v.isControl || !control) {
        return { ...v, lift: null, ciLow: null, ciHigh: null, pValue: null, isSignificant: false };
      }
      const lift = control.cvr > 0 ? ((v.cvr - control.cvr) / control.cvr) * 100 : null;
      const pValue = twoProportionPValue(control.visitors, control.orders, v.visitors, v.orders);
      const ci = liftCI(control.visitors, control.orders, v.visitors, v.orders);
      return {
        ...v,
        lift,
        ciLow: ci?.low ?? null,
        ciHigh: ci?.high ?? null,
        pValue,
        isSignificant: pValue !== null && pValue < 0.05,
      };
    });

    // SRM check
    const observed = variants.map((v) => v.visitors);
    const weights = variants.map((v) => v.trafficWeight);
    const srm = srmPValue(observed, weights);
    const srmFlagged = srm !== null && srm < 0.01;

    // Sample size needed (based on control CVR, detect 5% lift)
    const samplesNeeded = control ? sampleSizeNeeded(control.cvr) : null;

    // Days running since experiment started
    const daysRunning = exp.startAt
      ? Math.max(0, Math.round((Date.now() - new Date(exp.startAt).getTime()) / 86400000))
      : 0;

    return {
      id: exp.id,
      name: exp.name,
      type: exp.type,
      status: exp.status,
      updatedAt: exp.updatedAt.toISOString(),
      srmFlagged,
      samplesNeeded,
      daysRunning,
      variants: variantsFull,
    };
  });

  return data({ experiments: rows, currency: shop.currency ?? "USD" }, { headers: { "Set-Cookie": setCookie } });
};

// ── Display helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "#16a34a", PAUSED: "#d97706", COMPLETED: "#2563eb",
};

function pct(n: number, decimals = 2) { return (n * 100).toFixed(decimals) + "%"; }
function fmt(n: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
}
function fmtCI(low: number, high: number) {
  const s = (n: number) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
  return `[${s(low)}, ${s(high)}]`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type VariantRow = {
  id: string; name: string; isControl: boolean; trafficWeight: number;
  visitors: number; orders: number; atcCount: number; checkoutCount: number; revenue: number;
  cvr: number; atcRate: number; checkoutRate: number; aov: number; rpv: number;
  lift: number | null; ciLow: number | null; ciHigh: number | null;
  pValue: number | null; isSignificant: boolean;
};
type ExpRow = {
  id: string; name: string; type: string; status: string;
  updatedAt: string; srmFlagged: boolean; samplesNeeded: number | null; daysRunning: number;
  variants: VariantRow[];
};

const TH_STYLE: React.CSSProperties = {
  textAlign: "left", padding: "0.55rem 0.75rem", fontWeight: 500,
  color: "#999", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em",
  whiteSpace: "nowrap",
};
const TD: React.CSSProperties = { padding: "0.7rem 0.75rem", whiteSpace: "nowrap" };

const HEADERS = ["Variant", "Visitors", "ATC Rate", "Checkout Rate", "CVR", "Orders", "AOV", "RPV", "Revenue", "Lift (95% CI)", "Confidence"];

// ── Component ─────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { experiments, currency } = useLoaderData<typeof loader>() as { experiments: ExpRow[]; currency: string };
  const navigate = useNavigate();

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 1200, margin: "0 auto" }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
          {experiments.map((exp) => {
            const winner = exp.variants.reduce<VariantRow | null>((best, v) => {
              if (!best || v.cvr > best.cvr) return v;
              return best;
            }, null);
            const anySignificant = exp.variants.some((v) => v.isSignificant);
            const control = exp.variants.find((v) => v.isControl);
            const totalVisitors = exp.variants.reduce((s, v) => s + v.visitors, 0);

            return (
              <div key={exp.id} style={{ border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>

                {/* Experiment header */}
                <div
                  onClick={() => navigate(`/dashboard/experiments/${exp.id}`)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.9rem 1.25rem", borderBottom: "1px solid #e9e9e9", cursor: "pointer", background: "#fafafa" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111" }}>{exp.name}</span>
                    <span style={{ fontSize: "0.7rem", color: "#999", background: "#f3f3f3", borderRadius: 4, padding: "0.15rem 0.5rem" }}>{exp.type.replace(/_/g, " ")}</span>
                    {anySignificant && (
                      <span style={{ fontSize: "0.7rem", color: "#16a34a", background: "#f0fdf4", borderRadius: 4, padding: "0.15rem 0.5rem" }}>✓ significant</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
                    {exp.samplesNeeded && control && control.visitors < exp.samplesNeeded && (
                      <span style={{ fontSize: "0.72rem", color: "#aaa" }}>
                        {(exp.samplesNeeded - control.visitors).toLocaleString()} more visitors needed
                      </span>
                    )}
                    <span style={{ fontSize: "0.72rem", color: "#aaa" }}>{totalVisitors.toLocaleString()} total visitors</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: STATUS_COLORS[exp.status] ?? "#999" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLORS[exp.status] ?? "#999", display: "inline-block" }} />
                      {exp.status.toLowerCase()}
                    </span>
                    <span style={{ fontSize: "0.72rem", color: "#bbb" }}>{new Date(exp.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* SRM warning */}
                {exp.srmFlagged && (
                  <div style={{ padding: "0.6rem 1.25rem", background: "#fffbeb", borderBottom: "1px solid #fef3c7", fontSize: "0.8rem", color: "#92400e" }}>
                    ⚠ Sample Ratio Mismatch detected — visitor counts differ significantly from expected traffic split. Results may be unreliable. Check your implementation.
                  </div>
                )}

                {/* Scrollable table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem", minWidth: 960 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
                        {HEADERS.map((h) => <th key={h} style={TH_STYLE}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {exp.variants.map((v) => {
                        const isWinner = winner?.id === v.id && !v.isControl && v.visitors > 0;
                        const conf = v.pValue !== null ? Math.round((1 - v.pValue) * 100) : null;
                        const liftColor = v.lift === null ? "#aaa" : v.lift >= 0 ? "#16a34a" : "#dc2626";

                        return (
                          <tr key={v.id} style={{ borderBottom: "1px solid #f7f7f7" }}>
                            {/* Variant name + badges */}
                            <td style={{ ...TD, fontWeight: 500, color: "#111", minWidth: 160 }}>
                              {v.name}
                              {v.isControl && <Badge color="#999" bg="#f3f3f3">control</Badge>}
                              {isWinner && !v.isControl && <Badge color="#16a34a" bg="#f0fdf4">↑ leading</Badge>}
                              {v.isSignificant && <Badge color="#2563eb" bg="#eff6ff">★ sig.</Badge>}
                            </td>

                            {/* Visitors */}
                            <td style={{ ...TD, color: "#555" }}>{v.visitors.toLocaleString()}</td>

                            {/* ATC Rate */}
                            <td style={{ ...TD, color: "#555" }}>
                              {v.atcCount > 0 ? (
                                <span>
                                  {pct(v.atcRate)}<span style={{ fontSize: "0.7rem", color: "#bbb", marginLeft: 4 }}>({v.atcCount.toLocaleString()})</span>
                                </span>
                              ) : "—"}
                            </td>

                            {/* Checkout Rate */}
                            <td style={{ ...TD, color: "#555" }}>
                              {v.checkoutCount > 0 ? (
                                <span>
                                  {pct(v.checkoutRate)}<span style={{ fontSize: "0.7rem", color: "#bbb", marginLeft: 4 }}>({v.checkoutCount.toLocaleString()})</span>
                                </span>
                              ) : "—"}
                            </td>

                            {/* CVR */}
                            <td style={{ ...TD, color: "#111", fontWeight: 600 }}>{pct(v.cvr)}</td>

                            {/* Orders */}
                            <td style={{ ...TD, color: "#555" }}>{v.orders.toLocaleString()}</td>

                            {/* AOV */}
                            <td style={{ ...TD, color: "#555" }}>{v.aov > 0 ? fmt(v.aov, currency) : "—"}</td>

                            {/* RPV */}
                            <td style={{ ...TD, color: "#555" }}>{v.rpv > 0 ? fmt(v.rpv, currency) : "—"}</td>

                            {/* Revenue */}
                            <td style={{ ...TD, color: "#555" }}>{v.revenue > 0 ? fmt(v.revenue, currency) : "—"}</td>

                            {/* Lift + CI */}
                            <td style={{ ...TD }}>
                              {v.isControl ? (
                                <span style={{ color: "#ccc", fontSize: "0.75rem" }}>baseline</span>
                              ) : v.lift !== null ? (
                                <span>
                                  <span style={{ color: liftColor, fontWeight: 600 }}>{v.lift >= 0 ? "+" : ""}{v.lift.toFixed(1)}%</span>
                                  {v.ciLow !== null && v.ciHigh !== null && (
                                    <span style={{ fontSize: "0.68rem", color: "#aaa", marginLeft: 4 }}>{fmtCI(v.ciLow, v.ciHigh)}</span>
                                  )}
                                </span>
                              ) : (
                                <span style={{ color: "#ccc", fontSize: "0.75rem" }}>—</span>
                              )}
                            </td>

                            {/* Confidence */}
                            <td style={{ ...TD, minWidth: 110 }}>
                              {v.isControl ? (
                                <span style={{ color: "#ccc", fontSize: "0.75rem" }}>—</span>
                              ) : conf !== null ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                  <div style={{ flex: 1, height: 5, borderRadius: 3, background: "#f0f0f0", overflow: "hidden", minWidth: 60 }}>
                                    <div style={{
                                      height: "100%",
                                      width: `${conf}%`,
                                      borderRadius: 3,
                                      background: conf >= 95 ? "#16a34a" : conf >= 80 ? "#f59e0b" : "#d1d5db",
                                      transition: "width 0.4s ease",
                                    }} />
                                  </div>
                                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: conf >= 95 ? "#16a34a" : conf >= 80 ? "#d97706" : "#aaa", flexShrink: 0 }}>
                                    {conf}%
                                  </span>
                                </div>
                              ) : (
                                <span style={{ color: "#ccc", fontSize: "0.75rem" }}>not enough data</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer: interpretation hint */}
                <div style={{ padding: "0.6rem 1.25rem", borderTop: "1px solid #f7f7f7", display: "flex", gap: "1.5rem", fontSize: "0.72rem", color: "#bbb" }}>
                  <span>CVR = orders ÷ visitors</span>
                  <span>ATC = unique add-to-cart visitors</span>
                  <span>RPV = revenue ÷ visitors</span>
                  <span>Confidence ≥ 95% = statistically significant at p &lt; 0.05</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Badge({ color, bg, children }: { color: string; bg: string; children: React.ReactNode }) {
  return (
    <span style={{ marginLeft: "0.4rem", fontSize: "0.63rem", color, background: bg, borderRadius: 3, padding: "0.1rem 0.4rem" }}>
      {children}
    </span>
  );
}
