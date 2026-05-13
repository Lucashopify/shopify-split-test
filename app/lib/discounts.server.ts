import { prisma } from "../db.server";

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

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
 * Look up the deployed Shopify Function ID for our price discount extension.
 */
async function getFunctionId(admin: AdminClient): Promise<string | null> {
  // Allow hardcoding via env var to bypass dynamic lookup if shopifyFunctions returns empty
  if (process.env.PRICE_DISCOUNT_FUNCTION_ID) {
    console.log("[getFunctionId] using env var:", process.env.PRICE_DISCOUNT_FUNCTION_ID);
    return process.env.PRICE_DISCOUNT_FUNCTION_ID;
  }

  const resp = await admin.graphql(`
    query GetShopifyFunctions {
      shopifyFunctions(first: 25) {
        nodes {
          id
          apiType
        }
      }
    }
  `);
  const json = await resp.json();
  console.log("[getFunctionId] full response:", JSON.stringify(json));
  const nodes = json?.data?.shopifyFunctions?.nodes ?? [];
  const fn = nodes.find(
    (f: { apiType: string }) => f.apiType.toLowerCase() === "product_discounts",
  );
  console.log("[getFunctionId] matched:", fn ?? "NONE");
  return fn?.id ?? null;
}

/**
 * Create an automatic app discount for a PRICE experiment.
 * Returns the Shopify discount GID, or null on failure.
 */
export async function createPriceDiscount(
  admin: AdminClient,
  config: PriceDiscountConfig,
  experimentName: string,
): Promise<string | null> {
  const functionId = await getFunctionId(admin);
  if (!functionId) {
    console.error("[discounts] split-test-price-discount function not found — deploy app first");
    return null;
  }

  const resp = await admin.graphql(
    `mutation CreatePriceDiscount($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) {
        automaticAppDiscount {
          discountId
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        discount: {
          title: experimentName,
          functionId,
          startsAt: new Date().toISOString(),
          metafields: [
            {
              namespace: "split_test_app",
              key: "discount_config",
              type: "json",
              value: JSON.stringify(config),
            },
          ],
        },
      },
    },
  );

  const { data } = await resp.json();
  const errs = data?.discountAutomaticAppCreate?.userErrors ?? [];
  if (errs.length) {
    console.error("[discounts] Create errors:", errs);
    return null;
  }

  return data?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId ?? null;
}

/**
 * Delete an automatic app discount and clear the stored ID from the experiment.
 */
export async function deletePriceDiscount(
  admin: AdminClient,
  discountId: string,
  experimentId: string,
): Promise<void> {
  const resp = await admin.graphql(
    `mutation DeleteDiscount($id: ID!) {
      discountAutomaticDelete(id: $id) {
        deletedAutomaticDiscountId
        userErrors { field message }
      }
    }`,
    { variables: { id: discountId } },
  );
  const { data } = await resp.json();
  const errs = data?.discountAutomaticDelete?.userErrors ?? [];
  if (errs.length) {
    console.error("[discounts] Delete errors:", errs);
  }

  // Always clear the stored ID, even on partial failure
  await prisma.experiment.update({
    where: { id: experimentId },
    data: { shopifyDiscountId: null },
  });
}
