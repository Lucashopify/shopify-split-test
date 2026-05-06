import { Form, data, redirect, useActionData, useLoaderData, useNavigate, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useState, useCallback } from "react";
import { Select } from "../components/Select";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";

// ── Types ────────────────────────────────────────────────────────────────────

type RuleField = "device" | "customerType" | "country" | "utmSource" | "utmMedium" | "utmCampaign" | "referrer";
type RuleOp = "eq" | "neq" | "contains";

type Rule = { id: string; field: RuleField; op: RuleOp; value: string };

// ── Field / operator config ──────────────────────────────────────────────────

const FIELDS: { value: RuleField; label: string; type: "select" | "text"; options?: string[] }[] = [
  { value: "device",       label: "Device",        type: "select", options: ["mobile", "tablet", "desktop"] },
  { value: "customerType", label: "Customer type", type: "select", options: ["new", "returning"] },
  { value: "country",      label: "Country",       type: "text" },
  { value: "utmSource",    label: "UTM source",    type: "text" },
  { value: "utmMedium",    label: "UTM medium",    type: "text" },
  { value: "utmCampaign",  label: "UTM campaign",  type: "text" },
  { value: "referrer",     label: "Referrer URL",  type: "text" },
];

const OPS_FOR: Record<string, { value: RuleOp; label: string }[]> = {
  select: [
    { value: "eq",  label: "is" },
    { value: "neq", label: "is not" },
  ],
  text: [
    { value: "eq",       label: "is" },
    { value: "neq",      label: "is not" },
    { value: "contains", label: "contains" },
  ],
};

// ── Server ───────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { setCookie } = await requireDashboardSession(request);
  return data({}, { headers: { "Set-Cookie": setCookie } });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop: shopDomain, setCookie } = await requireDashboardSession(request);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const combinator = String(formData.get("combinator") ?? "AND") as "AND" | "OR";
  const rulesRaw = String(formData.get("rules") ?? "[]");

  if (!name) {
    return data({ error: "Name is required." }, { headers: { "Set-Cookie": setCookie } });
  }

  let children: Array<{ field: string; op: string; value: string }>;
  try {
    children = JSON.parse(rulesRaw);
  } catch {
    return data({ error: "Invalid rules." }, { headers: { "Set-Cookie": setCookie } });
  }

  if (children.length === 0) {
    return data({ error: "Add at least one condition." }, { headers: { "Set-Cookie": setCookie } });
  }

  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return data({ error: "Shop not found." }, { headers: { "Set-Cookie": setCookie } });

  await prisma.segment.create({
    data: {
      shopId: shop.id,
      name,
      rules: { op: combinator, children },
    },
  });

  throw redirect("/dashboard/segments");
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function fieldMeta(field: RuleField) {
  return FIELDS.find((f) => f.value === field)!;
}

// ── Component ────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  border: "1px solid #e9e9e9",
  borderRadius: 6,
  fontSize: "0.8125rem",
  color: "#111",
  background: "#fff",
  outline: "none",
};

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: "pointer" };

export default function NewSegmentPage() {
  useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [combinator, setCombinator] = useState<"AND" | "OR">("AND");
  const [rules, setRules] = useState<Rule[]>([
    { id: uid(), field: "device", op: "eq", value: "mobile" },
  ]);

  const addRule = useCallback(() => {
    setRules((r) => [...r, { id: uid(), field: "device", op: "eq", value: "mobile" }]);
  }, []);

  const removeRule = useCallback((id: string) => {
    setRules((r) => r.filter((x) => x.id !== id));
  }, []);

  const updateRule = useCallback((id: string, patch: Partial<Rule>) => {
    setRules((r) =>
      r.map((x) => {
        if (x.id !== id) return x;
        const updated = { ...x, ...patch };
        // Reset op and value when field changes
        if (patch.field) {
          const meta = fieldMeta(patch.field);
          updated.op = meta.type === "select" ? "eq" : "eq";
          updated.value = meta.options?.[0] ?? "";
        }
        return updated;
      })
    );
  }, []);

  // Serialize rules (strip client-only id field) into JSON for hidden input
  const rulesJson = JSON.stringify(rules.map(({ field, op, value }) => ({ field, op, value })));

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 640, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
        <button
          onClick={() => navigate("/dashboard/segments")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "0.8125rem", padding: 0 }}
        >
          ← Segments
        </button>
      </div>

      <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.25rem", letterSpacing: "-0.03em", color: "#111" }}>New segment</h1>
      <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0 0 2rem" }}>Define conditions to target a specific group of visitors.</p>

      {actionData?.error && (
        <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "1.25rem", fontSize: "0.8125rem", color: "#dc2626" }}>
          {actionData.error}
        </div>
      )}

      <Form method="post">
        {/* Hidden serialized rules */}
        <input type="hidden" name="rules" value={rulesJson} />
        <input type="hidden" name="combinator" value={combinator} />

        {/* Name */}
        <div style={{ marginBottom: "1.5rem" }}>
          <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500, color: "#555", marginBottom: "0.4rem" }}>
            Segment name
          </label>
          <input
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Mobile visitors"
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
            autoFocus
          />
        </div>

        {/* Rule builder */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#555" }}>Match</span>
            <Select
              value={combinator}
              onChange={(v) => setCombinator(v as "AND" | "OR")}
              style={{ ...selectStyle, width: 80 }}
              options={[{ value: "AND", label: "ALL" }, { value: "OR", label: "ANY" }]}
            />
            <span style={{ fontSize: "0.8125rem", color: "#999" }}>of the following conditions</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {rules.map((rule, i) => {
              const meta = fieldMeta(rule.field);
              const ops = OPS_FOR[meta.type];

              return (
                <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.75rem 1rem", border: "1px solid #e9e9e9", borderRadius: 8, background: "#fff" }}>
                  {/* Condition number */}
                  <span style={{ fontSize: "0.7rem", color: "#ccc", width: 16, flexShrink: 0, textAlign: "center" }}>{i + 1}</span>

                  {/* Field */}
                  <Select
                    value={rule.field}
                    onChange={(v) => updateRule(rule.id, { field: v as RuleField })}
                    style={{ ...selectStyle, flex: "0 0 160px" }}
                    options={FIELDS.map((f) => ({ value: f.value, label: f.label }))}
                  />

                  {/* Operator */}
                  <Select
                    value={rule.op}
                    onChange={(v) => updateRule(rule.id, { op: v as RuleOp })}
                    style={{ ...selectStyle, flex: "0 0 110px" }}
                    options={ops.map((o) => ({ value: o.value, label: o.label }))}
                  />

                  {/* Value */}
                  {meta.type === "select" ? (
                    <Select
                      value={rule.value}
                      onChange={(v) => updateRule(rule.id, { value: v })}
                      style={{ ...selectStyle, flex: 1 }}
                      options={(meta.options ?? []).map((opt) => ({ value: opt, label: opt }))}
                    />
                  ) : (
                    <input
                      type="text"
                      value={rule.value}
                      onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                      placeholder={rule.field === "country" ? "e.g. US" : "Enter value"}
                      style={{ ...inputStyle, flex: 1 }}
                    />
                  )}

                  {/* Remove */}
                  <button
                    type="button"
                    onClick={() => removeRule(rule.id)}
                    disabled={rules.length === 1}
                    style={{ background: "none", border: "none", cursor: rules.length === 1 ? "default" : "pointer", color: rules.length === 1 ? "#e9e9e9" : "#ccc", fontSize: "1rem", padding: "0 0.25rem", lineHeight: 1, flexShrink: 0 }}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRule}
            style={{ marginTop: "0.6rem", fontSize: "0.8125rem", color: "#777", background: "none", border: "1px dashed #e9e9e9", borderRadius: 6, padding: "0.4rem 0.875rem", cursor: "pointer", width: "100%" }}
          >
            + Add condition
          </button>
        </div>

        {/* Preview */}
        {rules.length > 0 && (
          <div style={{ marginBottom: "1.5rem", padding: "0.875rem 1rem", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
            <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>Preview</div>
            <div style={{ fontSize: "0.8125rem", color: "#555", lineHeight: 1.6 }}>
              Match visitors where{" "}
              {rules.map((r, i) => (
                <span key={r.id}>
                  {i > 0 && <strong style={{ color: "#111" }}> {combinator} </strong>}
                  <strong style={{ color: "#111" }}>{fieldMeta(r.field).label}</strong>
                  {" "}{r.op === "eq" ? "is" : r.op === "neq" ? "is not" : "contains"}{" "}
                  <strong style={{ color: "#111" }}>{r.value || "…"}</strong>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="submit"
            style={{ padding: "0.5rem 1.25rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
          >
            Create segment
          </button>
          <button
            type="button"
            onClick={() => navigate("/dashboard/segments")}
            style={{ padding: "0.5rem 1rem", background: "none", color: "#777", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer" }}
          >
            Cancel
          </button>
        </div>
      </Form>
    </div>
  );
}
