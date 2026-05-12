import type { LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await requireDashboardSession(request);
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";

  const resp = await admin.graphql(
    `query SearchProducts($q: String!) {
      products(first: 10, query: $q, sortKey: ${q ? "RELEVANCE" : "TITLE"}) {
        nodes {
          id
          title
          featuredImage { url }
          variants(first: 1) {
            nodes { price }
          }
        }
      }
    }`,
    { variables: { q } },
  );

  const { data } = await resp.json();
  const products = (data?.products?.nodes ?? []).map(
    (p: {
      id: string;
      title: string;
      featuredImage: { url: string } | null;
      variants: { nodes: Array<{ price: string }> };
    }) => ({
      id: p.id,
      title: p.title,
      imageUrl: p.featuredImage?.url ?? null,
      price: p.variants.nodes[0]?.price ?? "0.00",
    }),
  );

  return Response.json({ products });
};
