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
      nodes { id apiType }
    }
  }`);
  const { data: fnData } = await fnResp.json();
  const fn = (fnData?.shopifyFunctions?.nodes ?? []).find(
    (n: { apiType: string }) => n.apiType === "cart_transform",
  );
  if (!fn) {
    console.warn("[cartTransform] cart_transform function not found — deploy the extension first");
    return null;
  }

  const listResp = await admin.graphql(`{
    cartTransforms(first: 10) {
      nodes { id }
    }
  }`);
  const { data: listData } = await listResp.json();
  const existing = listData?.cartTransforms?.nodes?.[0];
  if (existing) return existing.id as string;

  const createResp = await admin.graphql(
    `mutation CartTransformCreate($functionId: ID!) {
      cartTransformCreate(functionId: $functionId) {
        cartTransform { id }
        userErrors { field message code }
      }
    }`,
    { variables: { functionId: fn.id } },
  );
  const { data: createData } = await createResp.json();
  const errs = createData?.cartTransformCreate?.userErrors ?? [];
  if (errs.length) {
    console.error("[cartTransform] Create errors:", errs);
    return null;
  }
  return (createData?.cartTransformCreate?.cartTransform?.id ?? null) as string | null;
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
  }
}
