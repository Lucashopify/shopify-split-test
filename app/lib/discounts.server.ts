import { prisma } from "../db.server";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * Ensure the shop has a Cart Transform registration for our function.
 * Returns the CartTransform GID, or null on failure.
 * Safe to call repeatedly — reuses existing registration.
 */
export async function ensureCartTransform(admin: AdminClient): Promise<string | null> {
  const fnResp = await admin.graphql(`{
    shopifyFunctions(first: 25) {
      nodes { id apiType title }
    }
  }`);
  const fnJson = await fnResp.json();
  const fnNodes = fnJson?.data?.shopifyFunctions?.nodes ?? [];
  console.log("[cartTransform] shopifyFunctions:", JSON.stringify(fnNodes));
  const fn = fnNodes.find(
    (n: { apiType: string }) => n.apiType === "cart_transform",
  );
  if (!fn) {
    console.warn("[cartTransform] cart_transform function not found. Available:", fnNodes.map((n: { apiType: string }) => n.apiType));
    return null;
  }
  console.log("[cartTransform] found function:", fn.id, fn.title);

  const listResp = await admin.graphql(`{
    cartTransforms(first: 10) {
      nodes { id }
    }
  }`);
  const { data: listData } = await listResp.json();
  console.log("[cartTransform] existing transforms:", JSON.stringify(listData?.cartTransforms?.nodes));
  const existing = listData?.cartTransforms?.nodes?.[0];
  if (existing) {
    console.log("[cartTransform] reusing existing transform:", existing.id);
    return existing.id as string;
  }

  const functionHandle = "split-test-cart-transform";
  console.log("[cartTransform] creating with functionHandle:", functionHandle);
  const createResp = await admin.graphql(
    `mutation CartTransformCreate($functionHandle: String!) {
      cartTransformCreate(functionHandle: $functionHandle) {
        cartTransform { id }
        userErrors { field message code }
      }
    }`,
    { variables: { functionHandle } },
  );
  const createJson = await createResp.json();
  console.log("[cartTransform] create response:", JSON.stringify(createJson));
  const createData = createJson?.data;
  const errs = createData?.cartTransformCreate?.userErrors ?? [];
  if (errs.length) {
    console.error("[cartTransform] Create errors:", errs);
    return null;
  }
  const newId = createData?.cartTransformCreate?.cartTransform?.id ?? null;
  console.log("[cartTransform] created transform:", newId);
  return newId as string | null;
}

/**
 * Write all active PRICE experiment configs to the Cart Transform metafield.
 * Called whenever experiment status changes.
 */
export async function syncCartTransformConfig(
  admin: AdminClient,
  shopId: string,
): Promise<void> {
  const cartTransformId = await ensureCartTransform(admin);
  if (!cartTransformId) return;

  const experiments = await prisma.experiment.findMany({
    where: { shopId, status: "RUNNING", type: "PRICE" },
    include: {
      variants: {
        select: { id: true, isControl: true, priceAdjType: true, priceAdjValue: true },
      },
    },
  });

  const config = {
    experiments: experiments.map((exp) => ({
      experimentId: exp.id,
      targetProductId: exp.targetProductId,
      targetProductHandle: exp.targetProductHandle,
      variants: exp.variants.map((v) => ({
        id: v.id,
        isControl: v.isControl,
        priceAdjType: v.priceAdjType,
        priceAdjValue: v.priceAdjValue,
      })),
    })),
  };

  console.log("[cartTransform] syncing config:", JSON.stringify(config));
  const resp = await admin.graphql(
    `mutation SetCartTransformMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [{
          ownerId: cartTransformId,
          namespace: "split_test_app",
          key: "cart_transform_config",
          type: "json",
          value: JSON.stringify(config),
        }],
      },
    },
  );
  const { data } = await resp.json();
  if (data?.metafieldsSet?.userErrors?.length) {
    console.error("[cartTransform] Metafield sync errors:", data.metafieldsSet.userErrors);
  } else {
    console.log("[cartTransform] Metafield synced OK for transform:", cartTransformId);
  }
}
