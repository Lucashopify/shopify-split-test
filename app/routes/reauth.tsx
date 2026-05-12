import { type LoaderFunctionArgs } from "react-router";
import { REQUIRED_SCOPES } from "../lib/scopes";
import { createOAuthState } from "../lib/oauth-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") ?? "";
  const appUrl = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const scopes = REQUIRED_SCOPES;
  const redirectUri = `${appUrl}/auth/callback`;
  const { state, setCookie } = await createOAuthState(request);
  const oauthUrl =
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=offline`;

  return new Response(
    `<!DOCTYPE html><html><head><script>window.top.location.href = ${JSON.stringify(oauthUrl)};</script></head><body></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html", "Set-Cookie": setCookie } },
  );
};
