import { redirect, createCookieSessionStorage } from "react-router";
import { prisma } from "../db.server";
import { unauthenticated } from "../shopify.server";

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

  const dbSession = await prisma.session.findUnique({
    where: { id: `offline_${shop}` },
  });

  if (!dbSession?.accessToken) {
    throw redirect(`/auth?shop=${shop}`);
  }

  const { admin } = await unauthenticated.admin(shop);

  // Persist shop in the signed cookie session on every request
  cookieSession.set("shop", shop);
  const setCookie = await sessionStorage.commitSession(cookieSession);

  return {
    session: dbSession,
    shop,
    admin,
    headers: new Headers({ "Set-Cookie": setCookie }),
    setCookie,
  };
}
