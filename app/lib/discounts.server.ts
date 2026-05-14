import { prisma } from "../db.server";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export type CartTransformExperiment = {
  experimentId: string;
  targetProductId: string;
  variants: Array<{
    id: string;
    isControl: boolean;
    priceAdjType: string | null;
    priceAdjValue: number | null;
  }>;
};

/**
 * Ensure the shop has a Cart Transform registration for our function.
 * Returns the CartTransform GID, or null on failure.
 * Safe to call repeatedly — reuses existing registration.
 */
export async function ensureCartTransform(admin: AdminClient): Promise<string | null> {
  // Find our cart_transform function
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

  // Check if already registered
  const listResp = await admin.graphql(`{
    cartTransforms(first: 10) {
      nodes { id }
    }
  }`);
  const { data: listData } = await listResp.json();
  const existing = listData?.cartTransforms?.nodes?.[0];
  if (existing) return existing.id as string;

  // Register
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
    include: { variants: { select: { id: true, isControl: true, priceAdjType: true, priceAdjValue: true } } },
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

export type PriceDiscountConfig = {
  experimentId: string;
  targetProductId: string;
  variants: Array<{
    id: string;
    isControl: boolean;
    priceAdjType: string | null;
    priceAdjValue: number | null;
  }>;
};

/**
 * Derive a deterministic discount code from the experiment ID.
 * e.g. "cmp49pgvj0005p61yi3khkxsx" → "SPT-I3KHKXSX"
 */
export function priceDiscountCode(experimentId: string): string {
  return `SPT-${experimentId.slice(-8).toUpperCase()}`;
}

/**
 * Create a discount CODE for a PRICE experiment.
 * Returns the DiscountCodeNode GID (used for deletion), or null on failure.
 * The code is derived from the experiment ID so the storefront JS can compute
 * it and append ?discount=CODE to the checkout URL for test-group visitors.
 */
export async function createPriceDiscount(
  admin: AdminClient,
  config: PriceDiscountConfig,
  experimentName: string,
): Promise<string | null> {
  const testVariant = config.variants.find((v) => !v.isControl);
  if (!testVariant?.priceAdjType || testVariant.priceAdjValue == null) {
    console.error("[discounts] No test variant with price adjustment");
    return null;
  }

  const code = priceDiscountCode(config.experimentId);

  const discountValue =
    testVariant.priceAdjType === "percent"
      ? { percentage: testVariant.priceAdjValue / 100 }
      : { discountAmount: { amount: String(testVariant.priceAdjValue), appliesOnEachItem: true } };

  const resp = await admin.graphql(
    `mutation CreateDiscountCode($input: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $input) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          title: experimentName,
          code,
          startsAt: new Date().toISOString(),
          customerSelection: { all: true },
          customerGets: {
            value: discountValue,
            items: { products: { productsToAdd: [config.targetProductId] } },
          },
          appliesOncePerCustomer: false,
        },
      },
    },
  );

  const { data } = await resp.json();
  const errs = data?.discountCodeBasicCreate?.userErrors ?? [];
  if (errs.length) {
    console.error("[discounts] Create code errors:", errs);
    return null;
  }

  const nodeId: string | null = data?.discountCodeBasicCreate?.codeDiscountNode?.id ?? null;
  console.log("[discounts] Discount code created:", code, "nodeId:", nodeId);
  return nodeId;
}

/**
 * Delete a price discount and clear the stored ID from the experiment.
 * Handles both legacy automatic discounts and the new code discounts.
 */
export async function deletePriceDiscount(
  admin: AdminClient,
  discountId: string,
  experimentId: string,
): Promise<void> {
  const isCodeDiscount = discountId.includes("DiscountCodeNode");

  const mutation = isCodeDiscount
    ? `mutation DeleteDiscountCode($id: ID!) {
        discountCodeDelete(id: $id) {
          deletedCodeDiscountId
          userErrors { field message }
        }
      }`
    : `mutation DeleteDiscount($id: ID!) {
        discountAutomaticDelete(id: $id) {
          deletedAutomaticDiscountId
          userErrors { field message }
        }
      }`;

  const resp = await admin.graphql(mutation, { variables: { id: discountId } });
  const { data } = await resp.json();
  const errs = isCodeDiscount
    ? (data?.discountCodeDelete?.userErrors ?? [])
    : (data?.discountAutomaticDelete?.userErrors ?? []);
  if (errs.length) {
    console.error("[discounts] Delete errors:", errs);
  }

  await prisma.experiment.update({
    where: { id: experimentId },
    data: { shopifyDiscountId: null },
  });
}
