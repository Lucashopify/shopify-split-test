import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { login } from "../shopify.server";
import { REQUIRED_SCOPES } from "../lib/scopes";
import { createOAuthState } from "../lib/oauth-state.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const hmac = url.searchParams.get("hmac");

  if (shop && hmac) {
    const { prisma } = await import("../db.server");
    const shopRecord = await prisma.shop.findFirst({
      where: { shopDomain: shop, uninstalledAt: null, accessToken: { not: "" } },
    });

    // Already installed — go to dashboard
    if (shopRecord) throw redirect(`/dashboard?shop=${shop}`);

    // New install or re-auth — start OAuth
    const normalized = shop.includes(".myshopify.com") ? shop : `${shop}.myshopify.com`;
    const appUrl = process.env.SHOPIFY_APP_URL ?? "";
    const apiKey = process.env.SHOPIFY_API_KEY ?? "";
    const scopes = REQUIRED_SCOPES;
    const redirectUri = `${appUrl}/auth/callback`;
    const { state, setCookie } = await createOAuthState(request);
    throw redirect(
      `https://${normalized}/admin/oauth/authorize` +
      `?client_id=${apiKey}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&grant_options[]=offline`,
      { headers: { "Set-Cookie": setCookie } },
    );
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
  const scopes = REQUIRED_SCOPES;
  const redirectUri = `${appUrl}/auth/callback`;
  const { state, setCookie } = await createOAuthState(request);

  const oauthUrl =
    `https://${normalized}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${encodeURIComponent(scopes)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${state}` +
    `&grant_options[]=offline`;

  throw redirect(oauthUrl, { headers: { "Set-Cookie": setCookie } });
};

export default function Index() {
  const data = useLoaderData<{ shop?: string }>();
  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#f9f9f9",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 1.5rem" }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem", justifyContent: "center" }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
            <img src="/arktic-icon.png" alt="Arktic" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <span style={{ fontSize: "1rem", fontWeight: 600, color: "#111", letterSpacing: "-0.02em" }}>Arktic</span>
        </div>

        {/* Card */}
        <div style={{ background: "#fff", border: "1px solid #e9e9e9", borderRadius: 12, padding: "2rem" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, color: "#111", margin: "0 0 0.375rem", letterSpacing: "-0.02em" }}>
            Connect your store
          </h1>
          <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0 0 1.5rem", lineHeight: 1.5 }}>
            Enter your Shopify store domain to access your dashboard.
          </p>

          <Form method="post">
            <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 500, color: "#555", marginBottom: "0.375rem" }}>
              Store domain
            </label>
            <input
              type="text"
              name="shop"
              placeholder="your-store.myshopify.com"
              autoComplete="off"
              autoFocus
              style={{
                width: "100%",
                padding: "0.5rem 0.75rem",
                border: "1px solid #e9e9e9",
                borderRadius: 6,
                fontSize: "0.875rem",
                color: "#111",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: "1rem",
                background: "#fff",
              }}
            />
            {(data?.shop === "MISSING_SHOP" || data?.shop === "INVALID_SHOP") && (
              <p style={{ fontSize: "0.75rem", color: "#dc2626", margin: "-0.5rem 0 0.75rem" }}>
                {data.shop === "MISSING_SHOP" ? "Please enter your store domain." : "Invalid store domain."}
              </p>
            )}
            <button
              type="submit"
              style={{
                width: "100%",
                padding: "0.55rem 1rem",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "-0.01em",
              }}
            >
              Continue →
            </button>
          </Form>
        </div>

        <p style={{ textAlign: "center", fontSize: "0.75rem", color: "#bbb", marginTop: "1.25rem" }}>
          Access Arktic from your{" "}
          <a href="https://admin.shopify.com" style={{ color: "#aaa", textDecoration: "none" }}>
            Shopify Admin → Apps
          </a>
        </p>
      </div>
    </div>
  );
}
