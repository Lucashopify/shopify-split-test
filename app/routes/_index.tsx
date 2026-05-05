import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  if (shop) {
    const { prisma } = await import("../db.server");
    const session = await prisma.session.findFirst({
      where: { shop, accessToken: { not: "" } },
    });
    if (session) throw redirect(`/dashboard?shop=${shop}`);
  }

  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const shop = String(formData.get("shop") ?? "").trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (!shop) return { error: "Please enter a shop domain." };

  const normalized = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
  const appUrl = process.env.SHOPIFY_APP_URL ?? "";
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const scopes = process.env.SCOPES ?? "";
  const redirectUri = `${appUrl}/auth/callback`;
  const state = Math.random().toString(36).slice(2);

  const oauthUrl =
    `https://${normalized}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=offline`;

  throw redirect(oauthUrl);
};

export default function Index() {
  const data = useLoaderData<{ shop?: string }>();
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Split Tester</h1>
      <p>Enter your Shopify store domain to continue.</p>
      <Form method="post">
        <input
          type="text"
          name="shop"
          placeholder="your-store.myshopify.com"
          style={{ padding: "0.5rem", marginRight: "0.5rem", width: "280px" }}
        />
        <button type="submit" style={{ padding: "0.5rem 1rem" }}>
          Open app
        </button>
      </Form>
      {data?.shop === "MISSING_SHOP" && <p style={{ color: "red" }}>Please enter a shop domain.</p>}
      {data?.shop === "INVALID_SHOP" && <p style={{ color: "red" }}>Invalid shop domain.</p>}
    </div>
  );
}
