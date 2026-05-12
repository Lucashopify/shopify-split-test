import { type LoaderFunctionArgs } from "react-router";
import { REQUIRED_SCOPES } from "../lib/scopes";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const scopes = REQUIRED_SCOPES;
  const redirectUri = `${appUrl}/auth/callback`;
  const state = Math.random().toString(36).slice(2);
  const oauthUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=offline`;

  return new Response(
    `<!DOCTYPE html><html><head><script>window.top.location.href = ${JSON.stringify(oauthUrl)};</script></head><body></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
};
