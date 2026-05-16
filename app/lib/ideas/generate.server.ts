/**
 * Calls Claude to generate prioritised experiment ideas from store analytics context.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { StoreContext } from "./analytics.server";

export interface ExperimentIdea {
  title: string;
  signal: string;       // the data point that motivated this idea
  hypothesis: string;
  type: "THEME" | "PRICE" | "URL_REDIRECT" | "SECTION" | "TEMPLATE";
  impact: "HIGH" | "MEDIUM" | "LOW";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  targetPage: string | null;
  suggestedName: string;
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function generateIdeas(ctx: StoreContext): Promise<ExperimentIdea[]> {
  const prompt = buildPrompt(ctx);

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";

  // Extract JSON array from response
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("Claude did not return a valid JSON array");

  const ideas = JSON.parse(match[0]) as ExperimentIdea[];
  return ideas.slice(0, 6);
}

function buildPrompt(ctx: StoreContext): string {
  const { shop, last30Days, deviceBreakdown, topPages, experimentHistory, currentlyTesting, testedTypes, untestedTypes } = ctx;

  const totalVisitors = deviceBreakdown.mobile + deviceBreakdown.tablet + deviceBreakdown.desktop;
  const mobilePct = totalVisitors > 0 ? Math.round((deviceBreakdown.mobile / totalVisitors) * 100) : 0;
  const desktopPct = totalVisitors > 0 ? Math.round((deviceBreakdown.desktop / totalVisitors) * 100) : 0;

  const productPages = topPages.filter((p) => p.url.includes("/products/"));
  const highTrafficLowAtc = productPages.filter((p) => p.sessions > 100 && p.atcRate < 5);

  const wonTests = experimentHistory.filter((e) => e.didWin === true);
  const lostTests = experimentHistory.filter((e) => e.didWin === false);

  return `You are a senior CRO strategist specialising in Shopify e-commerce. Analyse this store's data and generate 6 prioritised A/B experiment ideas.

## Store data

**Plan:** ${shop.isShopifyPlus ? "Shopify Plus" : "Standard Shopify"}
**Currency:** ${shop.currency}

**Last 30 days:**
- Orders: ${last30Days.orders}
- Revenue: ${shop.currency} ${last30Days.revenue.toLocaleString()}
- AOV: ${shop.currency} ${last30Days.aov}
- Estimated CVR: ${last30Days.cvr !== null ? last30Days.cvr + "%" : "unknown"}

**Device breakdown:**
- Mobile: ${mobilePct}%
- Desktop: ${desktopPct}%
- Tablet: ${100 - mobilePct - desktopPct}%

**Top pages (sessions / ATC rate):**
${topPages.map((p) => `- ${p.url}: ${p.sessions} sessions, ${p.atcRate}% ATC rate`).join("\n")}

**High-traffic product pages with low ATC rate (<5%):**
${highTrafficLowAtc.length > 0 ? highTrafficLowAtc.map((p) => `- ${p.url}: ${p.sessions} sessions, ${p.atcRate}% ATC`).join("\n") : "None identified"}

**Experiment history:**
${experimentHistory.length > 0
  ? experimentHistory.map((e) => `- "${e.name}" (${e.type}): ${e.status}, ran ${e.daysRan} days, ${e.didWin === true ? `WON +${e.liftPct}% lift` : e.didWin === false ? `LOST ${e.liftPct}% lift` : "inconclusive"}`).join("\n")
  : "No completed experiments yet."}

**Currently running:** ${currentlyTesting.length > 0 ? currentlyTesting.join(", ") : "Nothing"}
**Types already tested:** ${testedTypes.join(", ") || "None"}
**Types never tested:** ${untestedTypes.join(", ") || "All types covered"}

## Instructions

Generate exactly 6 experiment ideas. Each idea must:
1. Be grounded in a specific data signal from above (not generic CRO advice)
2. Be achievable with Arktic's experiment types: THEME, PRICE, URL_REDIRECT, SECTION, TEMPLATE
3. Avoid duplicating any currently running experiment
4. Prioritise HIGH impact ideas first
5. If the store has never tested a high-value type (e.g. PRICE or THEME), include at least one idea for it
6. For PRICE ideas: only suggest PRICE type if the store is on Shopify Plus, otherwise suggest URL_REDIRECT (duplicate product method)

Return ONLY a valid JSON array, no markdown, no explanation:

[
  {
    "title": "Short experiment title (5-8 words)",
    "signal": "The specific data point from the store data that motivates this test (be precise with numbers)",
    "hypothesis": "If we [change X] then [metric Y] will [improve/decrease] because [reason based on data]",
    "type": "THEME | PRICE | URL_REDIRECT | SECTION | TEMPLATE",
    "impact": "HIGH | MEDIUM | LOW",
    "difficulty": "EASY | MEDIUM | HARD",
    "targetPage": "/products/example or null if store-wide",
    "suggestedName": "Internal experiment name for the dashboard"
  }
]`;
}
