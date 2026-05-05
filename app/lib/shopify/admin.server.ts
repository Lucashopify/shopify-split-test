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
