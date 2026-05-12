import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigate, useSubmit, useFetcher } from "react-router";
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
  { label: "Price test — compare product prices", value: "PRICE" },
  { label: "URL redirect — route traffic to different pages", value: "URL_REDIRECT" },
  { label: "Template test — swap a page template (product, collection, etc.)", value: "TEMPLATE" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop, restFetch, shopId, billingPlanName, currency } = await requireDashboardSession(request);
  const [themes, templateFiles, segments, planLimits] = await Promise.all([
    getThemes(admin, restFetch, shop).catch(() => [] as Array<{ id: string; name: string; role: string; iconUrl: string | null }>),
    getThemeTemplateFiles(restFetch).catch(() => [] as Array<{ filename: string; type: string; view: string }>),
    prisma.segment.findMany({ where: { shopId }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } }),
    getPlanLimits(shopId, billingPlanName),
  ]);
  const themesWithDate = themes.map((t) => ({
    ...t,
    updatedLabel: new Date(t.updatedAt).toISOString().slice(0, 10),
  }));
  return { themes: themesWithDate, templateFiles, segments, planLimits, currency };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shopId, billingPlanName } = await requireDashboardSession(request);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const hypothesis = String(formData.get("hypothesis") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ExperimentType;
  const trafficAllocation = Number(formData.get("trafficAllocation") ?? 100);
  const segmentId = String(formData.get("segmentId") ?? "").trim() || null;
  const controlName = String(formData.get("controlName") ?? "Control").trim();
  const variantName = String(formData.get("variantName") ?? "Variant B").trim();
  const targetProductId = type === "PRICE" ? String(formData.get("targetProductId") ?? "").trim() || null : null;

  if (!name) return { error: "Experiment name is required." };
  if (!type) return { error: "Experiment type is required." };

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
  } else if (type === "PRICE") {
    variantBData.priceAdjType = String(formData.get("variantPriceAdjType") ?? "percent");
    const adjValue = parseFloat(String(formData.get("variantPriceAdjValue") ?? ""));
    if (!isNaN(adjValue)) variantBData.priceAdjValue = adjValue;
  } else if (["SECTION", "PAGE"].includes(type)) {
    const liquid = String(formData.get("variantCustomLiquid") ?? "").trim();
    if (liquid) variantBData.customLiquid = liquid;
  } else if (type === "TEMPLATE") {
    const viewName = String(formData.get("variantViewName") ?? "").trim();
    if (viewName) variantBData.redirectUrl = viewName;
  }

  const templateType = type === "TEMPLATE" ? String(formData.get("templateType") ?? "").trim() || null : null;

  const experiment = await prisma.experiment.create({
    data: {
      shopId,
      name,
      hypothesis: hypothesis || null,
      type,
      trafficAllocation,
      segmentId,
      targetTemplate: templateType,
      targetProductId,
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
  const { themes, templateFiles, segments, planLimits, currency } = useLoaderData<typeof loader>();
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
  const [variantPriceAdjType, setVariantPriceAdjType] = useState("percent");
  const [variantPriceAdjValue, setVariantPriceAdjValue] = useState("");
  const [variantCustomLiquid, setVariantCustomLiquid] = useState("");
  const [variantViewName, setVariantViewName] = useState("");
  const [templateType, setTemplateType] = useState("product");
  const [targetProductId, setTargetProductId] = useState("");
  const [targetProductTitle, setTargetProductTitle] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductResults, setShowProductResults] = useState(false);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const productFetcher = useFetcher<{ products: Array<{ id: string; title: string; imageUrl: string | null; price: string }> }>();

  // Load products when dropdown opens or search query changes
  useEffect(() => {
    if (!showProductResults || type !== "PRICE") return;
    const timer = setTimeout(() => {
      productFetcher.load(`/api/products/search?q=${encodeURIComponent(productSearch)}`);
    }, productSearch.trim() ? 300 : 0);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch, showProductResults, type]);

  // Close product dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setShowProductResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
    if (type === "PRICE") { fd.set("variantPriceAdjType", variantPriceAdjType); fd.set("variantPriceAdjValue", variantPriceAdjValue); fd.set("targetProductId", targetProductId); }
    if (["SECTION", "PAGE"].includes(type)) fd.set("variantCustomLiquid", variantCustomLiquid);
    if (type === "TEMPLATE") { fd.set("variantViewName", variantViewName); fd.set("templateType", templateType); }
    if (segmentId) fd.set("segmentId", segmentId);
    submit(fd, { method: "post" });
  }, [name, hypothesis, type, trafficAllocation, controlName, variantName,
      variantThemeId, variantRedirectUrl, variantPriceAdjType, variantPriceAdjValue,
      variantCustomLiquid, variantViewName, templateType, segmentId, targetProductId, submit]);

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
          options={EXPERIMENT_TYPES.map((t) => {
            const locked = planLimits && !planLimits.allowedTypes.includes(t.value);
            return { value: t.value, label: t.label, disabled: !!locked, badge: locked ? "Starter" : undefined };
          })}
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

        {type === "PRICE" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Product picker */}
            <div ref={productSearchRef} style={{ position: "relative" }}>
              <label style={label}>Target product</label>
              {/* Trigger button */}
              <button
                type="button"
                onClick={() => { setShowProductResults((v) => !v); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "0.625rem",
                  padding: "0.5rem 0.75rem", border: "1px solid #e9e9e9", borderRadius: 6,
                  background: "#fff", cursor: "pointer", textAlign: "left",
                  fontSize: "0.875rem", color: targetProductId ? "#111" : "#aaa",
                  boxSizing: "border-box",
                }}
              >
                {targetProductId ? (
                  <>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{targetProductTitle}</span>
                    <span
                      onMouseDown={(e) => { e.stopPropagation(); setTargetProductId(""); setTargetProductTitle(""); setProductSearch(""); setShowProductResults(false); }}
                      style={{ color: "#bbb", fontSize: "1rem", lineHeight: 1, padding: "0 2px" }}
                    >×</span>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1 }}>Select a product…</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, color: "#aaa" }}>
                      <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </>
                )}
              </button>

              {/* Dropdown */}
              {showProductResults && !targetProductId && (
                <div style={{
                  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 200,
                  background: "#fff", border: "1px solid #e9e9e9", borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.10)", overflow: "hidden",
                }}>
                  {/* Search input inside dropdown */}
                  <div style={{ padding: "0.5rem", borderBottom: "1px solid #f0f0f0" }}>
                    <div style={{ position: "relative" }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#bbb", pointerEvents: "none" }}>
                        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                        <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      <input
                        autoFocus
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="Search products…"
                        autoComplete="off"
                        style={{
                          width: "100%", padding: "0.4rem 0.625rem 0.4rem 2rem",
                          border: "1px solid #e9e9e9", borderRadius: 6,
                          fontSize: "0.8125rem", color: "#111", outline: "none",
                          boxSizing: "border-box", background: "#fafafa",
                        }}
                      />
                    </div>
                  </div>

                  {/* Product list */}
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {productFetcher.state === "loading" && (
                      <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8125rem", color: "#bbb" }}>Loading…</div>
                    )}
                    {productFetcher.state !== "loading" && productFetcher.data?.products?.length === 0 && (
                      <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.8125rem", color: "#bbb" }}>No products found.</div>
                    )}
                    {productFetcher.state !== "loading" && (productFetcher.data?.products ?? []).map((p) => (
                      <div
                        key={p.id}
                        onMouseDown={() => { setTargetProductId(p.id); setTargetProductTitle(p.title); setProductSearch(""); setShowProductResults(false); }}
                        style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 0.75rem", cursor: "pointer" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f7f7f7")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        {p.imageUrl
                          ? <img src={p.imageUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0, border: "1px solid #f0f0f0" }} />
                          : <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f0f0f0", flexShrink: 0 }} />
                        }
                        <div style={{ flex: 1, overflow: "hidden" }}>
                          <div style={{ fontSize: "0.875rem", color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{p.title}</div>
                          <div style={{ fontSize: "0.75rem", color: "#999", marginTop: 1 }}>{new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(p.price))}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p style={helpText}>The product whose price will be adjusted for the test variant.</p>
            </div>
            {/* Price adjustment */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label style={label}>Adjustment type</label>
                <Select
                  style={input}
                  value={variantPriceAdjType}
                  onChange={setVariantPriceAdjType}
                  options={[
                    { value: "percent", label: "Percentage discount (%)" },
                    { value: "fixed", label: "Fixed amount off ($)" },
                  ]}
                />
              </div>
              <div>
                <label style={label}>{variantPriceAdjType === "percent" ? "Discount (%)" : "Amount off ($)"}</label>
                <input style={input} type="number" value={variantPriceAdjValue} onChange={(e) => setVariantPriceAdjValue(e.target.value)} min={0} autoComplete="off" placeholder={variantPriceAdjType === "percent" ? "e.g. 10" : "e.g. 5.00"} />
              </div>
            </div>
            <p style={helpText}>The discount applies automatically at checkout via a Shopify Function — no visible coupon code shown to customers.</p>
          </div>
        )}

        {["SECTION", "PAGE"].includes(type) && (
          <div>
            <label style={label}>{variantName || "Variant B"} HTML content</label>
            <textarea
              style={{ ...input, minHeight: 180, resize: "vertical", fontFamily: "monospace", fontSize: "0.8125rem" }}
              value={variantCustomLiquid}
              onChange={(e) => setVariantCustomLiquid(e.target.value)}
              placeholder={"<p class=\"hero__subtitle\">Summer sale — up to 40% off</p>\n<a href=\"/collections/sale\" class=\"button\">Shop now</a>"}
            />
            <p style={helpText}>Injected via the Variant Content app block in the Theme Editor.</p>
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
