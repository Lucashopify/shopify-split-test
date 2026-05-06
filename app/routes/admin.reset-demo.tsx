/**
 * TEMPORARY — delete after recording demo video.
 * GET /admin/reset-demo?secret=splittest-reset
 * Deletes all experiments for the demo shop so onboarding shows again.
 */
import { type LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== "splittest-reset") {
    return new Response("Forbidden", { status: 403 });
  }

  const shop = await prisma.shop.findFirst({
    where: { shopDomain: { contains: "arkticstudio-demo" } },
  });

  if (!shop) return new Response("Shop not found", { status: 404 });

  const shopId = shop.id;
  const log: string[] = [`Shop: ${shop.shopDomain} (${shopId})`];

  try {
    const experiments = await prisma.experiment.findMany({ where: { shopId }, select: { id: true } });
    const expIds = experiments.map(e => e.id);
    log.push(`Found ${expIds.length} experiments`);

    if (expIds.length > 0) {
      const r1 = await prisma.auditLog.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r1.count} audit logs`);

      const r2 = await prisma.experimentResult.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r2.count} results`);

      const r3 = await prisma.event.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r3.count} events`);

      const r4 = await prisma.order.updateMany({ where: { experimentId: { in: expIds } }, data: { experimentId: null, variantId: null, visitorId: null } });
      log.push(`Unlinked ${r4.count} orders`);

      const r5 = await prisma.allocation.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r5.count} allocations`);

      const r6 = await prisma.experiment.deleteMany({ where: { id: { in: expIds } } });
      log.push(`Deleted ${r6.count} experiments`);
    }

    log.push(`Done. Open the app — onboarding will show.`);
    return new Response(log.join("\n"), { headers: { "Content-Type": "text/plain" } });
  } catch (err) {
    log.push(`ERROR: ${String(err)}`);
    return new Response(log.join("\n"), { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};
