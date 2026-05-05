import { redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useActionData, useLoaderData, useNavigate, useSubmit } from "react-router";
import { useState, useCallback } from "react";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { getThemes } from "../lib/shopify/admin.server";
import type { ExperimentType } from "@prisma/client";

const EXPERIMENT_TYPES = [
  { label: "Theme test — compare two full themes", value: "THEME" },
  { label: "Section / Content test — swap page sections", value: "SECTION" },
  { label: "Price test — compare product prices", value: "PRICE" },
  { label: "URL redirect — route traffic to different pages", value: "URL_REDIRECT" },
  { label: "Page template test", value: "TEMPLATE" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, shop } = await requireDashboardSession(request);
  let themes: Array<{ id: string; name: string; role: string }> = [];
  try { themes = await getThemes(admin); } catch {}
  const dbShop = await prisma.shop.findUnique({ where: { shopDomain: shop } });
  const segments = dbShop
    ? await prisma.segment.findMany({ where: { shopId: dbShop.id }, select: { id: true, name: true }, orderBy: { createdAt: "desc" } })
    : [];
  return { themes, segments };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await requireDashboardSession(request);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const hypothesis = String(formData.get("hypothesis") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ExperimentType;
  const trafficAllocation = Number(formData.get("trafficAllocation") ?? 100);
  const segmentId = String(formData.get("segmentId") ?? "").trim() || null;
  const controlName = String(formData.get("controlName") ?? "Control").trim();
  const variantName = String(formData.get("variantName") ?? "Variant B").trim();

  if (!name) return { error: "Experiment name is required." };
  if (!type) return { error: "Experiment type is required." };

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return { error: "Shop not found. Try reinstalling the app." };

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
  } else if (["SECTION", "PAGE", "TEMPLATE"].includes(type)) {
    const liquid = String(formData.get("variantCustomLiquid") ?? "").trim();
    if (liquid) variantBData.customLiquid = liquid;
  }

  const experiment = await prisma.experiment.create({
    data: {
      shopId: shop.id,
      name,
      hypothesis: hypothesis || null,
      type,
      trafficAllocation,
      segmentId,
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
  const { themes, segments } = useLoaderData<typeof loader>();
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

  const themeOptions = [
    { label: "— Select a theme —", value: "" },
    ...themes.map((t) => ({ label: `${t.name}${t.role === "MAIN" ? " (Live)" : ""}`, value: t.id })),
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
    if (type === "PRICE") { fd.set("variantPriceAdjType", variantPriceAdjType); fd.set("variantPriceAdjValue", variantPriceAdjValue); }
    if (["SECTION", "PAGE", "TEMPLATE"].includes(type)) fd.set("variantCustomLiquid", variantCustomLiquid);
    if (segmentId) fd.set("segmentId", segmentId);
    submit(fd, { method: "post" });
  }, [name, hypothesis, type, trafficAllocation, controlName, variantName,
      variantThemeId, variantRedirectUrl, variantPriceAdjType, variantPriceAdjValue,
      variantCustomLiquid, segmentId, submit]);

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
        <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
          {EXPERIMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
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
            <select style={input} value={variantThemeId} onChange={(e) => setVariantThemeId(e.target.value)}>
              {themeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label style={label}>Adjustment type</label>
              <select style={input} value={variantPriceAdjType} onChange={(e) => setVariantPriceAdjType(e.target.value)}>
                <option value="percent">Percentage discount (%)</option>
                <option value="fixed">Fixed price ($)</option>
              </select>
            </div>
            <div>
              <label style={label}>{variantPriceAdjType === "percent" ? "Discount (%)" : "Fixed price ($)"}</label>
              <input style={input} type="number" value={variantPriceAdjValue} onChange={(e) => setVariantPriceAdjValue(e.target.value)} min={0} autoComplete="off" placeholder={variantPriceAdjType === "percent" ? "e.g. 10" : "e.g. 29.99"} />
            </div>
          </div>
        )}

        {["SECTION", "PAGE", "TEMPLATE"].includes(type) && (
          <div>
            <label style={label}>{variantName || "Variant B"} Liquid code</label>
            <textarea
              style={{ ...input, minHeight: 180, resize: "vertical", fontFamily: "monospace", fontSize: "0.8125rem" }}
              value={variantCustomLiquid}
              onChange={(e) => setVariantCustomLiquid(e.target.value)}
              placeholder={"{% if product.available %}\n  <p>In stock — ships today!</p>\n{% endif %}"}
            />
            <p style={helpText}>This Liquid is injected via the Variant Content app block in the Theme Editor.</p>
          </div>
        )}
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
          <select style={input} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">— All visitors —</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <p style={helpText}>Only show this experiment to visitors matching a segment.</p>
        </div>
      </div>
    </div>
  );
}
