import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit } from "react-router";
import { useState, useCallback } from "react";
import { Select } from "../components/Select";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { getThemes, getThemeTemplateFiles } from "../lib/shopify/admin.server";
import type { ExperimentType } from "@prisma/client";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, restFetch } = await requireDashboardSession(request);
  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { variants: { orderBy: [{ isControl: "desc" }, { createdAt: "asc" }] } },
  });
  if (!experiment) throw new Response("Experiment not found", { status: 404 });

  const variant = experiment.variants.find((v) => v.id === params.variantId);
  if (!variant) throw new Response("Variant not found", { status: 404 });

  let themes: Array<{ id: string; name: string; role: string; iconUrl: string | null }> = [];
  let templateFiles: Array<{ filename: string; type: string; view: string }> = [];
  if (experiment.type === "THEME") {
    try { themes = await getThemes(admin, restFetch, session.shop); } catch {}
  } else if (experiment.type === "TEMPLATE") {
    try { templateFiles = await getThemeTemplateFiles(restFetch); } catch {}
  }

  return { experiment, variant, themes, templateFiles };
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
  } else if (["SECTION", "PAGE"].includes(experiment.type)) {
    updates.customLiquid = String(formData.get("customLiquid") ?? "").trim() || null;
  } else if (experiment.type === "TEMPLATE") {
    updates.redirectUrl = String(formData.get("redirectUrl") ?? "").trim() || null;
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
  const { experiment, variant, themes, templateFiles } = useLoaderData<typeof loader>();
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
    if (["SECTION", "PAGE"].includes(type)) fd.set("customLiquid", customLiquid);
    if (type === "TEMPLATE") fd.set("redirectUrl", redirectUrl);
    submit(fd, { method: "post" });
  }, [name, trafficWeight, themeId, redirectUrl, priceAdjType, priceAdjValue, customLiquid, type, submit]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const themeOptions = [
    { label: "— Select a theme —", value: "" },
    ...themes
      .filter((t) => t.role !== "MAIN")
      .map((t) => ({ label: `${t.name} · edited ${fmtDate(t.updatedAt)}`, value: t.id })),
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
            {(() => {
              const total = experiment.variants.reduce((s, v) =>
                s + (v.id === variant.id ? Number(trafficWeight) || 0 : v.trafficWeight), 0);
              const ok = total === 100;
              return (
                <p style={{ ...helpText, color: ok ? "#aaa" : "#dc2626", fontWeight: ok ? 400 : 500 }}>
                  Total across all variants: {total}%{!ok ? " — must equal 100" : ""}
                </p>
              );
            })()}
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
              <Select style={input} value={themeId} onChange={setThemeId} options={themeOptions} />
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
                <Select
                  style={input}
                  value={priceAdjType}
                  onChange={setPriceAdjType}
                  options={[
                    { value: "percent", label: "Percentage discount (%)" },
                    { value: "fixed", label: "Fixed price ($)" },
                  ]}
                />
              </div>
              <div>
                <label style={label}>{priceAdjType === "percent" ? "Discount (%)" : "Fixed price ($)"}</label>
                <input style={input} type="number" value={priceAdjValue} onChange={(e) => setPriceAdjValue(e.target.value)} min={0} autoComplete="off" placeholder={priceAdjType === "percent" ? "e.g. 10" : "e.g. 29.99"} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECTION / PAGE */}
      {["SECTION", "PAGE"].includes(type) && (
        <div style={card}>
          <div style={cardTitle}>HTML content</div>
          <p style={{ ...helpText, marginTop: 0, marginBottom: "1rem" }}>
            Enter the HTML to show visitors in this variant. In Theme Editor, add the <strong>Variant Content</strong> app block to the section where you want the content to appear, and set its Experiment ID to <code style={{ background: "#f3f3f3", padding: "0.1rem 0.3rem", borderRadius: 3 }}>{experiment.id}</code>.
          </p>
          <label style={label}>HTML content</label>
          <textarea
            style={{ ...input, minHeight: 220, resize: "vertical", fontFamily: "monospace", fontSize: "0.8125rem" }}
            value={customLiquid}
            onChange={(e) => setCustomLiquid(e.target.value)}
            placeholder={"<p class=\"hero__subtitle\">Summer sale — up to 40% off</p>\n<a href=\"/collections/sale\" class=\"button\">Shop now</a>"}
          />
          <div style={{ ...infoBanner, marginTop: "1rem" }}>
            The Variant Content block stays hidden until the correct variant's HTML is injected — no content flash.
          </div>
        </div>
      )}

      {/* TEMPLATE */}
      {type === "TEMPLATE" && (() => {
        const targetType = experiment.targetTemplate ?? "product";
        const filtered = templateFiles.filter((f) => f.type === targetType);
        return (
          <div style={card}>
            <div style={cardTitle}>Alternate template</div>
            {variant.isControl ? (
              <div style={infoBanner}>The control variant uses the default template. No configuration needed.</div>
            ) : filtered.length > 0 ? (
              <>
                <label style={label}>Select template</label>
                <Select
                  style={input}
                  value={redirectUrl}
                  onChange={setRedirectUrl}
                  placeholder="— Select alternate template —"
                  options={filtered.map((f) => ({ value: f.view, label: f.filename }))}
                />
                {redirectUrl && (
                  <p style={{ ...helpText, marginTop: "0.5rem" }}>
                    Variant visitors will load: <code style={{ background: "#f3f3f3", padding: "0.1rem 0.3rem", borderRadius: 3 }}>?view={redirectUrl}</code>
                  </p>
                )}
              </>
            ) : (
              <div style={warnBanner}>
                No alternate {targetType} templates found in your live theme. Duplicate <code style={{ background: "#fde68a55", padding: "0 0.2rem", borderRadius: 2 }}>templates/{targetType}.json</code> in your theme code, make your changes, then reload this page.
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
