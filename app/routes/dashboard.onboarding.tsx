import { type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { getPlanLimits } from "../lib/billing.server";

// ---------------------------------------------------------------------------
// Auto-enable the app embed via GraphQL themeFilesUpsert
// ---------------------------------------------------------------------------
const EMBED_TYPE = "shopify://apps/split-test/blocks/split-test-embed";

type AdminClient = { graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response> };

async function enableEmbedInTheme(admin: AdminClient): Promise<{ ok: boolean; message: string }> {
  // 1. Get the main theme ID
  const themesResp = await admin.graphql(`
    query { themes(first: 1, roles: [MAIN]) { nodes { id } } }
  `);
  const { data: themesData } = await themesResp.json() as { data: { themes: { nodes: { id: string }[] } } };
  const themeId = themesData?.themes?.nodes?.[0]?.id;
  console.log("[embed] themeId:", themeId);
  if (!themeId) return { ok: false, message: "No active theme found" };

  // 2. Get settings_data.json
  const fileResp = await admin.graphql(`
    query GetThemeFile($themeId: ID!) {
      theme(id: $themeId) {
        files(filenames: ["config/settings_data.json"]) {
          nodes { filename body { ... on OnlineStoreThemeFileBodyText { content } } }
        }
      }
    }
  `, { variables: { themeId } });
  const { data: fileData } = await fileResp.json() as {
    data: { theme: { files: { nodes: { filename: string; body: { content: string } }[] } } }
  };
  const fileContent = fileData?.theme?.files?.nodes?.[0]?.body?.content;
  console.log("[embed] file content length:", fileContent?.length, "preview:", fileContent?.slice(0, 100));
  if (!fileContent) return { ok: false, message: "Could not read theme settings" };

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fileContent);
  } catch (e) {
    return { ok: false, message: `Could not parse theme settings: ${String(e)} | preview: ${fileContent.slice(0, 80)}` };
  }

  // 3. Check if already enabled
  const current = (settings.current ?? {}) as Record<string, unknown>;
  const blocks = (current.blocks ?? {}) as Record<string, { type: string; disabled?: boolean; settings?: Record<string, unknown> }>;
  const existingKey = Object.keys(blocks).find((k) => blocks[k].type === EMBED_TYPE);
  if (existingKey && blocks[existingKey].disabled !== true) {
    return { ok: true, message: "already_enabled" };
  }

  // 4. Add or re-enable the block
  if (existingKey) {
    blocks[existingKey].disabled = false;
  } else {
    const uid = crypto.randomUUID();
    blocks[`${EMBED_TYPE}/${uid}`] = { type: EMBED_TYPE, disabled: false, settings: {} };
  }
  current.blocks = blocks;
  settings.current = current;

  // 5. Save via themeFilesUpsert
  const upsertResp = await admin.graphql(`
    mutation UpsertThemeFile($themeId: ID!, $files: [OnlineStoreThemeFilesUpsertFileInput!]!) {
      themeFilesUpsert(themeId: $themeId, files: $files) {
        upsertedThemeFiles { filename }
        userErrors { field message }
      }
    }
  `, {
    variables: {
      themeId,
      files: [{ filename: "config/settings_data.json", body: { type: "TEXT", value: JSON.stringify(settings, null, 2) } }],
    },
  });
  const { data: upsertData } = await upsertResp.json() as {
    data: { themeFilesUpsert: { upsertedThemeFiles: { filename: string }[]; userErrors: { field: string; message: string }[] } }
  };
  console.log("[embed] upsert result:", JSON.stringify(upsertData?.themeFilesUpsert));
  const errors = upsertData?.themeFilesUpsert?.userErrors;
  if (errors?.length) return { ok: false, message: errors.map((e) => e.message).join(", ") };

  return { ok: true, message: "enabled" };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, setCookie } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const [experimentCount, runningCount, eventCount, planLimits] = await Promise.all([
    prisma.experiment.count({ where: { shopId: shop.id } }),
    prisma.experiment.count({ where: { shopId: shop.id, status: "RUNNING" } }),
    prisma.event.count({ where: { shopId: shop.id }, take: 1 }),
    getPlanLimits(shop.id),
  ]);

  return Response.json(
    {
      shop: session.shop,
      embedActive: eventCount > 0,
      hasExperiment: experimentCount > 0,
      hasRunning: runningCount > 0,
      isPaid: planLimits.planName !== "free_trial",
    },
    { headers: { "Set-Cookie": setCookie } },
  );
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, setCookie } = await requireDashboardSession(request);
  const result = await enableEmbedInTheme(admin);
  return Response.json(result, { headers: { "Set-Cookie": setCookie } });
};

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const checkStyle: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  fontSize: "0.7rem",
  fontWeight: 700,
};

export default function Onboarding() {
  const { shop, embedActive, hasExperiment, hasRunning, isPaid } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const embedFetcher = useFetcher<{ ok: boolean; message: string }>();

  const shopName = shop.replace(".myshopify.com", "");
  const themeEditorUrl = `https://admin.shopify.com/store/${shopName}/themes/current/editor`;
  const completedCount = [embedActive, hasExperiment, hasRunning, isPaid].filter(Boolean).length;
  const allDone = completedCount === 4;

  const embedEnabling = embedFetcher.state !== "idle";
  const embedResult = embedFetcher.data;
  const embedSucceeded = embedResult?.ok && embedResult.message !== "already_enabled" ? true : false;

  const steps = [
    {
      done: embedActive,
      number: "1",
      title: "Enable the Split Test embed",
      description:
        "Click Enable embed and we'll activate the tracking script on your storefront automatically. Without it, no tests will run.",
      note: embedActive
        ? "Embed is active — we've received your first storefront event."
        : "After enabling, visit any page on your store to confirm it's working.",
    },
    {
      done: hasExperiment,
      number: "2",
      title: "Create your first experiment",
      description:
        "Choose what to test — a theme, price, section content, URL redirect, or page template. Set a hypothesis, configure your variants, and define your traffic split.",
      note: hasExperiment ? "You have at least one experiment created." : null,
      cta: "Create experiment",
      action: () => navigate("/dashboard/experiments/new"),
    },
    {
      done: hasRunning,
      number: "3",
      title: "Start your experiment",
      description:
        "Once your variants are configured, hit Start. Visitors are bucketed deterministically and results roll in automatically. Run for at least 7 days to account for day-of-week variation.",
      note: hasRunning ? "You have a running experiment — results are collecting." : null,
      cta: "Go to experiments",
      action: () => navigate("/dashboard/experiments"),
    },
    {
      done: isPaid,
      number: "4",
      title: "Upgrade your plan",
      description:
        "The free plan supports 3 running experiments and 10,000 visitors/month. Upgrade to unlock all test types, unlimited experiments, audience segments, and higher traffic limits.",
      note: isPaid ? "You're on a paid plan — all features unlocked." : null,
      cta: "View plans",
      action: () => navigate("/dashboard/billing"),
    },
  ];

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 680, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.4rem", letterSpacing: "-0.03em", color: "#111" }}>
          Get started
        </h1>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#777" }}>
          Follow these steps to run your first A/B test.
        </p>

        <div style={{ marginTop: "1.25rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#f3f3f3", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              borderRadius: 2,
              background: "#111",
              width: `${(completedCount / 4) * 100}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
          <span style={{ fontSize: "0.75rem", color: "#999", flexShrink: 0 }}>
            {completedCount} / 4 complete
          </span>
        </div>
      </div>

      {/* All done banner */}
      {allDone && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem 1.25rem", background: "#f3f3f3", border: "1px solid #e9e9e9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111", marginBottom: "0.2rem" }}>
              You're all set
            </div>
            <div style={{ fontSize: "0.8125rem", color: "#555" }}>
              Your experiment is live. Check the Results tab to see data as it comes in.
            </div>
          </div>
          <button
            onClick={() => navigate("/dashboard/experiments")}
            style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
          >
            View experiments
          </button>
        </div>
      )}

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {steps.map((step, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #e9e9e9",
              borderRadius: 10,
              padding: "1.25rem 1.5rem",
              background: step.done ? "#fafafa" : "#fff",
              display: "flex",
              gap: "1.125rem",
              alignItems: "flex-start",
            }}
          >
            <div style={{
              ...checkStyle,
              background: step.done ? "#111" : "#f3f3f3",
              color: step.done ? "#fff" : "#aaa",
              marginTop: "0.1rem",
            }}>
              {step.done ? "✓" : step.number}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "0.4rem" }}>
                <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#111" }}>
                  {step.title}
                </div>
                {/* Step 1 — embed toggle */}
                {i === 0 && !step.done && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                    <embedFetcher.Form method="post">
                      <button
                        type="submit"
                        disabled={embedEnabling || embedSucceeded}
                        style={{ padding: "0.35rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: embedEnabling ? "default" : "pointer", opacity: embedEnabling ? 0.6 : 1 }}
                      >
                        {embedEnabling ? "Enabling…" : embedSucceeded ? "Enabled" : "Enable embed"}
                      </button>
                    </embedFetcher.Form>
                    <button
                      type="button"
                      onClick={() => window.open(themeEditorUrl, "_blank")}
                      style={{ padding: "0.35rem 0.875rem", background: "none", color: "#555", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer" }}
                    >
                      Theme Editor
                    </button>
                  </div>
                )}
                {/* Other steps */}
                {"cta" in step && !step.done && (
                  <button
                    onClick={(step as { action: () => void }).action}
                    style={{ padding: "0.35rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", flexShrink: 0 }}
                  >
                    {step.cta}
                  </button>
                )}
              </div>
              <p style={{ margin: "0 0 0.5rem", fontSize: "0.8125rem", color: "#666", lineHeight: 1.6 }}>
                {step.description}
              </p>
              {embedResult && !embedResult.ok && i === 0 && (
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#dc2626" }}>
                  {embedResult.message}
                </p>
              )}
              {embedSucceeded && i === 0 && (
                <p style={{ margin: "0 0 0.5rem", fontSize: "0.75rem", color: "#16a34a" }}>
                  Embed enabled — visit any storefront page to confirm, then refresh this page.
                </p>
              )}
              {step.note && (
                <p style={{ margin: 0, fontSize: "0.75rem", color: step.done ? "#555" : "#aaa" }}>
                  {step.done ? "✓ " : ""}{step.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Help callout */}
      <div style={{ marginTop: "2rem", padding: "1rem 1.25rem", background: "#f9fafb", border: "1px solid #e9e9e9", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111", marginBottom: "0.2rem" }}>Need help?</div>
          <div style={{ fontSize: "0.75rem", color: "#aaa" }}>Learn how each experiment type works and how to read your results.</div>
        </div>
        <a
          href="mailto:support@splittester.com"
          style={{ padding: "0.35rem 0.875rem", background: "none", color: "#555", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer", textDecoration: "none", flexShrink: 0 }}
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
