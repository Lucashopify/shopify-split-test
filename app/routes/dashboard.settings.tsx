import { data, useFetcher, useLoaderData, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { syncConfigToMetafield, ensureMetafieldDefinition } from "../lib/experiments/config.server";

function isForbidden(err: unknown): boolean {
  const msg = String((err as Record<string, unknown>)?.message ?? err);
  return msg.includes("403") || msg.toLowerCase().includes("forbidden");
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
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
    appUrl: process.env.SHOPIFY_APP_URL ?? "",
  }, { headers: { "Set-Cookie": setCookie } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, setCookie, admin } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return data({ error: "Shop not found" }, { headers: { "Set-Cookie": setCookie } });

  const formData = await request.formData();
  const intent = String(formData.get("intent"));

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
    configExperimentsCount, needsReauth, appUrl,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<{ ok?: boolean; message?: string; error?: string; needsReauth?: boolean }>();
  const syncing = fetcher.state !== "idle";

  const showReauth = needsReauth || fetcher.data?.needsReauth;

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 2rem", letterSpacing: "-0.03em", color: "#111" }}>Settings</h1>

      {/* Re-auth banner */}
      {showReauth && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
          <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#92400e", marginBottom: "0.4rem" }}>
            Re-authorization required
          </div>
          <p style={{ fontSize: "0.8125rem", color: "#78350f", margin: "0 0 0.75rem", lineHeight: 1.5 }}>
            Shopify is returning 403 Forbidden on all metafield API calls. This means the installed access token has been invalidated or revoked — likely because the app's scopes were changed in the Partner Dashboard after the initial install. Re-authorizing issues a fresh token and fixes the issue.
          </p>
          <form method="post" action="/">
            <input type="hidden" name="shop" value={myshopifyDomain} />
            <button
              type="submit"
              style={{ padding: "0.45rem 1rem", background: "#d97706", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}
            >
              Re-authorize app →
            </button>
          </form>
        </div>
      )}

      {/* Store */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.5rem" }}>Store</h2>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "0 1.25rem" }}>
          <Row label="Shop domain" value={shopDomain} mono />
          <Row label="Myshopify domain" value={myshopifyDomain} mono />
          <Row label="Currency" value={currency} />
          <Row label="Timezone" value={timezone} />
          <Row label="Installed" value={installedAt ? new Date(installedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "—"} />
        </div>
      </section>

      {/* Integrations */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.5rem" }}>Integrations</h2>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "0 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0.875rem 0", borderBottom: "1px solid #f3f3f3" }}>
            <div style={{ width: 220, fontSize: "0.8125rem", color: "#777", flexShrink: 0 }}>Theme App Extension</div>
            <div style={{ fontSize: "0.8125rem", color: "#777" }}>Enable "Split Test" in Theme Editor → App embeds → Save</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "0.875rem 0" }}>
            <div style={{ width: 220, fontSize: "0.8125rem", color: "#777", flexShrink: 0 }}>App URL</div>
            <div style={{ fontSize: "0.8125rem", color: "#111", fontFamily: "monospace" }}>{appUrl}</div>
          </div>
        </div>
      </section>

      {/* Storefront config diagnostics */}
      <section>
        <h2 style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.5rem" }}>Storefront config</h2>
        <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "0 1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0.875rem 0", borderBottom: "1px solid #f3f3f3" }}>
            <div style={{ width: 220, fontSize: "0.8125rem", color: "#777", flexShrink: 0 }}>Metafield definition</div>
            <StatusDot
              ok={metafieldDefinitionExists}
              label={metafieldDefinitionExists ? "Exists" : "Missing — Liquid can't read config"}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "0.875rem 0", borderBottom: "1px solid #f3f3f3" }}>
            <div style={{ width: 220, fontSize: "0.8125rem", color: "#777", flexShrink: 0 }}>Config written</div>
            <StatusDot
              ok={metafieldHasValue}
              warn={!metafieldHasValue}
              label={metafieldHasValue ? `Yes — ${configExperimentsCount} running experiment(s)` : "Not written yet"}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "0.875rem 0" }}>
            <div style={{ width: 220, fontSize: "0.8125rem", color: "#777", flexShrink: 0 }}>Force sync</div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
              {fetcher.data?.message && (
                <span style={{ fontSize: "0.8125rem", color: "#16a34a" }}>{fetcher.data.message}</span>
              )}
              {fetcher.data?.error && (
                <span style={{ fontSize: "0.8125rem", color: "#dc2626" }}>{fetcher.data.error}</span>
              )}
            </div>
          </div>
        </div>
        <p style={{ fontSize: "0.75rem", color: "#bbb", margin: "0.6rem 0 0", lineHeight: 1.5 }}>
          The storefront embed reads this metafield at Liquid render time. Press "Sync now" after starting an experiment if visitor counts stay at 0.
        </p>
      </section>
    </div>
  );
}
