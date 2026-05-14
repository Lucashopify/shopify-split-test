import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigate, useSubmit } from "react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { Select } from "../components/Select";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { getThemes, getThemeTemplateFiles } from "../lib/shopify/admin.server";
import { getPlanLimits, checkExperimentLimit, checkTypeAllowed } from "../lib/billing.server";
import type { ExperimentType } from "@prisma/client";

const EXPERIMENT_TYPES = [
  { label: "Theme test — compare two full themes", value: "THEME" },
  { label: "Section / Content test — swap page sections", value: "SECTION" },
  { label: "URL redirect — route traffic to different pages", value: "URL_REDIRECT" },
  { label: "Template test — swap a page template (product, collection, etc.)", value: "TEMPLATE" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop, restFetch, shopId, billingPlanName, currency, isShopifyPlus } = await requireDashboardSession(request);
  const [themes, templateFiles, segments, planLimits] = await Promise.all([
    getThemes(admin, restFetch, shop).catch(() => [] as Array<{ id: string; name: string; role: string; createdAt: string; updatedAt: string; iconUrl: string | null }>),
    getThemeTemplateFiles(restFetch).catch(() => [] as Array<{ filename: string; type: string; view: string }>),
    prisma.segment.findMany({ where: { shopId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    getPlanLimits(shopId, billingPlanName),
  ]);
  const themesWithDate = themes.map((t) => ({
    ...t,
    updatedLabel: new Date(t.updatedAt).toISOString().slice(0, 10),
  }));
  return { themes: themesWithDate, templateFiles, segments, planLimits, currency, isShopifyPlus };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shopId, billingPlanName, isShopifyPlus } = await requireDashboardSession(request);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const hypothesis = String(formData.get("hypothesis") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ExperimentType;
  const trafficAllocation = Number(formData.get("trafficAllocation") ?? 100);
  const segmentId = String(formData.get("segmentId") ?? "").trim() || null;
  const controlName = String(formData.get("controlName") ?? "Control").trim();
  const variantName = String(formData.get("variantName") ?? "Variant B").trim();
  const targetSelector = ["SECTION", "PAGE"].includes(type) ? String(formData.get("targetSelector") ?? "").trim() || null : null;

  if (!name) return { error: "Experiment name is required." };
  if (!type) return { error: "Experiment type is required." };
  if (type === "PRICE" && !isShopifyPlus) return { error: "Price experiments require a Shopify Plus store." };

  // Plan gating
  const limits = await getPlanLimits(shopId, billingPlanName);
  const typeCheck = checkTypeAllowed(limits, type);
  if (!typeCheck.allowed) return { error: typeCheck.reason };
  if (segmentId && !limits.segmentsEnabled) return { error: "Audience segments require the Growth plan or higher." };
  const limitCheck = await checkExperimentLimit(shopId, billingPlanName);
  if (!limitCheck.allowed) return { error: limitCheck.reason };

  const variantBData: Record<string, unknown> = { name: variantName, isControl: false, trafficWeight: 50 };
  if (type === "THEME") {
    const themeId = String(formData.get("variantThemeId") ?? "").trim();
    if (themeId) variantBData.themeId = themeId;
  } else if (type === "URL_REDIRECT") {
    const redirectUrl = String(formData.get("variantRedirectUrl") ?? "").trim();
    if (redirectUrl) variantBData.redirectUrl = redirectUrl;
  } else if (["SECTION", "PAGE"].includes(type)) {
    const liquid = String(formData.get("variantCustomLiquid") ?? "").trim();
    if (liquid) variantBData.customLiquid = liquid;
  } else if (type === "TEMPLATE") {
    const viewName = String(formData.get("variantViewName") ?? "").trim();
    if (viewName) variantBData.redirectUrl = viewName;
  } else if (type === "PRICE") {
    const adjType = String(formData.get("variantPriceAdjType") ?? "percent").trim();
    const adjValue = Number(formData.get("variantPriceAdjValue") ?? 0);
    variantBData.priceAdjType = adjType;
    variantBData.priceAdjValue = adjValue;
  }

  const templateType = type === "TEMPLATE" ? String(formData.get("templateType") ?? "").trim() || null : null;
  const targetProductHandle = type === "PRICE" ? String(formData.get("targetProductHandle") ?? "").trim() || null : null;

  const experiment = await prisma.experiment.create({
    data: {
      shopId,
      name,
      hypothesis: hypothesis || null,
      type,
      trafficAllocation,
      segmentId,
      targetTemplate: templateType,
      targetSelector,
      targetProductHandle,
      variants: { create: [{ name: controlName, isControl: true, trafficWeight: 50 }, variantBData as any] },
    },
  });

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

export default function NewExperiment() {
  const { themes, templateFiles, segments, planLimits, currency, isShopifyPlus } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [type, setType] = useState("THEME");
  const [trafficAllocation, setTrafficAllocation] = useState(100);
  const [controlName, setControlName] = useState("Control");
  const [variantName, setVariantName] = useState("Variant B");
  const [segmentId, setSegmentId] = useState("");
  const [variantThemeId, setVariantThemeId] = useState("");
  const [variantRedirectUrl, setVariantRedirectUrl] = useState("");
  const [variantCustomLiquid, setVariantCustomLiquid] = useState("");
  const [targetSelector, setTargetSelector] = useState("");
  const [variantViewName, setVariantViewName] = useState("");
  const [templateType, setTemplateType] = useState("product");
  const [targetProductHandle, setTargetProductHandle] = useState("");
  const [targetProductTitle, setTargetProductTitle] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Array<{ id: string; title: string; handle: string; imageUrl: string | null; price: string }>>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const [variantPriceAdjType, setVariantPriceAdjType] = useState("percent");
  const [variantPriceAdjValue, setVariantPriceAdjValue] = useState("");

  useEffect(() => {
    if (!productSearchOpen) return;
    const q = productQuery.trim();
    const url = `/api/products/search?q=${encodeURIComponent(q)}`;
    fetch(url).then((r) => r.json()).then((d) => setProductResults(d.products ?? [])).catch(() => {});
  }, [productQuery, productSearchOpen]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setProductSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const variantThemeOptions = [
    { label: "— Select a theme —", value: "" },
    ...themes
      .filter((t) => t.role !== "MAIN")
      .map((t) => ({
        label: `${t.name} · edited ${t.updatedLabel}`,
        value: t.id,
      })),
  ];

  const handleSubmit = useCallback(() => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("hypothesis", hypothesis);
    fd.set("type", type);
    fd.set("trafficAllocation", String(trafficAllocation));
    fd.set("controlName", controlName);
    fd.set("variantName", variantName);
    if (type === "THEME") fd.set("variantThemeId", variantThemeId);
    if (type === "URL_REDIRECT") fd.set("variantRedirectUrl", variantRedirectUrl);
    if (["SECTION", "PAGE"].includes(type)) { fd.set("variantCustomLiquid", variantCustomLiquid); fd.set("targetSelector", targetSelector); }
    if (type === "TEMPLATE") { fd.set("variantViewName", variantViewName); fd.set("templateType", templateType); }
    if (type === "PRICE") { fd.set("targetProductHandle", targetProductHandle); fd.set("variantPriceAdjType", variantPriceAdjType); fd.set("variantPriceAdjValue", variantPriceAdjValue); }
    if (segmentId) fd.set("segmentId", segmentId);
    submit(fd, { method: "post" });
  }, [name, hypothesis, type, trafficAllocation, controlName, variantName,
      variantThemeId, variantRedirectUrl,
      variantCustomLiquid, variantViewName, templateType,
      targetProductHandle, variantPriceAdjType, variantPriceAdjValue,
      segmentId, submit]);

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 720, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => navigate("/dashboard/experiments")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "0.8125rem", padding: 0, marginBottom: "0.75rem" }}
        >
          ← Experiments
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>
            New experiment
          </h1>
          <button
            onClick={handleSubmit}
            disabled={!name}
            style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: name ? "pointer" : "not-allowed", opacity: name ? 1 : 0.4 }}
          >
            Create experiment
          </button>
        </div>
      </div>

      {actionData?.error && (
        <div style={{ marginBottom: "1.25rem", padding: "0.875rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: "0.8125rem", color: "#991b1b" }}>
          {actionData.error}
        </div>
      )}

      {/* Details */}
      <div style={card}>
        <div style={cardTitle}>Details</div>
        <div style={{ marginBottom: "1rem" }}>
          <label style={label}>Experiment name</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Homepage hero — summer sale" autoComplete="off" />
        </div>
        <div>
          <label style={label}>Hypothesis</label>
          <textarea
            style={{ ...input, minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
            placeholder="e.g. Showing a discount badge will increase add-to-cart rate"
          />
        </div>
      </div>

      {/* Test type */}
      <div style={card}>
        <div style={cardTitle}>Test type</div>
        <label style={label}>What are you testing?</label>
        <Select
          style={input}
          value={type}
          onChange={setType}
          options={[
            ...EXPERIMENT_TYPES.map((t) => {
              const locked = planLimits && !planLimits.allowedTypes.includes(t.value);
              return { value: t.value, label: t.label, disabled: !!locked, badge: locked ? "Starter" : undefined };
            }),
            { value: "PRICE", label: "Price test — test different prices for a product", disabled: !isShopifyPlus, badge: !isShopifyPlus ? "Shopify Plus only" : undefined },
          ]}
        />
        {planLimits && !planLimits.allowedTypes.includes(type) && (
          <p style={{ ...helpText, color: "#dc2626", marginTop: "0.5rem" }}>
            This test type requires a paid plan. <a href="/dashboard/billing" style={{ color: "#dc2626" }}>Upgrade →</a>
          </p>
        )}
      </div>

      {/* Variants */}
      <div style={card}>
        <div style={cardTitle}>Variants</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
          <div>
            <label style={label}>Control name</label>
            <input style={input} value={controlName} onChange={(e) => setControlName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <label style={label}>Variant name</label>
            <input style={input} value={variantName} onChange={(e) => setVariantName(e.target.value)} autoComplete="off" />
          </div>
        </div>

        {type === "THEME" && (
          <div>
            <p style={{ ...helpText, marginBottom: "0.75rem", marginTop: 0 }}>
              The control uses your live theme. Select the theme to test for {variantName || "Variant B"}.
            </p>
            <label style={label}>{variantName || "Variant B"} theme</label>
            <Select style={input} value={variantThemeId} onChange={setVariantThemeId} options={variantThemeOptions} />
          </div>
        )}

        {type === "URL_REDIRECT" && (
          <div>
            <label style={label}>{variantName || "Variant B"} destination URL</label>
            <input style={input} value={variantRedirectUrl} onChange={(e) => setVariantRedirectUrl(e.target.value)} placeholder="https://yourstore.com/new-landing-page" autoComplete="off" />
            <p style={helpText}>Visitors in this variant are redirected here. Use a relative path or absolute URL.</p>
          </div>
        )}

        {["SECTION", "PAGE"].includes(type) && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={label}>Target element (CSS selector)</label>
              <input
                style={input}
                value={targetSelector}
                onChange={(e) => setTargetSelector(e.target.value)}
                placeholder=".hero__inner, #product-description, section.featured-collection"
                autoComplete="off"
              />
              <p style={helpText}>The element whose content will be swapped for the variant. Right-click the element on your storefront → Inspect → copy the selector. No theme editing required.</p>
            </div>
            <div>
              <label style={label}>{variantName || "Variant B"} HTML content</label>
              <textarea
                style={{ ...input, minHeight: 180, resize: "vertical", fontFamily: "monospace", fontSize: "0.8125rem" }}
                value={variantCustomLiquid}
                onChange={(e) => setVariantCustomLiquid(e.target.value)}
                placeholder={"<p class=\"hero__subtitle\">Summer sale — up to 40% off</p>\n<a href=\"/collections/sale\" class=\"button\">Shop now</a>"}
              />
              <p style={helpText}>Replaces the inner HTML of the target element for visitors assigned to this variant.</p>
            </div>
          </div>
        )}

        {type === "PRICE" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div ref={productSearchRef} style={{ position: "relative" }}>
              <label style={label}>Product</label>
              {targetProductHandle ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.75rem", border: "1px solid #e9e9e9", borderRadius: 6, background: "#fff" }}>
                  <span style={{ fontSize: "0.875rem", color: "#111" }}>{targetProductTitle}</span>
                  <button
                    type="button"
                    onClick={() => { setTargetProductHandle(""); setTargetProductTitle(""); setProductQuery(""); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "0.875rem", padding: 0 }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <input
                  style={input}
                  value={productQuery}
                  onChange={(e) => { setProductQuery(e.target.value); setProductSearchOpen(true); }}
                  onFocus={() => setProductSearchOpen(true)}
                  placeholder="Search products..."
                  autoComplete="off"
                />
              )}
              {productSearchOpen && !targetProductHandle && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: "#fff", border: "1px solid #e9e9e9", borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 240, overflowY: "auto", marginTop: 2 }}>
                  {productResults.length === 0 ? (
                    <div style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem", color: "#aaa" }}>No products found</div>
                  ) : productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setTargetProductHandle(p.handle); setTargetProductTitle(p.title); setProductSearchOpen(false); }}
                      style={{ display: "flex", alignItems: "center", gap: "0.75rem", width: "100%", padding: "0.625rem 0.75rem", background: "none", border: "none", borderBottom: "1px solid #f3f3f3", cursor: "pointer", textAlign: "left" }}
                    >
                      {p.imageUrl && <img src={p.imageUrl} alt="" style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} />}
                      <div>
                        <div style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500 }}>{p.title}</div>
                        <div style={{ fontSize: "0.75rem", color: "#aaa" }}>{p.handle} · {p.price}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: "0.75rem 1rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, fontSize: "0.8125rem", color: "#166534" }}>
              The control variant uses the original price. Configure the price adjustment for {variantName || "Variant B"} below.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={label}>{variantName || "Variant B"} adjustment type</label>
                <Select
                  style={input}
                  value={variantPriceAdjType}
                  onChange={setVariantPriceAdjType}
                  options={[
                    { value: "percent", label: "Percent (e.g. -10%)" },
                    { value: "fixed", label: "Fixed amount (e.g. -5.00)" },
                  ]}
                />
              </div>
              <div>
                <label style={label}>{variantName || "Variant B"} adjustment value</label>
                <input
                  style={input}
                  type="number"
                  value={variantPriceAdjValue}
                  onChange={(e) => setVariantPriceAdjValue(e.target.value)}
                  placeholder={variantPriceAdjType === "percent" ? "-10" : "-5.00"}
                  step={variantPriceAdjType === "percent" ? "1" : "0.01"}
                  autoComplete="off"
                />
                <p style={helpText}>Use negative values to decrease price, positive to increase.</p>
              </div>
            </div>
          </div>
        )}

        {type === "TEMPLATE" && (() => {
          const filtered = templateFiles.filter((f) => f.type === templateType);
          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label style={label}>Template type</label>
                  <Select
                    style={input}
                    value={templateType}
                    onChange={(v) => { setTemplateType(v); setVariantViewName(""); }}
                    options={[
                      { value: "product", label: "Product" },
                      { value: "collection", label: "Collection" },
                      { value: "page", label: "Page" },
                      { value: "index", label: "Homepage" },
                      { value: "blog", label: "Blog" },
                      { value: "article", label: "Article" },
                    ]}
                  />
                </div>
                <div>
                  <label style={label}>{variantName || "Variant B"} template</label>
                  {filtered.length > 0 ? (
                    <Select
                      style={input}
                      value={variantViewName}
                      onChange={setVariantViewName}
                      placeholder="— Select alternate template —"
                      options={filtered.map((f) => ({ value: f.view, label: f.filename }))}
                    />
                  ) : (
                    <div style={{ padding: "0.5rem 0.75rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, fontSize: "0.8125rem", color: "#92400e" }}>
                      No alternate {templateType} templates found. Duplicate <code style={{ background: "#fde68a55", padding: "0 0.2rem", borderRadius: 2 }}>templates/{templateType}.json</code> in your theme first.
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Traffic */}
      <div style={card}>
        <div style={cardTitle}>Traffic allocation</div>
        <p style={{ ...helpText, marginTop: 0, marginBottom: "1rem" }}>
          Percentage of your visitors included in this experiment. The rest see the default experience.
        </p>
        <div style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
            <label style={{ ...label, marginBottom: 0 }}>Traffic included</label>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111" }}>{trafficAllocation}%</span>
          </div>
          <input
            type="range"
            min={5} max={100} step={5}
            value={trafficAllocation}
            onChange={(e) => setTrafficAllocation(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#111" }}
          />
        </div>
        <div>
          <label style={label}>Segment <span style={{ color: "#aaa", fontWeight: 400 }}>(optional)</span></label>
          {planLimits && !planLimits.segmentsEnabled ? (
            <div style={{ padding: "0.5rem 0.75rem", background: "#f9fafb", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", color: "#aaa" }}>
              Audience segments require the <a href="/dashboard/billing" style={{ color: "#2563eb" }}>Growth plan</a>.
            </div>
          ) : (
            <Select
              style={input}
              value={segmentId}
              onChange={setSegmentId}
              options={[{ value: "", label: "— All visitors —" }, ...segments.map((s) => ({ value: s.id, label: s.name }))]}
            />
          )}
          <p style={helpText}>Only show this experiment to visitors matching a segment.</p>
        </div>
      </div>
    </div>
  );
}
