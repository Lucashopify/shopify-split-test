import { data, type LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { setCookie } = await requireDashboardSession(request);
  return data({}, { headers: { "Set-Cookie": setCookie } });
};

const TEMPLATES = [
  { category: "Conversion", name: "CTA button color test", description: "Test black vs white primary button on product pages." },
  { category: "Conversion", name: "Above-the-fold trust badges", description: "Add review count and guarantee badges near the buy box." },
  { category: "AOV", name: "Free shipping threshold banner", description: "Show a dynamic banner prompting visitors to hit free shipping." },
  { category: "AOV", name: "Recommended products layout", description: "Test grid vs carousel for related products." },
  { category: "Engagement", name: "Product image order", description: "Lead with lifestyle vs product-on-white hero image." },
  { category: "Trust", name: "Social proof ticker", description: "Show recent purchases in a live ticker near the add-to-cart." },
];

export default function LiftAssistPage() {
  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 800, margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>Lift Assist</h1>
        <p style={{ fontSize: "0.8125rem", color: "#999", margin: "0.25rem 0 0" }}>Pre-built experiment templates, brand-styled and ready to launch.</p>
      </div>

      <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "2rem", background: "#fafafa" }}>
        <p style={{ fontSize: "0.8125rem", color: "#777", margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: "#111" }}>Coming in the next release.</strong> Lift Assist will scan your store's design tokens (colors, fonts, spacing) and generate pre-styled experiment variants you can launch in one click.
        </p>
      </div>

      <h2 style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 0.75rem" }}>Template library preview</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.75rem" }}>
        {TEMPLATES.map((t) => (
          <div key={t.name} style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1.1rem 1.25rem", opacity: 0.7 }}>
            <div style={{ fontSize: "0.65rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>{t.category}</div>
            <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111", marginBottom: "0.35rem" }}>{t.name}</div>
            <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.5 }}>{t.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
