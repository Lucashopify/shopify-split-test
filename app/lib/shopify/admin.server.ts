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
  }>).filter((t) => t.role !== "DEMO");

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
        plan { displayName }
      }
    }
  `);

  const { data } = await response.json();
  return data.shop as {
    myshopifyDomain: string;
    primaryDomain: { url: string };
    currencyCode: string;
    ianaTimezone: string;
    plan: { displayName: string };
  };
}
