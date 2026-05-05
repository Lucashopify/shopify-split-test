import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit } from "react-router";
import { useState, useCallback } from "react";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { getThemes } from "../lib/shopify/admin.server";
import type { ExperimentType } from "@prisma/client";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { variants: { orderBy: [{ isControl: "desc" }, { createdAt: "asc" }] } },
  });
  if (!experiment) throw new Response("Experiment not found", { status: 404 });

  const variant = experiment.variants.find((v) => v.id === params.variantId);
  if (!variant) throw new Response("Variant not found", { status: 404 });

  let themes: Array<{ id: string; name: string; role: string }> = [];
  if (experiment.type === "THEME") {
    try { themes = await getThemes(admin); } catch {}
  }

  return { experiment, variant, themes };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await requireDashboardSession(request);
  const formData = await request.formData();

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return { error: "Shop not found" };

  const experiment = await prisma.experiment.findFirst({ where: { id: params.id, shopId: shop.id } });
  if (!experiment) return { error: "Not found" };

  const variant = await prisma.variant.findFirst({ where: { id: params.variantId, experimentId: experiment.id } });
  if (!variant) return { error: "Variant not found" };

  const name = String(formData.get("name") ?? variant.name).trim();
  const trafficWeight = Number(formData.get("trafficWeight") ?? variant.trafficWeight);
  const updates: Record<string, unknown> = { name, trafficWeight };

  if (experiment.type === "THEME") {
    updates.themeId = String(formData.get("themeId") ?? "").trim() || null;
  } else if (experiment.type === "URL_REDIRECT") {
    updates.redirectUrl = String(formData.get("redirectUrl") ?? "").trim() || null;
  } else if (experiment.type === "PRICE") {
    const adjType = String(formData.get("priceAdjType") ?? "percent");
    const adjValue = parseFloat(String(formData.get("priceAdjValue") ?? "0"));
    updates.priceAdjType = adjType;
    updates.priceAdjValue = isNaN(adjValue) ? null : adjValue;
  } else if (["SECTION", "PAGE", "TEMPLATE"].includes(experiment.type)) {
    updates.customLiquid = String(formData.get("customLiquid") ?? "").trim() || null;
  }

  await prisma.variant.update({ where: { id: variant.id }, data: updates });
  return redirect(`/dashboard/experiments/${experiment.id}`);
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid #e9e9e9",
  borderRadius: 6,
  fontSize: "0.875rem",
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
  background: "#fff",
};
const label: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  color: "#555",
  marginBottom: "0.375rem",
};
const card: React.CSSProperties = {
  border: "1px solid #e9e9e9",
  borderRadius: 8,
  padding: "1.5rem",
  marginBottom: "1.25rem",
};
const cardTitle: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "#111",
  marginBottom: "1rem",
};
const helpText: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "#aaa",
  marginTop: "0.375rem",
};
const infoBanner: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  borderRadius: 6,
  fontSize: "0.8125rem",
  color: "#1e40af",
};
const warnBanner: React.CSSProperties = {
  padding: "0.75rem 1rem",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 6,
  fontSize: "0.8125rem",
  color: "#92400e",
};

export default function VariantEditor() {
  const { experiment, variant, themes } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();
  const type = experiment.type as ExperimentType;
  const backUrl = `/dashboard/experiments/${experiment.id}`;

  const [name, setName] = useState(variant.name);
  const [trafficWeight, setTrafficWeight] = useState(String(variant.trafficWeight));
  const [themeId, setThemeId] = useState(variant.themeId ?? "");
  const [redirectUrl, setRedirectUrl] = useState(variant.redirectUrl ?? "");
  const [priceAdjType, setPriceAdjType] = useState(variant.priceAdjType ?? "percent");
  const [priceAdjValue, setPriceAdjValue] = useState(variant.priceAdjValue != null ? String(variant.priceAdjValue) : "");
  const [customLiquid, setCustomLiquid] = useState(variant.customLiquid ?? "");

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("trafficWeight", trafficWeight);
    if (type === "THEME") fd.set("themeId", themeId);
    if (type === "URL_REDIRECT") fd.set("redirectUrl", redirectUrl);
    if (type === "PRICE") { fd.set("priceAdjType", priceAdjType); fd.set("priceAdjValue", priceAdjValue); }
    if (["SECTION", "PAGE", "TEMPLATE"].includes(type)) fd.set("customLiquid", customLiquid);
    submit(fd, { method: "post" });
  }, [name, trafficWeight, themeId, redirectUrl, priceAdjType, priceAdjValue, customLiquid, type, submit]);

  const themeOptions = [
    { label: "— Select a theme —", value: "" },
    ...themes.map((t) => ({ label: `${t.name}${t.role === "MAIN" ? " (Live)" : ""}`, value: t.id })),
  ];

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => navigate(backUrl)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "0.8125rem", padding: 0, marginBottom: "0.75rem" }}
        >
          ← {experiment.name}
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>
              {variant.name}
            </h1>
            {variant.isControl && (
              <span style={{ fontSize: "0.65rem", color: "#999", background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.4rem" }}>control</span>
            )}
          </div>
          <button
            onClick={handleSave}
            style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
          >
            Save
          </button>
        </div>
      </div>

      {/* Basic */}
      <div style={card}>
        <div style={cardTitle}>Variant details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <label style={label}>Variant name</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label style={label}>Traffic weight (%)</label>
            <input style={input} type="number" value={trafficWeight} onChange={(e) => setTrafficWeight(e.target.value)} min={1} max={99} autoComplete="off" />
            <p style={helpText}>Weights across all variants should sum to 100.</p>
          </div>
        </div>
      </div>

      {/* THEME */}
      {type === "THEME" && (
        <div style={card}>
          <div style={cardTitle}>Theme</div>
          {variant.isControl ? (
            <div style={infoBanner}>The control variant uses your current live theme. No configuration needed.</div>
          ) : (
            <>
              <p style={{ ...helpText, marginTop: 0, marginBottom: "1rem" }}>
                Select the unpublished theme visitors in this variant will see. Duplicate your live theme first in the Shopify Theme Editor, then make your changes before selecting it here.
              </p>
              <label style={label}>Variant theme</label>
              <select style={input} value={themeId} onChange={(e) => setThemeId(e.target.value)}>
                {themeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {themeId && (
                <p style={{ ...helpText, marginTop: "0.5rem" }}>
                  Selected: {themes.find((t) => t.id === themeId)?.name ?? themeId}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* URL REDIRECT */}
      {type === "URL_REDIRECT" && (
        <div style={card}>
          <div style={cardTitle}>Redirect destination</div>
          {variant.isControl ? (
            <div style={infoBanner}>The control variant keeps visitors on the original URL. No redirect needed.</div>
          ) : (
            <>
              <label style={label}>Destination URL</label>
              <input style={input} value={redirectUrl} onChange={(e) => setRedirectUrl(e.target.value)} placeholder="https://yourstore.com/new-landing-page" autoComplete="off" />
              <p style={helpText}>Visitors assigned to this variant will be redirected here. Use a relative path (e.g. /pages/sale) or an absolute URL.</p>
            </>
          )}
        </div>
      )}

      {/* PRICE */}
      {type === "PRICE" && (
        <div style={card}>
          <div style={cardTitle}>Price adjustment</div>
          {variant.isControl ? (
            <div style={infoBanner}>The control variant shows the original price. No adjustment needed.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={label}>Adjustment type</label>
                <select style={input} value={priceAdjType} onChange={(e) => setPriceAdjType(e.target.value)}>
                  <option value="percent">Percentage discount (%)</option>
                  <option value="fixed">Fixed price ($)</option>
                </select>
              </div>
              <div>
                <label style={label}>{priceAdjType === "percent" ? "Discount (%)" : "Fixed price ($)"}</label>
                <input style={input} type="number" value={priceAdjValue} onChange={(e) => setPriceAdjValue(e.target.value)} min={0} autoComplete="off" placeholder={priceAdjType === "percent" ? "e.g. 10" : "e.g. 29.99"} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION / PAGE / TEMPLATE */}
      {["SECTION", "PAGE", "TEMPLATE"].includes(type) && (
        <div style={card}>
          <div style={cardTitle}>Custom Liquid</div>
          <p style={{ ...helpText, marginTop: 0, marginBottom: "1rem" }}>
            This Liquid code is injected into the variant wrapper block placed in the Theme Editor. Use the <strong>Variant Content</strong> app block to position it on the page.
          </p>
          <label style={label}>Liquid code</label>
          <textarea
            style={{ ...input, minHeight: 220, resize: "vertical", fontFamily: "monospace", fontSize: "0.8125rem" }}
            value={customLiquid}
            onChange={(e) => setCustomLiquid(e.target.value)}
            placeholder={"{% if product.available %}\n  <p>In stock — ships today!</p>\n{% endif %}"}
          />
          <div style={{ ...warnBanner, marginTop: "1rem" }}>
            Liquid is rendered server-side. Test thoroughly in a preview before starting the experiment.
          </div>
        </div>
      )}
    </div>
  );
}
