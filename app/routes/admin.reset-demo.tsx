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

  const result = await prisma.experiment.deleteMany({ where: { shopId: shop.id } });

  return new Response(`Reset done — deleted ${result.count} experiments. You can now open the app and it will show onboarding.`, {
    headers: { "Content-Type": "text/plain" },
  });
};
