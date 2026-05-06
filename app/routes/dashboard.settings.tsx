import React from "react";
import { data, redirect, useFetcher, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { syncConfigToMetafield, ensureMetafieldDefinition } from "../lib/experiments/config.server";
import {
  buildGoogleAuthUrl,
  encodeOAuthState,
  getGa4AccessToken,
  listGa4Properties,
  ensureGa4CustomDimension,
  type Ga4Property,
} from "../lib/ga4.server";

function isForbidden(err: unknown): boolean {
  const msg = String((err as Record<string, unknown>)?.message ?? err);
  return msg.includes("403") || msg.toLowerCase().includes("forbidden");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const ga4Step = url.searchParams.get("ga4"); // "pick" | "error" | null

  const { shop: shopDomain, setCookie, admin } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });

  let metafieldDefinitionExists = false;
  let metafieldHasValue = false;
  let configExperimentsCount = 0;
  let needsReauth = false;

  try {
    const defResp = await admin.graphql(`{
      metafieldDefinitions(first: 1, ownerType: SHOP, namespace: "split_test_app", key: "config") {
        nodes { id }
      }
    }`);
    const defData = await defResp.json();
    metafieldDefinitionExists = (defData.data?.metafieldDefinitions?.nodes?.length ?? 0) > 0;
  } catch (err: unknown) {
    if (isForbidden(err)) {
      needsReauth = true;
    } else {
      console.error("[settings loader] metafield def check:", String(err));
    }
  }

  if (!needsReauth) {
    try {
      const valResp = await admin.graphql(`{ shop { metafield(namespace: "split_test_app", key: "config") { value } } }`);
      const valData = await valResp.json();
      const raw = valData.data?.shop?.metafield?.value;
      if (raw) {
        metafieldHasValue = true;
        try { configExperimentsCount = (JSON.parse(raw) as { experiments?: unknown[] })?.experiments?.length ?? 0; } catch {}
      }
    } catch (err: unknown) {
      if (isForbidden(err)) needsReauth = true;
      else console.error("[settings loader] metafield value check:", String(err));
    }
  }

  // GA4 integration state
  const ga4Connected = !!shop?.ga4RefreshToken;
  const ga4PropertyId = shop?.ga4PropertyId ?? null;
  const ga4PropertyName = shop?.ga4PropertyName ?? null;
  let ga4Properties: Ga4Property[] = [];
  let ga4Error: string | null = null;

  if (ga4Step === "pick" && ga4Connected && shop) {
    try {
      const accessToken = await getGa4AccessToken(shop.id);
      if (accessToken) {
        ga4Properties = await listGa4Properties(accessToken);
      }
    } catch (err) {
      ga4Error = "Could not load GA4 properties. Please try reconnecting.";
      console.error("[settings] GA4 property list failed:", err);
    }
  }

  return data({
    shopDomain,
    myshopifyDomain: shop?.myshopifyDomain ?? shopDomain,
    currency: shop?.currency ?? "—",
    timezone: shop?.timezone ?? "—",
    installedAt: shop?.installedAt?.toISOString() ?? null,
    metafieldDefinitionExists,
    metafieldHasValue,
    configExperimentsCount,
    needsReauth,
    ga4Connected,
    ga4PropertyId,
    ga4PropertyName,
    ga4Properties,
    ga4Step,
    ga4Error,
  }, { headers: { "Set-Cookie": setCookie } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "ga4_connect") {
    const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
    const state = encodeOAuthState(shopDomain);
    throw redirect(buildGoogleAuthUrl(state), { headers: { "Set-Cookie": setCookie } });
  }

  if (intent === "ga4_disconnect") {
    const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (shop) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: {
          ga4RefreshToken: null,
          ga4AccessToken: null,
          ga4AccessTokenExpiry: null,
          ga4PropertyId: null,
          ga4PropertyName: null,
        },
      });
    }
    return data({ ok: true, message: "Google Analytics disconnected." }, { headers: { "Set-Cookie": setCookie } });
  }

  if (intent === "ga4_save_property") {
    const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
    const propertyId = String(formData.get("propertyId") ?? "").trim();
    const propertyName = String(formData.get("propertyName") ?? "").trim();
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (shop && propertyId) {
      await prisma.shop.update({
        where: { id: shop.id },
        data: { ga4PropertyId: propertyId, ga4PropertyName: propertyName },
      });
      // Auto-create the custom dimension in GA4
      try {
        const accessToken = await getGa4AccessToken(shop.id);
        if (accessToken) await ensureGa4CustomDimension(propertyId, accessToken);
      } catch (err) {
        console.error("[settings] GA4 custom dimension creation failed:", err);
      }
    }
    return data({ ok: true, message: "Google Analytics property connected." }, { headers: { "Set-Cookie": setCookie } });
  }

  if (intent === "reauth") {
    const shopParam = String(formData.get("shop") ?? "").trim().toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    const normalized = shopParam.includes(".myshopify.com") ? shopParam : `${shopParam}.myshopify.com`;
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
  }

  const { shop: shopDomain, setCookie, admin } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return data({ error: "Shop not found" }, { headers: { "Set-Cookie": setCookie } });

  if (intent === "force_sync") {
    try {
      await ensureMetafieldDefinition(admin);
      await syncConfigToMetafield(admin, shop.id);
    } catch (err: unknown) {
      console.error("[settings force_sync] error:", String(err));
      if (isForbidden(err)) {
        return data({ error: "forbidden", needsReauth: true }, { headers: { "Set-Cookie": setCookie } });
      }
      return data({ error: String(err) }, { headers: { "Set-Cookie": setCookie } });
    }
    return data({ ok: true, message: "Config synced to storefront." }, { headers: { "Set-Cookie": setCookie } });
  }

  return data({ error: "Unknown intent" }, { headers: { "Set-Cookie": setCookie } });
};

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", padding: "0.875rem 0", borderBottom: "1px solid #f3f3f3" }}>
      <div style={{ width: 220, fontSize: "0.8125rem", color: "#777", flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: "0.8125rem", color: "#111", fontFamily: mono ? "monospace" : "inherit" }}>{value}</div>
    </div>
  );
}

function StatusDot({ ok, label, warn }: { ok: boolean; label?: string; warn?: boolean }) {
  const color = ok ? "#16a34a" : warn ? "#d97706" : "#dc2626";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem", color }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, display: "inline-block" }} />
      {label ?? (ok ? "Active" : "Not detected")}
    </span>
  );
}

export default function SettingsPage() {
  const {
    shopDomain, myshopifyDomain, currency, timezone, installedAt,
    metafieldDefinitionExists, metafieldHasValue,
    configExperimentsCount, needsReauth,
    ga4Connected, ga4PropertyId, ga4PropertyName, ga4Properties, ga4Step, ga4Error,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string; needsReauth?: boolean }>();
  const syncing = fetcher.state !== "idle";
  const showReauth = needsReauth || fetcher.data?.needsReauth;
  const themeEditorUrl = `https://${shopDomain}/admin/themes/current/editor?context=apps`;

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 680, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 2rem", letterSpacing: "-0.03em", color: "#111" }}>Settings</h1>

      {/* Re-auth banner */}
      {showReauth && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#92400e", marginBottom: "0.4rem" }}>Re-authorization required</div>
          <p style={{ fontSize: "0.8125rem", color: "#78350f", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
            Shopify is rejecting the stored access token. Go to your <strong>Shopify Partner Dashboard → App → Configuration</strong>, enable <strong>Token expiration</strong>, then re-authorize.
          </p>
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="reauth" />
            <input type="hidden" name="shop" value={myshopifyDomain} />
            <button type="submit" style={{ padding: "0.45rem 1rem", background: "#d97706", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>
              Re-authorize app →
            </button>
          </fetcher.Form>
        </div>
      )}

      {/* Store info */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>Store</div>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "0 1.25rem" }}>
          <Row label="Domain" value={shopDomain} mono />
          <Row label="Currency" value={currency} />
          <Row label="Timezone" value={timezone} />
          <Row label="Installed" value={installedAt ? new Date(installedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"} />
        </div>
      </section>

      {/* Storefront embed */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>Storefront embed</div>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem" }}>
          <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500, marginBottom: "0.3rem" }}>App embed</div>
          <p style={{ fontSize: "0.8125rem", color: "#777", margin: "0 0 0.875rem", lineHeight: 1.6 }}>
            The Split Tester embed loads the tracking script on every storefront page. Without it, no experiments will run.
          </p>
          <a
            href={themeEditorUrl}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.4rem 0.875rem", background: "#111", color: "#fff", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, textDecoration: "none" }}
          >
            Open Theme Editor ↗
          </a>
          <p style={{ fontSize: "0.75rem", color: "#bbb", margin: "0.625rem 0 0", lineHeight: 1.5 }}>
            In the Theme Editor, go to <strong style={{ color: "#999" }}>App embeds</strong> and toggle on <strong style={{ color: "#999" }}>Split Tester</strong>, then save.
          </p>
        </div>
      </section>

      {/* Diagnostics */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>Diagnostics</div>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "0 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", borderBottom: "1px solid #f3f3f3" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500, marginBottom: "0.15rem" }}>Metafield definition</div>
              <div style={{ fontSize: "0.75rem", color: "#aaa" }}>Required for the embed to read experiment config at Liquid render time.</div>
            </div>
            <StatusDot ok={metafieldDefinitionExists} label={metafieldDefinitionExists ? "Exists" : "Missing"} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0", borderBottom: "1px solid #f3f3f3" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500, marginBottom: "0.15rem" }}>Config synced</div>
              <div style={{ fontSize: "0.75rem", color: "#aaa" }}>
                {metafieldHasValue ? `${configExperimentsCount} running experiment${configExperimentsCount !== 1 ? "s" : ""} in storefront config.` : "No config written yet. Start an experiment to populate this."}
              </div>
            </div>
            <StatusDot ok={metafieldHasValue} warn={!metafieldHasValue} label={metafieldHasValue ? "Synced" : "Not synced"} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 0" }}>
            <div>
              <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500, marginBottom: "0.15rem" }}>Force sync</div>
              <div style={{ fontSize: "0.75rem", color: "#aaa" }}>Manually push experiment config to the storefront metafield.</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              {fetcher.data?.message && <span style={{ fontSize: "0.8125rem", color: "#16a34a" }}>{fetcher.data.message}</span>}
              {fetcher.data?.error && <span style={{ fontSize: "0.8125rem", color: "#dc2626" }}>{fetcher.data.error}</span>}
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="force_sync" />
                <button
                  type="submit"
                  disabled={syncing}
                  style={{ padding: "0.35rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: syncing ? "default" : "pointer", opacity: syncing ? 0.6 : 1 }}
                >
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              </fetcher.Form>
            </div>
          </div>
        </div>
      </section>

      {/* Google Analytics 4 */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>Integrations</div>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <svg width="20" height="20" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.16C6.51 42.62 14.62 48 24 48z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.16C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.55 10.75l7.98-6.16z"/>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.55 13.25l7.98 6.16C12.43 13.72 17.74 9.5 24 9.5z"/>
            </svg>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.15rem" }}>
                <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500 }}>Google Analytics 4</div>
                <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 4, padding: "0.1rem 0.4rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coming soon</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.5 }}>
                Connect your GA4 property to see experiment variants as a filterable dimension in every GA4 report.
              </div>
            </div>
          </div>
          <button
            disabled
            style={{ padding: "0.35rem 0.875rem", background: "#f5f5f5", color: "#bbb", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "default" }}
          >
            Connect
          </button>
        </div>
      </section>

      {/* Support */}
      <section>
        <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>Support</div>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500, marginBottom: "0.15rem" }}>Get help</div>
            <div style={{ fontSize: "0.75rem", color: "#aaa" }}>Documentation, setup guides, and direct support.</div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <a href="https://docs.splittester.com" target="_blank" rel="noreferrer" style={{ padding: "0.35rem 0.875rem", background: "#fff", color: "#555", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", textDecoration: "none" }}>
              Docs ↗
            </a>
            <a href="mailto:support@splittester.com" style={{ padding: "0.35rem 0.875rem", background: "#fff", color: "#555", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", textDecoration: "none" }}>
              Contact support
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
