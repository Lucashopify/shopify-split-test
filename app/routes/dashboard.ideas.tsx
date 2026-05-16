import { useState } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { buildStoreContext } from "../lib/ideas/analytics.server";
import { generateIdeas } from "../lib/ideas/generate.server";
import type { ExperimentIdea } from "../lib/ideas/generate.server";

const S = {
  page: { maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem 4rem" } as React.CSSProperties,
  header: { marginBottom: "2rem" } as React.CSSProperties,
  h1: { fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem", letterSpacing: "-0.02em" } as React.CSSProperties,
  subtitle: { fontSize: "0.8125rem", color: "#888", margin: 0 } as React.CSSProperties,
  empty: { textAlign: "center" as const, padding: "4rem 2rem", color: "#888" },
  generateBtn: {
    display: "inline-flex", alignItems: "center", gap: "0.5rem",
    padding: "0.625rem 1.25rem", background: "#111", color: "#fff",
    border: "none", borderRadius: 8, fontSize: "0.875rem", fontWeight: 600,
    cursor: "pointer", letterSpacing: "-0.01em",
  } as React.CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" } as React.CSSProperties,
  card: {
    background: "#fff", border: "1px solid #e9e9e9", borderRadius: 10,
    padding: "1.25rem", display: "flex", flexDirection: "column" as const, gap: "0.75rem",
  } as React.CSSProperties,
  cardHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem" } as React.CSSProperties,
  cardTitle: { fontSize: "0.9375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.015em", lineHeight: 1.3 } as React.CSSProperties,
  badges: { display: "flex", gap: "0.375rem", flexShrink: 0 } as React.CSSProperties,
  signal: { fontSize: "0.8125rem", color: "#555", background: "#f8f8f8", borderRadius: 6, padding: "0.5rem 0.75rem", lineHeight: 1.5 } as React.CSSProperties,
  signalLabel: { fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#888", marginBottom: "0.2rem" } as React.CSSProperties,
  hypothesis: { fontSize: "0.8125rem", color: "#444", lineHeight: 1.55 } as React.CSSProperties,
  cardFooter: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto", paddingTop: "0.5rem" } as React.CSSProperties,
  targetPage: { fontSize: "0.75rem", color: "#888", fontFamily: "monospace" } as React.CSSProperties,
  launchBtn: {
    padding: "0.4rem 0.875rem", background: "#111", color: "#fff",
    border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500,
    cursor: "pointer",
  } as React.CSSProperties,
  spinner: { width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" } as React.CSSProperties,
  stats: {
    display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.75rem", marginBottom: "1.5rem",
  } as React.CSSProperties,
  stat: { background: "#f8f8f8", borderRadius: 8, padding: "0.875rem 1rem" } as React.CSSProperties,
  statLabel: { fontSize: "0.6875rem", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#888", marginBottom: "0.25rem" } as React.CSSProperties,
  statValue: { fontSize: "1.125rem", fontWeight: 700, color: "#111", letterSpacing: "-0.02em" } as React.CSSProperties,
};

const IMPACT_COLORS = {
  HIGH: { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d" },
  MEDIUM: { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
  LOW: { bg: "#f8f8f8", border: "#e9e9e9", text: "#555" },
};

const TYPE_LABELS: Record<string, string> = {
  THEME: "Theme", PRICE: "Price", URL_REDIRECT: "Redirect", SECTION: "Content", TEMPLATE: "Template",
};

function Badge({ label, color }: { label: string; color: { bg: string; border: string; text: string } }) {
  return (
    <span style={{
      display: "inline-block", fontSize: "0.6875rem", fontWeight: 600,
      padding: "0.15rem 0.5rem", borderRadius: 99,
      background: color.bg, border: `1px solid ${color.border}`, color: color.text,
    }}>
      {label}
    </span>
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { dbShop } = await requireDashboardSession(request);
  const ctx = await buildStoreContext(dbShop.id);
  return { ctx };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { dbShop } = await requireDashboardSession(request);
  const ctx = await buildStoreContext(dbShop.id);
  try {
    const ideas = await generateIdeas(ctx);
    return { ideas, error: null };
  } catch (err) {
    console.error("[ideas] generation failed:", err);
    return { ideas: null, error: "Failed to generate ideas. Check that ANTHROPIC_API_KEY is set." };
  }
};

export default function IdeasPage() {
  const { ctx } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const ideas: ExperimentIdea[] = fetcher.data?.ideas ?? [];
  const error = fetcher.data?.error;
  const loading = fetcher.state !== "idle";
  const hasGenerated = fetcher.data !== undefined;

  const { mobile, desktop, tablet } = ctx.deviceBreakdown;
  const totalVisitors = mobile + desktop + tablet;
  const mobilePct = totalVisitors > 0 ? Math.round((mobile / totalVisitors) * 100) : 0;

  const visibleIdeas = ideas.filter((_, i) => !dismissed.has(i));

  function launchIdea(idea: ExperimentIdea) {
    const params = new URLSearchParams({
      name: idea.suggestedName,
      hypothesis: idea.hypothesis,
      type: idea.type,
    });
    if (idea.targetPage) params.set("targetUrl", idea.targetPage);
    navigate(`/dashboard/experiments/new?${params.toString()}`);
  }

  return (
    <div style={S.page}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={S.header}>
        <h1 style={S.h1}>Experiment ideas</h1>
        <p style={S.subtitle}>AI-generated test ideas based on your store's funnel data.</p>
      </div>

      {/* Store snapshot */}
      <div style={S.stats}>
        <div style={S.stat}>
          <div style={S.statLabel}>30-day orders</div>
          <div style={S.statValue}>{ctx.last30Days.orders.toLocaleString()}</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>30-day revenue</div>
          <div style={S.statValue}>{ctx.shop.currency} {ctx.last30Days.revenue.toLocaleString()}</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Est. CVR</div>
          <div style={S.statValue}>{ctx.last30Days.cvr !== null ? `${ctx.last30Days.cvr}%` : "—"}</div>
        </div>
        <div style={S.stat}>
          <div style={S.statLabel}>Mobile traffic</div>
          <div style={S.statValue}>{totalVisitors > 0 ? `${mobilePct}%` : "—"}</div>
        </div>
      </div>

      {/* Generate button */}
      <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "1rem" }}>
        <fetcher.Form method="post">
          <button type="submit" style={S.generateBtn} disabled={loading}>
            {loading
              ? <><span style={S.spinner} /> Analysing your store...</>
              : hasGenerated ? "Regenerate ideas" : "Generate ideas"}
          </button>
        </fetcher.Form>
        {hasGenerated && !loading && (
          <span style={{ fontSize: "0.8125rem", color: "#888" }}>
            {visibleIdeas.length} idea{visibleIdeas.length !== 1 ? "s" : ""} based on your last 30 days of data
          </span>
        )}
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "0.875rem 1rem", color: "#b91c1c", fontSize: "0.8125rem", marginBottom: "1.5rem" }}>
          {error}
        </div>
      )}

      {!hasGenerated && !loading && (
        <div style={S.empty}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>✦</div>
          <div style={{ fontWeight: 600, fontSize: "0.9375rem", color: "#333", marginBottom: "0.375rem" }}>
            Ready to generate ideas
          </div>
          <div style={{ fontSize: "0.8125rem" }}>
            Arktic will analyse your funnel data and suggest the highest-impact experiments to run next.
          </div>
        </div>
      )}

      {visibleIdeas.length > 0 && (
        <div style={S.grid}>
          {visibleIdeas.map((idea, i) => {
            const impactColor = IMPACT_COLORS[idea.impact];
            const diffColor = idea.difficulty === "EASY"
              ? IMPACT_COLORS.HIGH
              : idea.difficulty === "MEDIUM"
              ? IMPACT_COLORS.MEDIUM
              : IMPACT_COLORS.LOW;

            return (
              <div key={i} style={S.card}>
                <div style={S.cardHeader}>
                  <h3 style={S.cardTitle}>{idea.title}</h3>
                  <div style={S.badges}>
                    <Badge label={idea.impact} color={impactColor} />
                  </div>
                </div>

                <div style={S.signal}>
                  <div style={S.signalLabel}>Signal</div>
                  {idea.signal}
                </div>

                <p style={S.hypothesis}>{idea.hypothesis}</p>

                <div style={S.cardFooter}>
                  <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                    <Badge label={TYPE_LABELS[idea.type] ?? idea.type} color={{ bg: "#f0f0ff", border: "#c7c7f0", text: "#3333aa" }} />
                    <Badge label={`${idea.difficulty} setup`} color={diffColor} />
                    {idea.targetPage && <span style={S.targetPage}>{idea.targetPage}</span>}
                  </div>
                  <button style={S.launchBtn} onClick={() => launchIdea(idea)}>
                    Launch →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
