/**
 * Inline rollup computation — used by the manual "Refresh results" button.
 * Mirrors the logic in jobs/src/rollup.ts but without BullMQ so it can
 * be imported from a React Router route action.
 */
import { prisma } from "../db.server";

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly =
    t * (0.31938153 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 + t * 1.330274429))));
  const base = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? base : 1 - base;
}

function twoProportionPValue(n1: number, x1: number, n2: number, x2: number): number {
  if (n1 < 1 || n2 < 1) return 1;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = (x1 / n1 - x2 / n2) / se;
  return 2 * (1 - normalCDF(Math.abs(z)));
}

function chiSquaredPValue(observed: number[], expected: number[]): number {
  const chi2 = observed.reduce(
    (sum, o, i) => sum + Math.pow(o - expected[i], 2) / Math.max(expected[i], 1),
    0,
  );
  const df = observed.length - 1;
  if (df < 1) return 1;
  const z = ((chi2 / df) ** (1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return 1 - normalCDF(z);
}

export async function runRollup(experimentId: string) {
  const exp = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: { variants: true },
  });
  if (!exp) return;

  const { shopId, variants, autoStopSrm, autoStopRevDrop } = exp;

  const now = new Date();
  const windowEnd = new Date(now); // use current time so in-progress hour is included
  const windowStart = new Date(windowEnd);
  windowStart.setHours(windowStart.getHours() - 1);

  console.log(`[rollup] window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`);
  console.log(`[rollup] variants: ${variants.map((v) => `${v.id}(${v.name})`).join(", ")}`);

  // Debug: count all orders for this experiment regardless of window
  const totalOrders = await prisma.order.count({ where: { experimentId } });
  const totalOrdersAnyVariant = await prisma.order.findMany({
    where: { experimentId },
    select: { id: true, variantId: true, processedAt: true, revenue: true },
  });
  console.log(`[rollup] total orders for experiment: ${totalOrders}`);
  console.log(`[rollup] order details: ${JSON.stringify(totalOrdersAnyVariant)}`);

  const variantMetrics = [];

  for (const variant of variants) {
    const [sessions, uniqueVisitorRows, addToCartCount, initiateCheckoutCount, conversionCount, revenueAgg] =
      await Promise.all([
        prisma.event.count({ where: { experimentId, variantId: variant.id, type: "PAGE_VIEW", occurredAt: { gte: windowStart, lt: windowEnd } } }),
        prisma.event.groupBy({ by: ["visitorId"], where: { experimentId, variantId: variant.id, type: "PAGE_VIEW", occurredAt: { gte: windowStart, lt: windowEnd } } }),
        prisma.event.count({ where: { experimentId, variantId: variant.id, type: "ADD_TO_CART", occurredAt: { gte: windowStart, lt: windowEnd } } }),
        prisma.event.count({ where: { experimentId, variantId: variant.id, type: "INITIATE_CHECKOUT", occurredAt: { gte: windowStart, lt: windowEnd } } }),
        prisma.order.count({ where: { experimentId, variantId: variant.id, processedAt: { gte: windowStart, lt: windowEnd } } }),
        prisma.order.aggregate({ where: { experimentId, variantId: variant.id, processedAt: { gte: windowStart, lt: windowEnd } }, _sum: { revenue: true } }),
      ]);

    const uniqueVisitors = uniqueVisitorRows.length;
    const revenue = revenueAgg._sum.revenue ?? 0;
    console.log(`[rollup] variant ${variant.name}: sessions=${sessions} orders=${conversionCount} revenue=${revenue}`);
    variantMetrics.push({
      variantId: variant.id,
      isControl: variant.isControl,
      trafficWeight: variant.trafficWeight,
      sessions, uniqueVisitors, addToCartCount, initiateCheckoutCount, conversionCount, revenue,
      cvr: sessions > 0 ? conversionCount / sessions : 0,
      aov: conversionCount > 0 ? revenue / conversionCount : 0,
      rpv: sessions > 0 ? revenue / sessions : 0,
      atcRate: sessions > 0 ? addToCartCount / sessions : 0,
    });
  }

  const cumRows = await prisma.experimentResult.groupBy({
    by: ["variantId"],
    where: { experimentId },
    _sum: { sessions: true, conversionCount: true, uniqueVisitors: true },
  });

  const cum = new Map<string, { sessions: number; conversions: number; visitors: number }>();
  for (const vm of variantMetrics) {
    const prev = cumRows.find((r) => r.variantId === vm.variantId);
    cum.set(vm.variantId, {
      sessions: (prev?._sum.sessions ?? 0) + vm.sessions,
      conversions: (prev?._sum.conversionCount ?? 0) + vm.conversionCount,
      visitors: (prev?._sum.uniqueVisitors ?? 0) + vm.uniqueVisitors,
    });
  }

  const control = variantMetrics.find((v) => v.isControl);
  const treatments = variantMetrics.filter((v) => !v.isControl);
  const cumCtrl = control ? cum.get(control.variantId) : undefined;

  let minPValue = 1;
  for (const t of treatments) {
    const cumT = cum.get(t.variantId);
    if (!cumT || !cumCtrl) continue;
    const p = twoProportionPValue(cumCtrl.sessions, cumCtrl.conversions, cumT.sessions, cumT.conversions);
    if (p < minPValue) minPValue = p;
  }

  const visitorCounts = variants.map((v) => cum.get(v.id)?.visitors ?? 0);
  const totalVisitors = visitorCounts.reduce((s, c) => s + c, 0);
  let srmPValue = 1;
  let srmFlagged = false;
  if (totalVisitors > 0 && visitorCounts.every((c) => c >= 100)) {
    const totalWeight = variants.reduce((s, v) => s + v.trafficWeight, 0);
    const expected = variants.map((v) => (v.trafficWeight / totalWeight) * totalVisitors);
    srmPValue = chiSquaredPValue(visitorCounts, expected);
    srmFlagged = srmPValue < 0.01;
  }

  for (const vm of variantMetrics) {
    await prisma.experimentResult.upsert({
      where: { experimentId_variantId_windowStart: { experimentId, variantId: vm.variantId, windowStart } },
      create: {
        experimentId, variantId: vm.variantId, windowStart, windowEnd,
        sessions: vm.sessions, uniqueVisitors: vm.uniqueVisitors,
        addToCartCount: vm.addToCartCount, initiateCheckoutCount: vm.initiateCheckoutCount,
        conversionCount: vm.conversionCount, revenue: vm.revenue,
        cvr: vm.cvr, aov: vm.aov, rpv: vm.rpv, atcRate: vm.atcRate,
        pValue: minPValue, srmPValue, srmFlagged,
      },
      update: {
        sessions: vm.sessions, uniqueVisitors: vm.uniqueVisitors,
        addToCartCount: vm.addToCartCount, initiateCheckoutCount: vm.initiateCheckoutCount,
        conversionCount: vm.conversionCount, revenue: vm.revenue,
        cvr: vm.cvr, aov: vm.aov, rpv: vm.rpv, atcRate: vm.atcRate,
        pValue: minPValue, srmPValue, srmFlagged,
      },
    });
  }

  const shouldPause = (autoStopSrm && srmFlagged) || (autoStopRevDrop && (() => {
    if (!control || !cumCtrl || cumCtrl.sessions < 200) return false;
    const currentCvr = cumCtrl.sessions > 0 ? cumCtrl.conversions / cumCtrl.sessions : 0;
    return false; // baseline check skipped for manual rollup
  })());

  if (shouldPause) {
    await prisma.experiment.update({ where: { id: experimentId }, data: { status: "PAUSED" } });
  }

  console.log(`[rollup] Manual rollup complete for experiment ${experimentId}`);
}
