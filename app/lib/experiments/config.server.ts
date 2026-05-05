/**
 * Experiment config builder + metafield sync.
 *
 * The config object is written to the shop metafield
 * `split_test_app.config` (type: json) whenever:
 *   - An experiment is started, paused, or completed
 *   - Variant traffic weights change on a running experiment
 *
 * The Theme App Extension embed reads this metafield at Liquid render time,
 * so there are zero API calls on the storefront's critical path.
 *
 * Config shape (kept minimal — every byte adds to storefront TTFB):
 * {
 *   "experiments": [
 *     {
 *       "id": "cuid",
 *       "status": "RUNNING",
 *       "trafficAllocation": 100,
 *       "targetTemplate": "product",    // null = all pages
 *       "variants": [
 *         { "id": "cuid", "trafficWeight": 50, "isControl": true }
 *       ]
 *     }
 *   ],
 *   "apiUrl": "https://your-app.fly.dev",
 *   "updatedAt": "2025-01-01T00:00:00.000Z"
 * }
 */
import { prisma } from "../../db.server";

export type ExperimentConfigEntry = {
  id: string;
  type: string;
  status: string;
  trafficAllocation: number;
  targetTemplate: string | null;
  targetUrl: string | null;
  variants: Array<{
    id: string;
    trafficWeight: number;
    isControl: boolean;
    themeId: string | null;
    redirectUrl: string | null;
    priceAdjType: string | null;
    priceAdjValue: number | null;
  }>;
};

export type StorefrontConfig = {
  experiments: ExperimentConfigEntry[];
  apiUrl: string;
  updatedAt: string;
};

/**
 * Build the config object from the database.
 * Only includes RUNNING experiments.
 */
export async function buildConfig(shopId: string): Promise<StorefrontConfig> {
  const experiments = await prisma.experiment.findMany({
    where: { shopId, status: "RUNNING" },
    include: {
      variants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true, trafficWeight: true, isControl: true,
          themeId: true, redirectUrl: true,
          priceAdjType: true, priceAdjValue: true,
        },
      },
    },
  });

  return {
    experiments: experiments.map((exp) => ({
      id: exp.id,
      type: exp.type,
      status: exp.status,
      trafficAllocation: exp.trafficAllocation,
      targetTemplate: exp.targetTemplate,
      targetUrl: exp.targetUrl,
      variants: exp.variants,
    })),
    apiUrl: process.env.SHOPIFY_APP_URL ?? "",
    updatedAt: new Date().toISOString(),
  };
}

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables: Record<string, unknown> },
  ) => Promise<Response>;
};

/**
 * Ensure the metafield definition exists with storefront read access.
 * Without this, shop.metafields.split_test_app.config.value returns nil in Liquid.
 * Safe to call repeatedly — ignores "already exists" errors.
 */
export async function ensureMetafieldDefinition(admin: AdminClient): Promise<void> {
  const resp = await admin.graphql(
    `
    mutation EnsureMetafieldDef($definition: MetafieldDefinitionInput!) {
      metafieldDefinitionCreate(definition: $definition) {
        createdDefinition { id }
        userErrors { field message code }
      }
    }
    `,
    {
      variables: {
        definition: {
          namespace: "split_test_app",
          key: "config",
          name: "Split Test Config",
          description: "Storefront experiment configuration — read by the Split Test theme embed.",
          type: "json",
          ownerType: "SHOP",
        },
      },
    },
  );

  const { data } = await resp.json();
  const errs: Array<{ code: string; message: string }> =
    data?.metafieldDefinitionCreate?.userErrors ?? [];

  // TAKEN means the definition already exists — that's fine
  const fatal = errs.filter((e) => e.code !== "TAKEN");
  if (fatal.length) {
    console.warn("[ensureMetafieldDefinition] Unexpected errors:", fatal);
  }
}

/**
 * Write the config to the shop's metafield via Admin GraphQL.
 * Call this after any experiment status change.
 */
export async function syncConfigToMetafield(
  admin: AdminClient,
  shopId: string,
): Promise<void> {
  const config = await buildConfig(shopId);

  // Resolve the actual shop GID — required by metafieldsSet
  const shopResp = await admin.graphql(`{ shop { id } }`);
  const { data: shopData } = await shopResp.json();
  const shopGid: string = shopData?.shop?.id ?? "";

  const response = await admin.graphql(
    `
    mutation SetConfigMetafield($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      variables: {
        metafields: [
          {
            ownerId: shopGid,
            namespace: "split_test_app",
            key: "config",
            type: "json",
            value: JSON.stringify(config),
          },
        ],
      },
    },
  );

  const { data } = await response.json();

  if (data?.metafieldsSet?.userErrors?.length) {
    const errs = data.metafieldsSet.userErrors
      .map((e: { message: string }) => e.message)
      .join(", ");
    throw new Error(`Metafield sync failed: ${errs}`);
  }
}

/**
 * Register the Web Pixel with the shop so it receives event data.
 * Called once on install (afterAuth).
 * Safe to call again — updates the existing pixel if one exists.
 */
export async function syncWebPixel(admin: AdminClient): Promise<void> {
  const apiUrl = process.env.SHOPIFY_APP_URL ?? "";

  // Check if pixel already registered
  const listResp = await admin.graphql(`
    query GetWebPixels {
      webPixels(first: 10) {
        nodes { id settings }
      }
    }
  `);
  const { data: listData } = await listResp.json();
  const existing = listData?.webPixels?.nodes?.[0];

  const settings = JSON.stringify({ apiUrl });

  if (existing) {
    await admin.graphql(
      `
      mutation UpdateWebPixel($id: ID!, $webPixel: WebPixelInput!) {
        webPixelUpdate(id: $id, webPixel: $webPixel) {
          webPixel { id }
          userErrors { field message }
        }
      }
    `,
      { variables: { id: existing.id, webPixel: { settings } } },
    );
  } else {
    await admin.graphql(
      `
      mutation CreateWebPixel($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          webPixel { id }
          userErrors { field message }
        }
      }
    `,
      { variables: { webPixel: { settings } } },
    );
  }
}
