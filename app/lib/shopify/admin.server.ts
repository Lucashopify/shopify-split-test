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
 * Fetch all themes for the shop.
 */
export async function getThemes(admin: {
  graphql: (query: string) => Promise<Response>;
}) {
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
  return data.themes.nodes as Array<{
    id: string;
    name: string;
    role: string;
    createdAt: string;
    updatedAt: string;
  }>;
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
 * Returns only files that have a view suffix — default templates are excluded.
 */
export async function getThemeTemplateFiles(
  admin: { graphql: (query: string, options?: { variables: Record<string, unknown> }) => Promise<Response> },
): Promise<Array<{ filename: string; type: string; view: string }>> {
  const themesResp = await admin.graphql(`
    query GetMainTheme {
      themes(first: 1, roles: [MAIN]) {
        nodes { id }
      }
    }
  `);
  const { data: themesData } = await themesResp.json();
  const themeId: string | undefined = themesData?.themes?.nodes?.[0]?.id;
  if (!themeId) return [];

  const filesResp = await admin.graphql(
    `query GetThemeFiles($id: ID!) {
      theme(id: $id) {
        files(first: 250) {
          nodes { filename }
        }
      }
    }`,
    { variables: { id: themeId } },
  );
  const { data: filesData } = await filesResp.json();
  const files: Array<{ filename: string }> = filesData?.theme?.files?.nodes ?? [];

  return files
    .filter((f) => f.filename.startsWith("templates/") && f.filename.endsWith(".json"))
    .map((f) => {
      const base = f.filename.slice("templates/".length, -".json".length);
      const dotIdx = base.indexOf(".");
      if (dotIdx === -1) return null; // default template — skip
      return { filename: f.filename, type: base.slice(0, dotIdx), view: base.slice(dotIdx + 1) };
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
