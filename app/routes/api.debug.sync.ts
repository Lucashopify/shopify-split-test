import { data, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { syncCartTransformConfig } from "../lib/discounts.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shopId } = await requireDashboardSession(request);

  const result: Record<string, unknown> = {};

  // 0. Show shop record
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  result.shopRecord = { id: shop?.id, myshopifyDomain: shop?.myshopifyDomain };

  // 1. Show all experiments across ALL shops (to find where they went)
  const allShopExperiments = await prisma.experiment.findMany({
    include: { variants: true },
    take: 20,
  });
  result.allExperiments = allShopExperiments.map((e) => ({
    id: e.id,
    shopId: e.shopId,
    name: e.name,
    status: e.status,
    type: e.type,
  }));

  // 2. Force re-sync
  try {
    await syncCartTransformConfig(admin, shopId);
    result.syncStatus = "ok";
  } catch (e) {
    result.syncError = String(e);
  }

  // 3. Read back what's on the cart transform metafield
  try {
    const r = await admin.graphql(`{ cartTransforms(first: 1) { nodes { id blockOnFailure metafield(namespace: "split_test_app", key: "cart_transform_config") { value } } } }`);
    const j = await r.json() as { data?: { cartTransforms?: { nodes: Array<{ id: string; blockOnFailure: boolean; metafield?: { value: string } }> } } };
    const node = j?.data?.cartTransforms?.nodes?.[0];
    result.cartTransform = {
      id: node?.id,
      blockOnFailure: node?.blockOnFailure,
      metafieldValue: node?.metafield?.value ?? null,
    };
  } catch (e) {
    result.cartTransformError = String(e);
  }

  return data(result);
};
