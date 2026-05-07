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
    // Must delete child rows before parents (no cascade set on Event/Order/Allocation)
    const re = await prisma.event.deleteMany({ where: { shopId } });
    log.push(`Deleted ${re.count} events`);

    const ro = await prisma.order.deleteMany({ where: { shopId } });
    log.push(`Deleted ${ro.count} orders`);

    const experiments = await prisma.experiment.findMany({ where: { shopId }, select: { id: true } });
    const expIds = experiments.map(e => e.id);
    log.push(`Found ${expIds.length} experiments`);

    if (expIds.length > 0) {
      const r1 = await prisma.allocation.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r1.count} allocations`);

      const r2 = await prisma.experimentResult.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r2.count} results`);

      const r3 = await prisma.auditLog.deleteMany({ where: { experimentId: { in: expIds } } });
      log.push(`Deleted ${r3.count} audit logs`);

      const r4 = await prisma.experiment.deleteMany({ where: { id: { in: expIds } } });
      log.push(`Deleted ${r4.count} experiments`);
    }

    const rv = await prisma.visitor.deleteMany({ where: { shopId } });
    log.push(`Deleted ${rv.count} visitors`);

    log.push(`Done. Open the app — onboarding will show.`);
    return new Response(log.join("\n"), { headers: { "Content-Type": "text/plain" } });
  } catch (err) {
    log.push(`ERROR: ${String(err)}`);
    return new Response(log.join("\n"), { status: 500, headers: { "Content-Type": "text/plain" } });
  }
};
