/**
 * Typed wrappers around the Shopify Admin GraphQL client.
 * These are used by loaders/actions — not by the assignment hot path.
 */

/**
 * Duplicate the live theme to create a variant theme for a theme test.
 * Returns the new theme's GID.
 */
export async function duplicateTheme(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  sourceThemeId: string,
  newTitle: string,
): Promise<string> {
  const response = await admin.graphql(
    `
    mutation DuplicateTheme($id: ID!, $title: String!) {
      themeDuplicate(id: $id, title: $title) {
        newTheme {
          id
          name
          role
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    { variables: { id: sourceThemeId, title: newTitle } },
  );

  const { data } = await response.json();

  if (data.themeDuplicate.userErrors?.length) {
    throw new Error(
      data.themeDuplicate.userErrors.map((e: { message: string }) => e.message).join(", "),
    );
  }

  return data.themeDuplicate.newTheme.id as string;
}

/**
 * Fetch all themes for the shop, with screenshot URLs via Screenshotone.
 * Set SCREENSHOTONE_ACCESS_KEY in env to enable real screenshots.
 */
export async function getThemes(
  admin: { graphql: (query: string) => Promise<Response> },
  _restFetch: (path: string, init?: RequestInit) => Promise<Response>,
  shop?: string,
) {
  const response = await admin.graphql(`
    query GetThemes {
      themes(first: 50) {
        nodes {
          id
          name
          role
          createdAt
          updatedAt
        }
      }
    }
  `);

  const { data } = await response.json();
  const nodes = (data.themes.nodes as Array<{
    id: string;
    name: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>).filter((t) => t.role !== "DEMO" && t.role !== "DEVELOPMENT");

  const screenshotKey = process.env.SCREENSHOTONE_ACCESS_KEY;

  return nodes.map((t) => {
    let iconUrl: string | null = null;
    if (screenshotKey && shop) {
      const numericId = t.id.split("/").pop()!;
      const targetUrl = `https://${shop}/?preview_theme_id=${numericId}`;
      const params = new URLSearchParams({
        access_key: screenshotKey,
        url: targetUrl,
        viewport_width: "1440",
        viewport_height: "900",
        format: "webp",
        image_quality: "70",
        full_page: "false",
        cache: "true",
        cache_ttl: "2592000", // 30 days
      });
      iconUrl = `https://api.screenshotone.com/take?${params.toString()}`;
    }
    return { ...t, iconUrl };
  });
}

/**
 * Delete a theme by GID (used when cleaning up completed theme tests).
 */
export async function deleteTheme(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  themeId: string,
) {
  const response = await admin.graphql(
    `
    mutation DeleteTheme($id: ID!) {
      themeDelete(id: $id) {
        deletedThemeId
        userErrors {
          field
          message
        }
      }
    }
  `,
    { variables: { id: themeId } },
  );

  const { data } = await response.json();

  if (data.themeDelete.userErrors?.length) {
    throw new Error(
      data.themeDelete.userErrors.map((e: { message: string }) => e.message).join(", "),
    );
  }
}

/**
 * Fetch alternate template files (e.g. product.my-test.json) from the live theme.
 * Uses the REST API (more reliable across API versions than theme.files GraphQL).
 * Returns only files that have a view suffix — default templates are excluded.
 */
export async function getThemeTemplateFiles(
  restFetch: (path: string) => Promise<Response>,
): Promise<Array<{ filename: string; type: string; view: string }>> {
  const themesResp = await restFetch("/themes.json?role=main&fields=id");
  const themesData = await themesResp.json();
  const themeId: number | undefined = themesData?.themes?.[0]?.id;
  if (!themeId) return [];

  const assetsResp = await restFetch(`/themes/${themeId}/assets.json?fields=key`);
  const assetsData = await assetsResp.json();
  const assets: Array<{ key: string }> = assetsData?.assets ?? [];

  return assets
    .filter((a) => a.key.startsWith("templates/") && a.key.endsWith(".json"))
    .map((a) => {
      const base = a.key.slice("templates/".length, -".json".length);
      const dotIdx = base.indexOf(".");
      if (dotIdx === -1) return null; // default template — skip
      return { filename: a.key, type: base.slice(0, dotIdx), view: base.slice(dotIdx + 1) };
    })
    .filter((f): f is { filename: string; type: string; view: string } => f !== null);
}

/**
 * Duplicate a product and apply a price adjustment to all variants.
 * Used for non-Plus price tests — the duplicate is the "test price" product
 * that variant B visitors are redirected to.
 *
 * Returns the duplicate's Shopify GID and URL handle.
 */
export async function createPriceTestProduct(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  originalProductGid: string,
  originalProductTitle: string,
  priceAdjType: "percent" | "fixed",
  priceAdjValue: number,
): Promise<{ productGid: string; handle: string }> {
  // 1. Duplicate the product (ACTIVE so it's reachable via URL)
  const dupResp = await admin.graphql(
    `mutation DupProduct($productId: ID!, $newTitle: String!) {
      productDuplicate(productId: $productId, newTitle: $newTitle, newStatus: ACTIVE, includeImages: true) {
        newProduct {
          id
          handle
          variants(first: 100) {
            nodes { id price }
          }
        }
        userErrors { field message }
      }
    }`,
    { variables: { productId: originalProductGid, newTitle: `[SPT] ${originalProductTitle}` } },
  );

  const { data: dupData } = await dupResp.json();
  const errs = dupData?.productDuplicate?.userErrors ?? [];
  if (errs.length) throw new Error(errs.map((e: { message: string }) => e.message).join(", "));

  const newProduct = dupData.productDuplicate.newProduct as {
    id: string;
    handle: string;
    variants: { nodes: Array<{ id: string; price: string }> };
  };

  // 2. Apply price adjustment to every variant on the duplicate
  const updatedVariants = newProduct.variants.nodes.map((v) => {
    const originalCents = Math.round(parseFloat(v.price) * 100);
    const newCents = priceAdjType === "percent"
      ? Math.max(0, Math.round(originalCents * (1 + priceAdjValue / 100)))
      : Math.max(0, Math.round(originalCents + priceAdjValue * 100));
    return { id: v.id, price: (newCents / 100).toFixed(2) };
  });

  const priceResp = await admin.graphql(
    `mutation UpdatePrices($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    { variables: { productId: newProduct.id, variants: updatedVariants } },
  );

  const { data: priceData } = await priceResp.json();
  const priceErrs = priceData?.productVariantsBulkUpdate?.userErrors ?? [];
  if (priceErrs.length) throw new Error(priceErrs.map((e: { message: string }) => e.message).join(", "));

  return { productGid: newProduct.id, handle: newProduct.handle };
}

/**
 * Delete a product by GID. Used to clean up duplicate price-test products
 * when a non-Plus price experiment is completed or archived.
 */
export async function deleteProduct(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
  productGid: string,
): Promise<void> {
  const resp = await admin.graphql(
    `mutation DeleteProduct($id: ID!) {
      productDelete(input: { id: $id }) {
        userErrors { field message }
      }
    }`,
    { variables: { id: productGid } },
  );
  const { data } = await resp.json();
  const errs = data?.productDelete?.userErrors ?? [];
  if (errs.length) throw new Error(errs.map((e: { message: string }) => e.message).join(", "));
}

/**
 * Get shop metadata needed at install time.
 */
export async function getShopMetadata(admin: {
  graphql: (query: string) => Promise<Response>;
}) {
  const response = await admin.graphql(`
    query GetShopMeta {
      shop {
        myshopifyDomain
        primaryDomain { url }
        currencyCode
        ianaTimezone
        plan { displayName shopifyPlus }
      }
    }
  `);

  const { data } = await response.json();
  return data.shop as {
    myshopifyDomain: string;
    primaryDomain: { url: string };
    currencyCode: string;
    ianaTimezone: string;
    plan: { displayName: string; shopifyPlus: boolean };
  };
}
