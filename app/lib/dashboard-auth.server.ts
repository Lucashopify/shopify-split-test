import { redirect, createCookieSessionStorage } from "react-router";
import { prisma } from "../db.server";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__dashboard",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    secrets: [process.env.SHOPIFY_API_SECRET ?? "fallback-secret"],
  },
});

export async function requireDashboardSession(request: Request) {
  const url = new URL(request.url);
  const cookieHeader = request.headers.get("Cookie");
  const cookieSession = await sessionStorage.getSession(cookieHeader);

  // Shop from URL param takes priority (e.g. first visit), then fall back to saved session
  let shop = url.searchParams.get("shop") ?? cookieSession.get("shop");

  if (!shop) throw redirect("/");

  const dbShop = await prisma.shop.findFirst({
    where: { shopDomain: shop, uninstalledAt: null, accessToken: { not: "" } },
  });

  if (!dbShop?.accessToken) {
    throw redirect(`/?shop=${shop}`);
  }

  const token = dbShop.accessToken;
  const gqlUrl = `https://${shop}/admin/api/2025-01/graphql.json`;

  // Build a lightweight admin client directly from the stored token so we always
  // use the latest access token from the Shop table (unauthenticated.admin relies
  // on PrismaSessionStorage which can return a stale/invalidated token after reauth).
  const admin = {
    graphql: async (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ): Promise<Response> => {
      const body: Record<string, unknown> = { query };
      if (options?.variables) body.variables = options.variables;
      return fetch(gqlUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify(body),
      });
    },
  };

  // Persist shop in the signed cookie session on every request
  cookieSession.set("shop", shop);
  const setCookie = await sessionStorage.commitSession(cookieSession);

  return {
    session: { shop },
    shop,
    admin,
    headers: new Headers({ "Set-Cookie": setCookie }),
    setCookie,
  };
}
