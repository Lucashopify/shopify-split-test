/**
 * Order reconciliation worker.
 *
 * Runs nightly (and on-demand when an orders/cancelled or orders/refunded
 * webhook fires). Updates Order.revenueAdjusted and Order.status so the
 * dashboard revenue numbers stay accurate.
 *
 * Full attribution pipeline (match order → visitor → experiment) ships in Phase 3.
 */
import { Worker, Queue, type Job } from "bullmq";
import { PrismaClient } from "@prisma/client";

const QUEUE_NAME = "order-reconcile";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

const prisma = new PrismaClient();

export const reconcileQueue = new Queue(QUEUE_NAME, {
  connection: { url: REDIS_URL },
});

export function startReconcileWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { shopId, shopifyOrderId } = job.data as {
        shopId?: string;
        shopifyOrderId?: string;
      };

      console.log(
        `[reconcile] Processing job ${job.id} shop=${shopId ?? "all"} order=${shopifyOrderId ?? "all"}`,
      );

      // TODO Phase 3:
      // 1. Query Shopify Admin API for updated order status / refunds
      // 2. Update Order.revenueAdjusted and Order.status
      // 3. Re-trigger the rollup for affected experiments
      // 4. Apply outlier capping (winsorize at 99th percentile)
      // 5. Check SRM after reconciliation
    },
    { connection: { url: REDIS_URL }, concurrency: 3 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[reconcile] Job ${job?.id} failed:`, err.message);
  });

  // Nightly reconciliation at 2am UTC
  reconcileQueue.upsertJobScheduler(
    "nightly-reconcile",
    { pattern: "0 2 * * *" },
    { name: "reconcile", data: {} },
  );

  return worker;
}

/**
 * Enqueue a reconcile job for a specific order (called from webhook handler).
 */
export async function enqueueOrderReconcile(
  shopId: string,
  shopifyOrderId: string,
) {
  await reconcileQueue.add("reconcile-order", { shopId, shopifyOrderId });
}
