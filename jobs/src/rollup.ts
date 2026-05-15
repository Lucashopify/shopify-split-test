/**
 * Analytics rollup + guardrail worker.
 *
 * Runs every hour via BullMQ repeat job.
 * For each running experiment:
 *   1. Aggregates raw Event/Order rows into ExperimentResult hourly windows
 *   2. Computes derived metrics (CVR, AOV, RPV, ATC rate, p-value, SRM p-value)
 *   3. Evaluates guardrails and auto-pauses the experiment if triggered
 *
 * Guardrails:
 *   SRM     — chi-squared test on visitor allocation; fires at p < 0.01 with ≥100 visitors/variant
 *   RevDrop — control CVR drops > 20% vs first-window baseline; fires after ≥200 control sessions
 */
import { Worker, Queue, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";

const QUEUE_NAME = "analytics-rollup";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const prisma = new PrismaClient();

export const rollupQueue = new Queue(QUEUE_NAME, {
  connection: { url: REDIS_URL },
});

export function startRollupWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { shopId, experimentId } = job.data as {
        shopId?: string;
        experimentId?: string;
      };

      console.log(
        `[rollup] Processing job ${job.id} shop=${shopId ?? "all"} exp=${experimentId ?? "all"}`,
      );

      const experiments = await prisma.experiment.findMany({
        where: {
          status: "RUNNING",
          ...(shopId ? { shopId } : {}),
          ...(experimentId ? { id: experimentId } : {}),
        },
        include: { variants: true },
      });

      for (const exp of experiments) {
        await rollupExperiment(exp);
      }
    },
    { connection: { url: REDIS_URL }, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[rollup] Job ${job?.id} failed:`, err.message);
  });

  rollupQueue.upsertJobScheduler(
    "hourly-rollup",
    { every: 60 * 60 * 1000 },
    { name: "rollup", data: {} },
  );

  return worker;
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

/** Normal CDF approximation (Abramowitz & Stegun 26.2.17) */
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

/** Two-proportion z-test p-value (two-tailed) */
function twoProportionPValue(n1: number, x1: number, n2: number, x2: number): number {
  if (n1 < 1 || n2 < 1) return 1;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;
  const z = (x1 / n1 - x2 / n2) / se;
  return 2 * (1 - normalCDF(Math.abs(z)));
}

/** Chi-squared p-value via Wilson-Hilferty normal approximation */
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

// ---------------------------------------------------------------------------
// Core rollup
// ---------------------------------------------------------------------------

type Experiment = Awaited<ReturnType<typeof prisma.experiment.findMany<{ include: { variants: true } }>>>[number];

async function rollupExperiment(exp: Experiment) {
  const { id: experimentId, shopId, variants, autoStopSrm, autoStopRevDrop } = exp;

  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setMinutes(0, 0, 0);
  const windowStart = new Date(windowEnd);
  windowStart.setHours(windowStart.getHours() - 1);

  // ── 1. Per-variant metrics for this hourly window ────────────────────────
  type VM = {
    variantId: string;
    isControl: boolean;
    trafficWeight: number;
    sessions: number;
    uniqueVisitors: number;
    addToCartCount: number;
    initiateCheckoutCount: number;
    conversionCount: number;
    revenue: number;
    cvr: number;
    aov: number;
    rpv: number;
    atcRate: number;
  };

  const variantMetrics: VM[] = [];

  // For PRICE experiments, sessions = product page views only (visitor saw the price).
  // For all other types, sessions = any page view.
  const pageViewUrlFilter = exp.type === "PRICE" && exp.targetProductHandle
    ? { url: { contains: `/products/${exp.targetProductHandle}` } }
    : {};

  for (const variant of variants) {
    const [sessions, uniqueVisitorRows, addToCartCount, initiateCheckoutCount, conversionCount, revenueAgg] =
      await Promise.all([
        prisma.event.count({
          where: { experimentId, variantId: variant.id, type: "PAGE_VIEW", occurredAt: { gte: windowStart, lt: windowEnd }, ...pageViewUrlFilter },
        }),
        prisma.event.groupBy({
          by: ["visitorId"],
          where: { experimentId, variantId: variant.id, type: "PAGE_VIEW", occurredAt: { gte: windowStart, lt: windowEnd }, ...pageViewUrlFilter },
        }),
        prisma.event.count({
          where: { experimentId, variantId: variant.id, type: "ADD_TO_CART", occurredAt: { gte: windowStart, lt: windowEnd } },
        }),
        prisma.event.count({
          where: { experimentId, variantId: variant.id, type: "INITIATE_CHECKOUT", occurredAt: { gte: windowStart, lt: windowEnd } },
        }),
        prisma.order.count({
          where: { experimentId, variantId: variant.id, processedAt: { gte: windowStart, lt: windowEnd } },
        }),
        prisma.order.aggregate({
          where: { experimentId, variantId: variant.id, processedAt: { gte: windowStart, lt: windowEnd } },
          _sum: { revenue: true },
        }),
      ]);

    const uniqueVisitors = uniqueVisitorRows.length;
    const revenue = revenueAgg._sum.revenue ?? 0;
    variantMetrics.push({
      variantId: variant.id,
      isControl: variant.isControl,
      trafficWeight: variant.trafficWeight,
      sessions,
      uniqueVisitors,
      addToCartCount,
      initiateCheckoutCount,
      conversionCount,
      revenue,
      cvr: sessions > 0 ? conversionCount / sessions : 0,
      aov: conversionCount > 0 ? revenue / conversionCount : 0,
      rpv: sessions > 0 ? revenue / sessions : 0,
      atcRate: sessions > 0 ? addToCartCount / sessions : 0,
    });
  }

  // ── 2. Cumulative totals (all previous windows + this window) ────────────
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

  // ── 3. Statistical significance — min p-value across all treatment vs control ──
  let minPValue = 1;
  for (const t of treatments) {
    const cumT = cum.get(t.variantId);
    if (!cumT || !cumCtrl) continue;
    const p = twoProportionPValue(
      cumCtrl.sessions, cumCtrl.conversions,
      cumT.sessions, cumT.conversions,
    );
    if (p < minPValue) minPValue = p;
  }

  // ── 4. SRM detection — chi-squared on visitor allocation ────────────────
  const MIN_VISITORS_SRM = 100;
  let srmPValue = 1;
  let srmFlagged = false;

  const visitorCounts = variants.map((v) => cum.get(v.id)?.visitors ?? 0);
  const totalVisitors = visitorCounts.reduce((s, c) => s + c, 0);

  if (totalVisitors > 0 && visitorCounts.every((c) => c >= MIN_VISITORS_SRM)) {
    const totalWeight = variants.reduce((s, v) => s + v.trafficWeight, 0);
    const expected = variants.map((v) => (v.trafficWeight / totalWeight) * totalVisitors);
    srmPValue = chiSquaredPValue(visitorCounts, expected);
    srmFlagged = srmPValue < 0.01;
    if (srmFlagged) {
      console.warn(
        `[rollup] SRM detected for experiment ${experimentId} — p=${srmPValue.toFixed(4)}, ` +
        `observed=${JSON.stringify(visitorCounts)}, expected=${expected.map((e) => e.toFixed(0)).join(",")}`,
      );
    }
  }

  // ── 5. Revenue/CVR drop on control — fires after ≥200 sessions ──────────
  const MIN_SESSIONS_REV_DROP = 200;
  let revenueDrop = false;

  if (control && cumCtrl && cumCtrl.sessions >= MIN_SESSIONS_REV_DROP) {
    const firstWindow = await prisma.experimentResult.findFirst({
      where: { experimentId, variantId: control.variantId },
      orderBy: { windowStart: "asc" },
    });
    if (firstWindow && (firstWindow.cvr ?? 0) > 0) {
      const currentCvr = cumCtrl.sessions > 0 ? cumCtrl.conversions / cumCtrl.sessions : 0;
      if (currentCvr < (firstWindow.cvr ?? 0) * 0.8) {
        revenueDrop = true;
        console.warn(
          `[rollup] Control CVR drop for experiment ${experimentId}: ` +
          `${((firstWindow.cvr ?? 0) * 100).toFixed(2)}% → ${(currentCvr * 100).toFixed(2)}%`,
        );
      }
    }
  }

  // ── 6. Upsert hourly result rows ─────────────────────────────────────────
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

  // ── 7. Novelty effect detection ──────────────────────────────────────────
  // Only runs after ≥72h of data. Compares treatment CVR in first 48h vs days 3+.
  // A novelty effect inflates early results; if we detect it we flag (not pause).
  const experimentAgeMs = exp.startAt ? Date.now() - exp.startAt.getTime() : 0;
  const NOVELTY_MIN_AGE_MS = 72 * 60 * 60 * 1000; // 3 days minimum before we can compare
  let noveltyFlagged = exp.noveltyFlagged; // preserve existing flag

  if (!noveltyFlagged && experimentAgeMs >= NOVELTY_MIN_AGE_MS && exp.startAt) {
    const cutoff48h = new Date(exp.startAt.getTime() + 48 * 60 * 60 * 1000);

    for (const treatment of treatments) {
      const [early, later] = await Promise.all([
        prisma.experimentResult.aggregate({
          where: { experimentId, variantId: treatment.variantId, windowStart: { lt: cutoff48h } },
          _sum: { sessions: true, conversionCount: true },
        }),
        prisma.experimentResult.aggregate({
          where: { experimentId, variantId: treatment.variantId, windowStart: { gte: cutoff48h } },
          _sum: { sessions: true, conversionCount: true },
        }),
      ]);

      const earlySessions = early._sum.sessions ?? 0;
      const earlyCvr = earlySessions > 0 ? (early._sum.conversionCount ?? 0) / earlySessions : 0;
      const laterSessions = later._sum.sessions ?? 0;
      const laterCvr = laterSessions > 0 ? (later._sum.conversionCount ?? 0) / laterSessions : 0;

      // Flag if early CVR is ≥40% higher than later CVR, with enough data
      if (earlySessions >= 100 && laterSessions >= 100 && laterCvr > 0 && earlyCvr >= laterCvr * 1.4) {
        noveltyFlagged = true;
        console.warn(
          `[rollup] Novelty effect detected for experiment ${experimentId} variant ${treatment.variantId}: ` +
          `early CVR ${(earlyCvr * 100).toFixed(2)}% vs later ${(laterCvr * 100).toFixed(2)}%`,
        );

        await prisma.$transaction([
          prisma.experiment.update({ where: { id: experimentId }, data: { noveltyFlagged: true } }),
          prisma.auditLog.create({
            data: {
              shopId,
              experimentId,
              actor: "system",
              action: "experiment.novelty_flagged",
              after: { variantId: treatment.variantId, earlyCvr, laterCvr },
            },
          }),
        ]);
        break;
      }
    }
  }

  // ── 8. Auto-pause if any guardrail fired ─────────────────────────────────
  const shouldPause = (autoStopSrm && srmFlagged) || (autoStopRevDrop && revenueDrop);

  if (shouldPause) {
    const reason = [
      autoStopSrm && srmFlagged ? `SRM detected (p=${srmPValue.toFixed(4)})` : "",
      autoStopRevDrop && revenueDrop ? "control CVR dropped >20% from first-hour baseline" : "",
    ].filter(Boolean).join("; ");

    console.warn(`[rollup] Auto-pausing experiment ${experimentId}: ${reason}`);

    await prisma.$transaction([
      prisma.experiment.update({
        where: { id: experimentId },
        data: { status: "PAUSED" },
      }),
      prisma.auditLog.create({
        data: {
          shopId,
          experimentId,
          actor: "system",
          action: "experiment.auto_paused",
          after: { reason, srmPValue, srmFlagged, revenueDrop, pValue: minPValue },
        },
      }),
    ]);
  }
}
