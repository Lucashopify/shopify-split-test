/**
 * Analytics rollup worker.
 *
 * Runs every hour via BullMQ repeat job.
 * For each running experiment, aggregates raw Event rows into ExperimentResult
 * hourly windows and computes derived metrics (CVR, AOV, RPV, ATC rate).
 *
 * Statistical computations (p-value, Bayesian, CUPED) are added in Phase 3.
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

      // Find running experiments to roll up
      const experiments = await prisma.experiment.findMany({
        where: {
          status: "RUNNING",
          ...(shopId ? { shopId } : {}),
          ...(experimentId ? { id: experimentId } : {}),
        },
        include: { variants: true },
      });

      for (const exp of experiments) {
        await rollupExperiment(exp.id, exp.shopId, exp.variants);
      }
    },
    { connection: { url: REDIS_URL }, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[rollup] Job ${job?.id} failed:`, err.message);
  });

  // Schedule the rollup to run every hour
  rollupQueue.upsertJobScheduler(
    "hourly-rollup",
    { every: 60 * 60 * 1000 },
    { name: "rollup", data: {} },
  );

  return worker;
}

async function rollupExperiment(
  experimentId: string,
  _shopId: string,
  variants: Array<{ id: string }>,
) {
  const now = new Date();
  const windowEnd = new Date(now);
  windowEnd.setMinutes(0, 0, 0);
  const windowStart = new Date(windowEnd);
  windowStart.setHours(windowStart.getHours() - 1);

  for (const variant of variants) {
    const [sessions, addToCartCount, initiateCheckoutCount, conversionCount, revenue] =
      await Promise.all([
        prisma.event.count({
          where: {
            experimentId,
            variantId: variant.id,
            type: "PAGE_VIEW",
            occurredAt: { gte: windowStart, lt: windowEnd },
          },
        }),
        prisma.event.count({
          where: {
            experimentId,
            variantId: variant.id,
            type: "ADD_TO_CART",
            occurredAt: { gte: windowStart, lt: windowEnd },
          },
        }),
        prisma.event.count({
          where: {
            experimentId,
            variantId: variant.id,
            type: "INITIATE_CHECKOUT",
            occurredAt: { gte: windowStart, lt: windowEnd },
          },
        }),
        prisma.order.count({
          where: {
            experimentId,
            variantId: variant.id,
            processedAt: { gte: windowStart, lt: windowEnd },
          },
        }),
        prisma.order.aggregate({
          where: {
            experimentId,
            variantId: variant.id,
            processedAt: { gte: windowStart, lt: windowEnd },
          },
          _sum: { revenue: true },
        }),
      ]);

    const revenueTotal = revenue._sum.revenue ?? 0;
    const cvr = sessions > 0 ? conversionCount / sessions : 0;
    const aov = conversionCount > 0 ? revenueTotal / conversionCount : 0;
    const rpv = sessions > 0 ? revenueTotal / sessions : 0;
    const atcRate = sessions > 0 ? addToCartCount / sessions : 0;

    await prisma.experimentResult.upsert({
      where: {
        experimentId_variantId_windowStart: {
          experimentId,
          variantId: variant.id,
          windowStart,
        },
      },
      create: {
        experimentId,
        variantId: variant.id,
        windowStart,
        windowEnd,
        sessions,
        addToCartCount,
        initiateCheckoutCount,
        conversionCount,
        revenue: revenueTotal,
        cvr,
        aov,
        rpv,
        atcRate,
      },
      update: {
        sessions,
        addToCartCount,
        initiateCheckoutCount,
        conversionCount,
        revenue: revenueTotal,
        cvr,
        aov,
        rpv,
        atcRate,
      },
    });
  }
}
