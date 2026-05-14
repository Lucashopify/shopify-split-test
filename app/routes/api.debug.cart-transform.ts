import { data, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await requireDashboardSession(request);

  const result: Record<string, unknown> = {};

  // 1. List shopify functions
  try {
    const r = await admin.graphql(`{ shopifyFunctions(first: 25) { nodes { id apiType title } } }`);
    const j = await r.json() as { data?: { shopifyFunctions?: { nodes: unknown[] } } };
    result.shopifyFunctions = j?.data?.shopifyFunctions?.nodes ?? [];
  } catch (e) {
    result.shopifyFunctionsError = String(e);
  }

  // 2. List existing cart transforms
  try {
    const r = await admin.graphql(`{ cartTransforms(first: 10) { nodes { id functionId blockOnFailure } } }`);
    const j = await r.json() as { data?: { cartTransforms?: { nodes: unknown[] } } };
    result.cartTransforms = j?.data?.cartTransforms?.nodes ?? [];
  } catch (e) {
    result.cartTransformsError = String(e);
  }

  // 3. Try to create a cart transform if none exists
  const fns = (result.shopifyFunctions as Array<{ id: string; apiType: string }>) ?? [];
  const fn = fns.find((f) => f.apiType === "cart_transform");

  if (!fn) {
    result.createAttempt = "skipped — no cart_transform function found";
  } else if ((result.cartTransforms as unknown[])?.length > 0) {
    result.createAttempt = "skipped — transform already exists";
  } else {
    const functionGid = fn.id.startsWith("gid://") ? fn.id : `gid://shopify/ShopifyFunction/${fn.id}`;
    result.functionGid = functionGid;
    try {
      const createResp = await admin.graphql(
        `mutation CartTransformCreate($functionId: ID!) {
          cartTransformCreate(functionId: $functionId) {
            cartTransform { id functionId }
            userErrors { field message code }
          }
        }`,
        { variables: { functionId: functionGid } },
      );
      const status = createResp.status;
      const body = await createResp.text();
      result.createHttpStatus = status;
      result.createRawBody = body;
      try {
        result.createParsed = JSON.parse(body);
      } catch (_) {
        result.createParseError = "body is not JSON";
      }
    } catch (e) {
      result.createError = String(e);
    }
  }

  // 4. Check the cart transform metafield (if one exists)
  const transforms = result.cartTransforms as Array<{ id: string }>;
  if (transforms?.length > 0) {
    const transformId = transforms[0].id;
    try {
      const mfResp = await admin.graphql(
        `query GetCartTransformMetafield($id: ID!) {
          cartTransform(id: $id) {
            id
            metafield(namespace: "split_test_app", key: "cart_transform_config") {
              id value updatedAt
            }
          }
        }`,
        { variables: { id: transformId } },
      );
      const mfJson = await mfResp.json() as { data?: unknown };
      result.metafield = mfJson?.data;
    } catch (e) {
      result.metafieldError = String(e);
    }
  }

  return data(result);
};
