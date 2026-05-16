/**
 * Computes store-level funnel analytics to feed the experiment idea engine.
 */
import { prisma } from "../../db.server";

export interface StoreContext {
  shop: {
    currency: string;
    isShopifyPlus: boolean;
  };
  last30Days: {
    orders: number;
    revenue: number;
    aov: number;
    cvr: number | null;
  };
  deviceBreakdown: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
  topPages: Array<{
    url: string;
    sessions: number;
    atcEvents: number;
    atcRate: number;
  }>;
  experimentHistory: Array<{
    name: string;
    type: string;
    status: string;
    daysRan: number;
    didWin: boolean | null;
    liftPct: number | null;
  }>;
  currentlyTesting: string[];
  testedTypes: string[];
  untestedTypes: string[];
}

const ALL_TYPES = ["THEME", "PRICE", "URL_REDIRECT", "SECTION", "TEMPLATE"];

export async function buildStoreContext(shopId: string): Promise<StoreContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [shop, orders, visitors, eventGroups, experiments, results] = await Promise.all([
    prisma.shop.findUnique({
      where: { id: shopId },
      select: { currency: true, isShopifyPlus: true },
    }),
    prisma.order.findMany({
      where: { shopId, processedAt: { gte: thirtyDaysAgo }, status: "paid" },
      select: { revenue: true },
    }),
    prisma.visitor.findMany({
      where: { shopId, lastSeenAt: { gte: thirtyDaysAgo } },
      select: { device: true },
    }),
    prisma.event.groupBy({
      by: ["url", "type"],
      where: { shopId, occurredAt: { gte: thirtyDaysAgo }, url: { not: null } },
      _count: { id: true },
    }),
    prisma.experiment.findMany({
      where: { shopId },
      select: {
        name: true,
        type: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        variants: { select: { id: true, isControl: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.experimentResult.findMany({
      where: { experiment: { shopId }, windowStart: { gte: thirtyDaysAgo } },
      select: { experimentId: true, variantId: true, liftPct: true, cvr: true },
      orderBy: { windowEnd: "desc" },
    }),
  ]);

  // Revenue / orders
  const totalRevenue = orders.reduce((s, o) => s + o.revenue, 0);
  const aov = orders.length > 0 ? totalRevenue / orders.length : 0;

  // Device breakdown
  const deviceCounts = { mobile: 0, tablet: 0, desktop: 0 };
  for (const v of visitors) {
    const d = (v.device ?? "desktop") as keyof typeof deviceCounts;
    if (d in deviceCounts) deviceCounts[d]++;
  }

  // Top pages by session count
  const pageMap: Record<string, { sessions: number; atc: number }> = {};
  for (const eg of eventGroups) {
    if (!eg.url) continue;
    let path = eg.url;
    try { path = new URL(eg.url).pathname; } catch { /* keep as-is */ }
    if (!pageMap[path]) pageMap[path] = { sessions: 0, atc: 0 };
    if (eg.type === "PAGE_VIEW") pageMap[path].sessions += eg._count.id;
    if (eg.type === "ADD_TO_CART") pageMap[path].atc += eg._count.id;
  }

  const topPages = Object.entries(pageMap)
    .filter(([, v]) => v.sessions > 0)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 10)
    .map(([url, v]) => ({
      url,
      sessions: v.sessions,
      atcEvents: v.atc,
      atcRate: Math.round((v.atc / v.sessions) * 1000) / 10,
    }));

  const totalSessions = topPages.reduce((s, p) => s + p.sessions, 0);
  const cvr = totalSessions > 0 ? Math.round((orders.length / totalSessions) * 10000) / 100 : null;

  // Experiment history
  const resultsByExp: Record<string, typeof results> = {};
  for (const r of results) {
    if (!resultsByExp[r.experimentId]) resultsByExp[r.experimentId] = [];
    resultsByExp[r.experimentId].push(r);
  }

  const experimentHistory = experiments
    .filter((e) => ["COMPLETED", "ARCHIVED"].includes(e.status))
    .slice(0, 15)
    .map((e) => {
      const expResults = resultsByExp[e.id] ?? [];
      const controlId = e.variants.find((v) => v.isControl)?.id;
      const nonControlResults = expResults.filter((r) => r.variantId !== controlId);
      const bestLift = nonControlResults.length
        ? Math.max(...nonControlResults.map((r) => r.liftPct ?? 0))
        : null;
      const daysRan = Math.round(
        (e.updatedAt.getTime() - e.createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        name: e.name,
        type: e.type,
        status: e.status,
        daysRan,
        didWin: bestLift !== null ? bestLift > 0 : null,
        liftPct: bestLift !== null ? Math.round(bestLift * 10) / 10 : null,
      };
    });

  const testedTypes = [...new Set(experiments.map((e) => e.type as string))];
  const untestedTypes = ALL_TYPES.filter((t) => !testedTypes.includes(t));
  const currentlyTesting = experiments
    .filter((e) => e.status === "RUNNING")
    .map((e) => e.name);

  return {
    shop: {
      currency: shop?.currency ?? "USD",
      isShopifyPlus: shop?.isShopifyPlus ?? false,
    },
    last30Days: { orders: orders.length, revenue: Math.round(totalRevenue), aov: Math.round(aov * 100) / 100, cvr },
    deviceBreakdown: deviceCounts,
    topPages,
    experimentHistory,
    currentlyTesting,
    testedTypes,
    untestedTypes,
  };
}
