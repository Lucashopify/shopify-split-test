import { type LoaderFunctionArgs } from "react-router";
import { prisma } from "../db.server";
import { buildConfig } from "../lib/experiments/config.server";
import { corsHeaders, handlePreflight, jsonResponse } from "../lib/cors.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") return handlePreflight(request);

  const shopDomain = params.shopDomain ?? "";
  if (!shopDomain) {
    return jsonResponse({ error: "shopDomain required" }, request, { status: 422 });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop || shop.uninstalledAt) {
    return jsonResponse(
      { experiments: [], apiUrl: "", updatedAt: new Date().toISOString() },
      request,
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  }

  const config = await buildConfig(shop.id);
  return jsonResponse(config, request, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
  });
};
