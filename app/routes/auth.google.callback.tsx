/**
 * GET /auth/google/callback
 *
 * Handles the Google OAuth redirect after the merchant authorizes the app.
 * Exchanges the code for tokens, saves them, then redirects to settings.
 */
import { redirect, type LoaderFunctionArgs } from "react-router";
import { decodeOAuthState, exchangeGoogleCode } from "../lib/ga4.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("[ga4 oauth] Google returned error:", error);
    throw redirect("/dashboard/settings?ga4=error");
  }

  if (!code || !state) {
    throw redirect("/dashboard/settings?ga4=error");
  }

  const decoded = decodeOAuthState(state);
  if (!decoded) {
    console.error("[ga4 oauth] Invalid state parameter");
    throw redirect("/dashboard/settings?ga4=error");
  }

  const { shop: shopDomain } = decoded;

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) {
    console.error("[ga4 oauth] Shop not found:", shopDomain);
    throw redirect("/dashboard/settings?ga4=error");
  }

  let tokens: { access_token: string; refresh_token: string; expires_in: number };
  try {
    tokens = await exchangeGoogleCode(code);
  } catch (err) {
    console.error("[ga4 oauth] Token exchange failed:", err);
    throw redirect("/dashboard/settings?ga4=error");
  }

  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      ga4RefreshToken: tokens.refresh_token,
      ga4AccessToken: tokens.access_token,
      ga4AccessTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      // Clear old property selection — merchant needs to pick again
      ga4PropertyId: null,
      ga4PropertyName: null,
    },
  });

  throw redirect("/dashboard/settings?ga4=pick");
};
