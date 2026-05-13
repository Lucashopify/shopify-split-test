import { data, useFetcher, useLoaderData, useNavigate, type ActionFunctionArgs, type LoaderFunctionArgs } from "react-router";
import { useState } from "react";
import React from "react";
import { Select } from "../components/Select";
import { getPlanLimits } from "../lib/billing.server";
import type { Prisma } from "@prisma/client";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { syncConfigToMetafield } from "../lib/experiments/config.server";
import { syncCartTransformConfig } from "../lib/discounts.server";
import type { ExperimentStatus, ExperimentType } from "@prisma/client";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, setCookie, shopId, billingPlanName, admin } = await requireDashboardSession(request);

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId },
    include: {
      variants: {
        orderBy: [{ isControl: "desc" }, { createdAt: "asc" }],
      },
      segment: { select: { id: true, name: true } },
      _count: { select: { allocations: true, events: true, orders: true } },
    },
  });

  if (!experiment) throw new Response("Experiment not found", { status: 404 });

  const segments = await prisma.segment.findMany({
    where: { shopId },
    select: { id: true, name: true },
    orderBy: { createdAt: "desc" },
  });

  // Funnel stats for the overview bar + per-variant breakdown
  const [pageViews, atcCount, checkoutCount, revenueAgg, variantEvents, variantOrders] = await Promise.all([
    prisma.event.count({ where: { experimentId: experiment.id, type: "PAGE_VIEW" } }),
    prisma.event.count({ where: { experimentId: experiment.id, type: "ADD_TO_CART" } }),
    prisma.event.count({ where: { experimentId: experiment.id, type: "INITIATE_CHECKOUT" } }),
    prisma.order.aggregate({ where: { experimentId: experiment.id }, _sum: { revenue: true } }),
    prisma.event.groupBy({
      by: ["variantId", "type"],
      where: { experimentId: experiment.id, type: { in: ["PAGE_VIEW", "ADD_TO_CART", "INITIATE_CHECKOUT"] } },
      _count: { id: true },
    }),
    prisma.order.groupBy({
      by: ["variantId"],
      where: { experimentId: experiment.id },
      _count: { id: true },
      _sum: { revenue: true },
    }),
  ]);

  // Shape into per-variant stats
  const variantStats = experiment.variants.map((v) => {
    const sessions = variantEvents.find((e) => e.variantId === v.id && e.type === "PAGE_VIEW")?._count.id ?? 0;
    const atc = variantEvents.find((e) => e.variantId === v.id && e.type === "ADD_TO_CART")?._count.id ?? 0;
    const checkout = variantEvents.find((e) => e.variantId === v.id && e.type === "INITIATE_CHECKOUT")?._count.id ?? 0;
    const orderRow = variantOrders.find((o) => o.variantId === v.id);
    return { variantId: v.id, sessions, atc, checkout, orders: orderRow?._count.id ?? 0, revenue: orderRow?._sum.revenue ?? 0 };
  });
  const funnel = {
    visitors: experiment._count.allocations,
    sessions: pageViews,
    atc: atcCount,
    checkout: checkoutCount,
    orders: experiment._count.orders,
    revenue: revenueAgg._sum.revenue ?? 0,
  };

  // Aggregate ExperimentResult rows per variant (cumulative across all windows)
  const auditLogs = await prisma.auditLog.findMany({
    where: { experimentId: experiment.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const resultRows = await prisma.experimentResult.groupBy({
    by: ["variantId"],
    where: { experimentId: experiment.id },
    _sum: {
      sessions: true,
      uniqueVisitors: true,
      addToCartCount: true,
      initiateCheckoutCount: true,
      conversionCount: true,
      revenue: true,
    },
    _max: {
      windowEnd: true,
      pValue: true,
      srmPValue: true,
      liftPct: true,
    },
  });

  // Real-time order counts directly from Order table
  const liveOrders = await prisma.order.groupBy({
    by: ["variantId"],
    where: { experimentId: experiment.id },
    _count: { id: true },
    _sum: { revenue: true },
  });

  // Segment-level breakdown queries (device / traffic source / visitor type)
  const toN = (v: unknown) => Number(v ?? 0);
  function mergeDim(
    events: Array<{ variantId: string; dim: string; sessions: unknown; atc: unknown; checkout: unknown }>,
    orders: Array<{ variantId: string; dim: string; orders: unknown; revenue: unknown }>,
  ) {
    const map = new Map<string, { variantId: string; dim: string; sessions: number; atc: number; checkout: number; orders: number; revenue: number }>();
    for (const r of events) {
      const key = `${r.variantId}::${r.dim}`;
      map.set(key, { variantId: r.variantId, dim: r.dim, sessions: toN(r.sessions), atc: toN(r.atc), checkout: toN(r.checkout), orders: 0, revenue: 0 });
    }
    for (const r of orders) {
      const key = `${r.variantId}::${r.dim}`;
      const existing = map.get(key);
      if (existing) { existing.orders = toN(r.orders); existing.revenue = toN(r.revenue); }
      else map.set(key, { variantId: r.variantId, dim: r.dim, sessions: 0, atc: 0, checkout: 0, orders: toN(r.orders), revenue: toN(r.revenue) });
    }
    return [...map.values()];
  }

  const [deviceEvents, deviceOrders, sourceEvents, sourceOrders, vtEvents, vtOrders] = await Promise.all([
    prisma.$queryRaw<Array<{ variantId: string; dim: string; sessions: unknown; atc: unknown; checkout: unknown }>>`
      SELECT e."variantId", COALESCE(v.device, 'unknown') as dim,
        COUNT(CASE WHEN e.type = 'PAGE_VIEW' THEN 1 END) as sessions,
        COUNT(CASE WHEN e.type = 'ADD_TO_CART' THEN 1 END) as atc,
        COUNT(CASE WHEN e.type = 'INITIATE_CHECKOUT' THEN 1 END) as checkout
      FROM "Event" e JOIN "Visitor" v ON e."visitorId" = v.id
      WHERE e."experimentId" = ${experiment.id}
      GROUP BY e."variantId", v.device`,

    prisma.$queryRaw<Array<{ variantId: string; dim: string; orders: unknown; revenue: unknown }>>`
      SELECT o."variantId", COALESCE(v.device, 'unknown') as dim,
        COUNT(*) as orders, COALESCE(SUM(o.revenue), 0) as revenue
      FROM "Order" o JOIN "Visitor" v ON o."visitorId" = v.id
      WHERE o."experimentId" = ${experiment.id}
      GROUP BY o."variantId", v.device`,

    prisma.$queryRaw<Array<{ variantId: string; dim: string; sessions: unknown; atc: unknown; checkout: unknown }>>`
      SELECT sub."variantId", sub.source as dim,
        COUNT(CASE WHEN sub.type = 'PAGE_VIEW' THEN 1 END) as sessions,
        COUNT(CASE WHEN sub.type = 'ADD_TO_CART' THEN 1 END) as atc,
        COUNT(CASE WHEN sub.type = 'INITIATE_CHECKOUT' THEN 1 END) as checkout
      FROM (
        SELECT e."variantId", e.type,
          CASE
            WHEN lower(v."utmMedium") IN ('cpc','ppc','paid','paidsearch','paid_search') THEN 'paid'
            WHEN lower(v."utmMedium") IN ('email','newsletter') OR lower(v."utmSource") = 'email' THEN 'email'
            WHEN lower(v."utmMedium") IN ('social','social-media') OR lower(v."utmSource") IN ('instagram','facebook','twitter','tiktok','pinterest','youtube','linkedin') THEN 'social'
            WHEN (v."utmSource" IS NULL OR v."utmSource" = '') AND v.referrer SIMILAR TO '%(google\.|bing\.|yahoo\.|duckduckgo\.|baidu\.|yandex\.|ecosia\.|ask\.)%' THEN 'organic'
            WHEN (v."utmSource" IS NULL OR v."utmSource" = '') AND v.referrer IS NOT NULL AND v.referrer <> '' THEN 'referral'
            ELSE 'direct'
          END as source
        FROM "Event" e JOIN "Visitor" v ON e."visitorId" = v.id
        WHERE e."experimentId" = ${experiment.id}
      ) sub
      GROUP BY sub."variantId", sub.source`,

    prisma.$queryRaw<Array<{ variantId: string; dim: string; orders: unknown; revenue: unknown }>>`
      SELECT sub."variantId", sub.source as dim,
        COUNT(*) as orders, COALESCE(SUM(sub.revenue), 0) as revenue
      FROM (
        SELECT o."variantId", o.revenue,
          CASE
            WHEN lower(v."utmMedium") IN ('cpc','ppc','paid','paidsearch','paid_search') THEN 'paid'
            WHEN lower(v."utmMedium") IN ('email','newsletter') OR lower(v."utmSource") = 'email' THEN 'email'
            WHEN lower(v."utmMedium") IN ('social','social-media') OR lower(v."utmSource") IN ('instagram','facebook','twitter','tiktok','pinterest','youtube','linkedin') THEN 'social'
            WHEN (v."utmSource" IS NULL OR v."utmSource" = '') AND v.referrer SIMILAR TO '%(google\.|bing\.|yahoo\.|duckduckgo\.|baidu\.|yandex\.|ecosia\.|ask\.)%' THEN 'organic'
            WHEN (v."utmSource" IS NULL OR v."utmSource" = '') AND v.referrer IS NOT NULL AND v.referrer <> '' THEN 'referral'
            ELSE 'direct'
          END as source
        FROM "Order" o JOIN "Visitor" v ON o."visitorId" = v.id
        WHERE o."experimentId" = ${experiment.id}
      ) sub
      GROUP BY sub."variantId", sub.source`,

    prisma.$queryRaw<Array<{ variantId: string; dim: string; sessions: unknown; atc: unknown; checkout: unknown }>>`
      SELECT e."variantId", COALESCE(v."customerType", 'unknown') as dim,
        COUNT(CASE WHEN e.type = 'PAGE_VIEW' THEN 1 END) as sessions,
        COUNT(CASE WHEN e.type = 'ADD_TO_CART' THEN 1 END) as atc,
        COUNT(CASE WHEN e.type = 'INITIATE_CHECKOUT' THEN 1 END) as checkout
      FROM "Event" e JOIN "Visitor" v ON e."visitorId" = v.id
      WHERE e."experimentId" = ${experiment.id}
      GROUP BY e."variantId", v."customerType"`,

    prisma.$queryRaw<Array<{ variantId: string; dim: string; orders: unknown; revenue: unknown }>>`
      SELECT o."variantId", COALESCE(v."customerType", 'unknown') as dim,
        COUNT(*) as orders, COALESCE(SUM(o.revenue), 0) as revenue
      FROM "Order" o JOIN "Visitor" v ON o."visitorId" = v.id
      WHERE o."experimentId" = ${experiment.id}
      GROUP BY o."variantId", v."customerType"`,
  ]);

  const breakdown = {
    device: mergeDim(deviceEvents, deviceOrders),
    source: mergeDim(sourceEvents, sourceOrders),
    visitorType: mergeDim(vtEvents, vtOrders),
  };

  // Fetch product details for PRICE experiments
  let targetProduct: { title: string; imageUrl: string | null } | null = null;
  if (experiment.type === "PRICE" && experiment.targetProductId) {
    try {
      const resp = await admin.graphql(`
        query GetProduct($id: ID!) {
          product(id: $id) {
            title
            featuredImage { url }
          }
        }
      `, { variables: { id: experiment.targetProductId } });
      const { data: pData } = await resp.json() as { data?: { product?: { title: string; featuredImage?: { url: string } } } };
      if (pData?.product) {
        targetProduct = { title: pData.product.title, imageUrl: pData.product.featuredImage?.url ?? null };
      }
    } catch {}
  }

  const planLimits = await getPlanLimits(shopId, billingPlanName);
  return data({ experiment, segments, resultRows, liveOrders, funnel, variantStats, breakdown, auditLogs, segmentsEnabled: planLimits.segmentsEnabled, targetProduct }, { headers: { "Set-Cookie": setCookie } });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin, shopId } = await requireDashboardSession(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  const exp = await prisma.experiment.findFirst({
    where: { id: params.id, shopId },
    include: { variants: true },
  });
  if (!exp) return { error: "Not found" };

  const statusMap: Record<string, ExperimentStatus> = {
    start: "RUNNING",
    pause: "PAUSED",
    resume: "RUNNING",
    complete: "COMPLETED",
    archive: "ARCHIVED",
  };

  if (statusMap[intent]) {
    const newStatus = statusMap[intent];
    await prisma.experiment.update({
      where: { id: exp.id },
      data: {
        status: newStatus,
        ...(newStatus === "RUNNING" && !exp.startAt ? { startAt: new Date() } : {}),
      },
    });

    // Manage Shopify discount for PRICE experiments
    if (exp.type === "PRICE") {
      const { createPriceDiscount, deletePriceDiscount } = await import("../lib/discounts.server");
      if (newStatus === "RUNNING" && exp.targetProductId) {
        // Create automatic discount when experiment starts/resumes
        const discountId = await createPriceDiscount(
          admin,
          {
            experimentId: exp.id,
            targetProductId: exp.targetProductId,
            variants: exp.variants.map((v) => ({
              id: v.id,
              isControl: v.isControl,
              priceAdjType: v.priceAdjType,
              priceAdjValue: v.priceAdjValue,
            })),
          },
          exp.name,
        ).catch((err) => { console.error("[action] createPriceDiscount failed:", err); return null; });
        if (discountId) {
          await prisma.experiment.update({ where: { id: exp.id }, data: { shopifyDiscountId: discountId } });
        }
      } else if (exp.shopifyDiscountId) {
        // Delete discount when experiment stops, pauses, completes, or archives
        await deletePriceDiscount(admin, exp.shopifyDiscountId, exp.id).catch((err) =>
          console.error("[action] deletePriceDiscount failed:", err),
        );
      }
    }

    await prisma.auditLog.create({
      data: {
        shopId,
        experimentId: exp.id,
        actor: "merchant",
        action: `experiment.status.${newStatus.toLowerCase()}`,
        before: { status: exp.status } as Prisma.InputJsonValue,
        after: { status: newStatus } as Prisma.InputJsonValue,
      },
    });
    try {
      await syncConfigToMetafield(admin, shopId);
      await syncCartTransformConfig(admin, shopId);
    } catch (err) {
      console.error("[action] Failed to sync config metafield:", err);
    }
    return { ok: true };
  }

  if (intent === "update_segment") {
    const segmentId = formData.get("segmentId");
    await prisma.experiment.update({
      where: { id: exp.id },
      data: { segmentId: segmentId ? String(segmentId) : null },
    });
    try {
      await syncConfigToMetafield(admin, shopId);
      await syncCartTransformConfig(admin, shopId);
    } catch (err) {
      console.error("[action] Failed to sync config metafield:", err);
    }
    return { ok: true };
  }

  if (intent === "rename_variant") {
    const variantId = String(formData.get("variantId") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    if (variantId && name) {
      await prisma.variant.update({ where: { id: variantId }, data: { name } });
    }
    return { ok: true };
  }

  if (intent === "force_rollup") {
    const { runRollup } = await import("../lib/rollup.server");
    await runRollup(exp.id);
    return { ok: true, message: "Rollup complete" };
  }

  if (intent === "update_guardrails") {
    const minDays = parseInt(String(formData.get("minimumRuntimeDays") ?? "7"), 10);
    await prisma.experiment.update({
      where: { id: exp.id },
      data: {
        autoStopSrm: formData.get("autoStopSrm") === "true",
        autoStopRevDrop: formData.get("autoStopRevDrop") === "true",
        minimumRuntimeDays: isNaN(minDays) ? 7 : minDays,
      },
    });
    return { ok: true };
  }

  return { error: "Unknown intent" };
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "#16a34a", PAUSED: "#d97706", DRAFT: "#6b7280",
  COMPLETED: "#2563eb", ARCHIVED: "#9ca3af", SCHEDULED: "#7c3aed",
};

const TABS = ["Overview", "Variants", "Results", "History"];

export default function ExperimentDetail() {
  const { experiment, segments, resultRows, liveOrders, funnel, variantStats, breakdown, auditLogs, segmentsEnabled, targetProduct } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const segmentFetcher = useFetcher();
  const guardrailFetcher = useFetcher();
  const rollupFetcher = useFetcher();
  const [tab, setTab] = useState(0);
  const [selectedSegmentId, setSelectedSegmentId] = useState(experiment.segment?.id ?? "");
  const [runtimeDaysSetting, setRuntimeDaysSetting] = useState(String(experiment.minimumRuntimeDays ?? 7));
  const renameFetcher = useFetcher();
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const status = experiment.status as ExperimentStatus;
  const type = experiment.type as ExperimentType;
  const isSubmitting = fetcher.state !== "idle";

  // Runtime guardrail calculations
  const startAt = experiment.startAt ? new Date(experiment.startAt) : null;
  const runtimeMs = startAt ? Date.now() - startAt.getTime() : 0;
  const runtimeDays = runtimeMs / (1000 * 60 * 60 * 24);
  const minDays = experiment.minimumRuntimeDays ?? 7;
  const belowMinRuntime = status === "RUNNING" && startAt !== null && runtimeDays < minDays;
  const daysRemaining = Math.ceil(minDays - runtimeDays);

  // Optimistic status: use pending intent while fetcher is submitting
  const pendingIntent = fetcher.formData?.get("intent") as string | undefined;
  const intentStatusMap: Record<string, string> = {
    start: "RUNNING", pause: "PAUSED", resume: "RUNNING",
    complete: "COMPLETED", archive: "ARCHIVED",
  };
  const displayStatus = (pendingIntent && intentStatusMap[pendingIntent]) ? intentStatusMap[pendingIntent] : status;

  // Significance indicator for header
  const totalSessions = variantStats.reduce((s, v) => s + v.sessions, 0);
  const bestResult = resultRows.reduce<{ pValue: number | null; liftPct: number | null } | null>((best, r) => {
    if (r._max.liftPct == null) return best;
    if (best == null || (r._max.liftPct ?? 0) > (best.liftPct ?? 0)) {
      return { pValue: r._max.pValue ?? null, liftPct: r._max.liftPct ?? null };
    }
    return best;
  }, null);
  const isSignificant = bestResult?.pValue != null && bestResult.pValue < 0.05;
  const headerLift = bestResult?.liftPct;

  const stoppedEarlyNoSignificance = status === "COMPLETED" && !isSignificant && totalSessions > 0;

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 860, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <button
          onClick={() => navigate("/dashboard/experiments")}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "0.8125rem", padding: 0, marginBottom: "0.75rem" }}
        >
          ← Experiments
        </button>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
          <div>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: "0 0 0.5rem", letterSpacing: "-0.03em", color: "#111" }}>
              {experiment.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
              <style>{`@keyframes spt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }`}</style>
              {/* Status */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: STATUS_COLORS[displayStatus] ?? "#999" }}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: STATUS_COLORS[displayStatus] ?? "#999",
                  flexShrink: 0,
                  ...(displayStatus === "RUNNING" ? { animation: "spt-pulse 1.8s ease-in-out infinite" } : {}),
                }} />
                {displayStatus.charAt(0) + displayStatus.slice(1).toLowerCase()}
              </span>
              {/* Significance */}
              {status !== "DRAFT" && (
                isSignificant && headerLift != null ? (
                  <span style={{ fontSize: "0.75rem", fontWeight: 500, color: headerLift >= 0 ? "#16a34a" : "#dc2626", background: headerLift >= 0 ? "#f0fdf4" : "#fef2f2", border: `1px solid ${headerLift >= 0 ? "#bbf7d0" : "#fecaca"}`, borderRadius: 5, padding: "0.15rem 0.5rem" }}>
                    Significant · {headerLift >= 0 ? "+" : ""}{(headerLift * 100).toFixed(1)}%
                  </span>
                ) : totalSessions >= 100 ? (
                  <span style={{ fontSize: "0.75rem", color: "#999", background: "#f5f5f5", border: "1px solid #ebebeb", borderRadius: 5, padding: "0.15rem 0.5rem" }}>
                    Not significant
                  </span>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "#bbb", background: "#f9f9f9", border: "1px solid #efefef", borderRadius: 5, padding: "0.15rem 0.5rem" }}>
                    Collecting data
                  </span>
                )
              )}
              {/* Days remaining hint — inline, not below buttons */}
              {belowMinRuntime && (displayStatus === "RUNNING" || displayStatus === "PAUSED") && (
                <span style={{ fontSize: "0.75rem", color: "#bbb" }}>
                  · {daysRemaining}d left for reliable results
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
            {(displayStatus === "RUNNING" || displayStatus === "PAUSED") && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="complete" />
                <button type="submit" disabled={isSubmitting} style={{ padding: "0.4rem 0.875rem", background: "none", color: "#777", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer" }}>
                  Complete
                </button>
              </fetcher.Form>
            )}
            {displayStatus === "COMPLETED" && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="archive" />
                <button type="submit" disabled={isSubmitting} style={{ padding: "0.4rem 0.875rem", background: "none", color: "#777", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer" }}>
                  Archive
                </button>
              </fetcher.Form>
            )}
            {(displayStatus === "DRAFT" || displayStatus === "PAUSED") && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value={displayStatus === "DRAFT" ? "start" : "resume"} />
                <button type="submit" disabled={isSubmitting} style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", opacity: isSubmitting ? 0.6 : 1 }}>
                  {isSubmitting ? "Starting…" : displayStatus === "DRAFT" ? "Start experiment" : "Resume"}
                </button>
              </fetcher.Form>
            )}
            {displayStatus === "RUNNING" && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="pause" />
                <button type="submit" disabled={isSubmitting} style={{ padding: "0.4rem 0.875rem", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", opacity: isSubmitting ? 0.6 : 1 }}>
                  {isSubmitting ? "Pausing…" : "Pause"}
                </button>
              </fetcher.Form>
            )}
          </div>
        </div>
      </div>

      {/* Stopped early without significance warning */}
      {stoppedEarlyNoSignificance && (
        <div style={{ marginBottom: "1.25rem", padding: "1rem 1.25rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <span style={{ fontSize: "1rem", flexShrink: 0, marginTop: 1 }}>⚠️</span>
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#92400e", marginBottom: "0.2rem" }}>No clear winner detected</div>
            <div style={{ fontSize: "0.8125rem", color: "#78350f", lineHeight: 1.6 }}>
              This experiment was stopped before reaching statistical significance. Results may be inconclusive — consider running it longer or with more traffic before acting on the data.
            </div>
          </div>
        </div>
      )}

      {/* Per-variant metric cards */}
      {status !== "DRAFT" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${experiment.variants.length}, 1fr)`, gap: "0.75rem", marginBottom: "1rem" }}>
          {experiment.variants.map((v) => {
            const stats = variantStats.find((s) => s.variantId === v.id);
            const sessions = stats?.sessions ?? 0;
            const orders = stats?.orders ?? 0;
            const revenue = stats?.revenue ?? 0;
            const cvr = sessions > 0 ? (orders / sessions * 100).toFixed(1) + "%" : "—";
            const liftPct = resultRows.find((r) => r.variantId === v.id)?._max.liftPct;
            const isControl = v.isControl;
            return (
              <div key={v.id} style={{ border: "1px solid #e9e9e9", borderRadius: 8, padding: "1rem 1.25rem", background: "#fff" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
                  {editingVariantId === v.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => {
                        if (editingName.trim() && editingName.trim() !== v.name) {
                          renameFetcher.submit({ intent: "rename_variant", variantId: v.id, name: editingName.trim() }, { method: "post" });
                        }
                        setEditingVariantId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") { setEditingVariantId(null); }
                      }}
                      style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111", border: "none", borderBottom: "1px solid #aaa", outline: "none", background: "transparent", width: "100%", padding: 0 }}
                    />
                  ) : (
                    <span
                      title="Click to rename"
                      onClick={() => { setEditingVariantId(v.id); setEditingName(v.name); }}
                      style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111", cursor: "text" }}
                    >{v.name}</span>
                  )}
                  {isControl && <span style={{ fontSize: "0.6rem", color: "#999", background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.35rem", flexShrink: 0 }}>control</span>}
                  {!isControl && liftPct != null && (
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, color: liftPct > 0 ? "#16a34a" : liftPct < 0 ? "#dc2626" : "#999", marginLeft: "auto" }}>
                      {liftPct > 0 ? "+" : ""}{(liftPct * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                  {[
                    { label: "Sessions", value: sessions.toLocaleString() },
                    { label: "CVR", value: cvr },
                    { label: "Orders", value: orders.toLocaleString() },
                    { label: "Revenue", value: revenue > 0 ? `$${revenue.toFixed(2)}` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: "0.65rem", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.15rem" }}>{label}</div>
                      <div style={{ fontSize: "1rem", fontWeight: 600, color: "#111", letterSpacing: "-0.02em" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Funnel overview */}
      <FunnelBar funnel={funnel} />

      {/* Novelty effect warning */}
      {experiment.noveltyFlagged && (
        <div style={{ marginBottom: "1rem", padding: "0.875rem 1.25rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <span style={{ fontSize: "1rem", lineHeight: 1 }}>⚠</span>
          <div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#92400e", marginBottom: "0.2rem" }}>Novelty effect detected</div>
            <div style={{ fontSize: "0.75rem", color: "#78350f", lineHeight: 1.5 }}>
              A treatment variant had significantly higher CVR in the first 48 hours than in subsequent days (≥40% drop-off). This suggests returning customers are inflating early results. Wait for the novelty effect to stabilise before making a decision — typically 2–3 more business cycles.
            </div>
          </div>
        </div>
      )}


      {/* Tabs */}
      <div style={{ borderBottom: "1px solid #e9e9e9", marginBottom: "1.5rem", display: "flex", gap: "0" }}>
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            style={{ padding: "0.6rem 1rem", background: "none", border: "none", borderBottom: tab === i ? "2px solid #111" : "2px solid transparent", cursor: "pointer", fontSize: "0.8125rem", fontWeight: tab === i ? 500 : 400, color: tab === i ? "#111" : "#999", marginBottom: -1 }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <DetailRow label="Type" value={type.replace(/_/g, " ")} />
          {targetProduct && (
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #f5f5f5" }}>
              <span style={{ width: 180, fontSize: "0.8125rem", color: "#999", flexShrink: 0 }}>Product</span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                {targetProduct.imageUrl && (
                  <img src={targetProduct.imageUrl} alt={targetProduct.title} style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", border: "1px solid #f0f0f0", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: "0.8125rem", color: "#111", fontWeight: 500 }}>{targetProduct.title}</span>
              </div>
            </div>
          )}
          {experiment.hypothesis && <DetailRow label="Hypothesis" value={experiment.hypothesis} />}
          <DetailRow label="Traffic allocation" value={`${experiment.trafficAllocation}%`} />
          <DetailRow label="Target template" value={experiment.targetTemplate ?? "All pages"} />
          <DetailRow label="Created" value={new Date(experiment.createdAt).toLocaleString()} />
          {/* Segment selector */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #f5f5f5" }}>
            <span style={{ width: 180, fontSize: "0.8125rem", color: "#999", flexShrink: 0, paddingTop: "0.25rem" }}>Segment</span>
            {segmentsEnabled ? (
              <segmentFetcher.Form method="post" data-segment-form style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <input type="hidden" name="intent" value="update_segment" />
                <Select
                  name="segmentId"
                  value={selectedSegmentId}
                  onChange={(v) => {
                    setSelectedSegmentId(v);
                    const form = document.querySelector<HTMLFormElement>("[data-segment-form]");
                    if (form) { const fd = new FormData(form); fd.set("segmentId", v); segmentFetcher.submit(fd, { method: "post" }); }
                  }}
                  style={{ padding: "0.3rem 0.6rem", fontSize: "0.8125rem", minWidth: 200 }}
                  options={[{ value: "", label: "— No segment (all visitors) —" }, ...segments.map((s) => ({ value: s.id, label: s.name }))]}
                />
                {segments.length === 0 && (
                  <button
                    type="button"
                    onClick={() => navigate("/dashboard/segments/new")}
                    style={{ fontSize: "0.75rem", color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    + Create a segment
                  </button>
                )}
              </segmentFetcher.Form>
            ) : (
              <span style={{ fontSize: "0.8125rem", color: "#aaa" }}>
                Requires the <a href="/dashboard/billing" style={{ color: "#2563eb" }}>Growth plan</a>
              </span>
            )}
          </div>

          {/* Guardrails */}
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
              Auto-stop guardrails
            </div>
            <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
              <guardrailFetcher.Form method="post" data-guardrail-form>
                <input type="hidden" name="intent" value="update_guardrails" />
                <input type="hidden" name="minimumRuntimeDays" value={String(experiment.minimumRuntimeDays ?? 7)} />
                <GuardrailRow
                  name="autoStopSrm"
                  value={experiment.autoStopSrm}
                  label="Sample Ratio Mismatch (SRM)"
                  description="Pauses the experiment if visitor allocation drifts significantly from target weights (chi-squared p < 0.01, requires ≥100 visitors per variant). An SRM means something in the assignment pipeline is broken and results can't be trusted."
                  onChange={(v) => {
                    const form = document.querySelector<HTMLFormElement>("[data-guardrail-form]");
                    if (form) {
                      const fd = new FormData(form);
                      fd.set("autoStopSrm", String(v));
                      guardrailFetcher.submit(fd, { method: "post" });
                    }
                  }}
                />
                <GuardrailRow
                  name="autoStopRevDrop"
                  value={experiment.autoStopRevDrop}
                  label="Control CVR drop"
                  description="Pauses if the control variant's conversion rate drops more than 20% below its first-hour baseline. Catches regressions where a broken variant hurts your store's baseline. Requires ≥200 control sessions."
                  onChange={(v) => {
                    const form = document.querySelector<HTMLFormElement>("[data-guardrail-form]");
                    if (form) {
                      const fd = new FormData(form);
                      fd.set("autoStopRevDrop", String(v));
                      guardrailFetcher.submit(fd, { method: "post" });
                    }
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "1rem 1.25rem" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111", marginBottom: "0.25rem" }}>Minimum runtime</div>
                    <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.5 }}>
                      Show a warning when trying to stop the experiment before this many days. Prevents peeking bias and ensures at least one full day-of-week cycle.
                    </div>
                  </div>
                  <Select
                    value={runtimeDaysSetting}
                    onChange={(v) => {
                      setRuntimeDaysSetting(v);
                      const form = document.querySelector<HTMLFormElement>("[data-guardrail-form]");
                      if (form) {
                        const fd = new FormData(form);
                        fd.set("minimumRuntimeDays", v);
                        guardrailFetcher.submit(fd, { method: "post" });
                      }
                    }}
                    style={{ padding: "0.3rem 0.6rem", fontSize: "0.8125rem", flexShrink: 0, minWidth: 100 }}
                    options={[3, 5, 7, 14, 21].map((d) => ({ value: String(d), label: `${d} days` }))}
                  />
                </div>
              </guardrailFetcher.Form>
            </div>
            <p style={{ fontSize: "0.7rem", color: "#bbb", margin: "0.5rem 0 0", lineHeight: 1.5 }}>
              Guardrails run every hour. When triggered the experiment is paused and an audit log entry is created — you can review and resume manually.
            </p>
          </div>
        </div>
      )}

      {tab === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {(() => {
            const total = experiment.variants.reduce((s, v) => s + v.trafficWeight, 0);
            if (total !== 100) return (
              <div style={{ padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: "0.8125rem", color: "#991b1b" }}>
                ⚠ Variant weights sum to <strong>{total}%</strong> — must equal 100%. Visitors in the {total < 100 ? `${100 - total}% gap` : `${total - 100}% overflow`} won't be assigned correctly.
              </div>
            );
            return null;
          })()}
          {experiment.variants.map((v) => (
            <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", border: "1px solid #e9e9e9", borderRadius: 8 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "#111" }}>{v.name}</span>
                  {v.isControl && <span style={{ fontSize: "0.65rem", color: "#999", background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.4rem" }}>control</span>}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#aaa" }}>
                  {v.trafficWeight}% traffic{getVariantDetail(v, type)}
                </div>
              </div>
              <button
                onClick={() => navigate(`/dashboard/experiments/${experiment.id}/variants/${v.id}`)}
                style={{ fontSize: "0.8125rem", color: "#111", background: "none", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.35rem 0.75rem", cursor: "pointer" }}
              >
                Configure
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 3 && (
        <AuditLogTab logs={auditLogs} />
      )}

      {tab === 2 && (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginBottom: "1rem" }}>
            <a
              href={`/dashboard/experiments/${experiment.id}/export`}
              download
              style={{ fontSize: "0.8125rem", background: "#f4f4f4", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.35rem 0.875rem", cursor: "pointer", textDecoration: "none", color: "#111" }}
            >
              ↓ Export CSV
            </a>
            <rollupFetcher.Form method="post">
              <input type="hidden" name="intent" value="force_rollup" />
              <button
                type="submit"
                disabled={rollupFetcher.state !== "idle"}
                style={{ fontSize: "0.8125rem", background: "#f4f4f4", border: "1px solid #e9e9e9", borderRadius: 6, padding: "0.35rem 0.875rem", cursor: "pointer" }}
              >
                {rollupFetcher.state !== "idle" ? "Refreshing…" : "↻ Refresh results"}
              </button>
            </rollupFetcher.Form>
          </div>

          {displayStatus === "DRAFT" ? (
            <div style={{ padding: "2rem", border: "1px dashed #e9e9e9", borderRadius: 8, textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "#999", margin: 0 }}>Start the experiment to begin collecting results.</p>
            </div>
          ) : resultRows.length === 0 && liveOrders.length === 0 ? (
            <div style={{ padding: "2rem", border: "1px dashed #e9e9e9", borderRadius: 8, textAlign: "center" }}>
              <p style={{ fontSize: "0.875rem", color: "#999", margin: 0 }}>
                No results yet. Click ↻ Refresh results to compute stats, or wait for the hourly rollup.
              </p>
            </div>
          ) : (
            <ResultsTable
              variants={experiment.variants}
              resultRows={resultRows}
              liveOrders={liveOrders}
              startAt={experiment.startAt ? String(experiment.startAt) : null}
              breakdown={breakdown}
            />
          )}
        </div>
      )}
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  "experiment.created": "Experiment created",
  "experiment.status.running": "Experiment started",
  "experiment.status.paused": "Experiment paused",
  "experiment.status.completed": "Marked as complete",
  "experiment.status.archived": "Archived",
  "experiment.status.scheduled": "Scheduled",
  "experiment.auto_paused.srm": "Auto-paused — Sample Ratio Mismatch detected",
  "experiment.auto_paused.rev_drop": "Auto-paused — Control CVR drop detected",
};

type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string | Date;
};

function AuditLogTab({ logs }: { logs: AuditLogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div style={{ padding: "2rem", border: "1px dashed #e9e9e9", borderRadius: 8, textAlign: "center" }}>
        <p style={{ fontSize: "0.875rem", color: "#999", margin: 0 }}>No history yet. Actions like starting, pausing, and completing the experiment will appear here.</p>
      </div>
    );
  }

  const actorColor: Record<string, string> = { merchant: "#6366f1", system: "#f59e0b", worker: "#6b7280" };
  const actorLabel: Record<string, string> = { merchant: "You", system: "System", worker: "Worker" };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {logs.map((log, i) => {
        const before = (log.before ?? null) as Record<string, unknown> | null;
        const after = (log.after ?? null) as Record<string, unknown> | null;
        const isLast = i === logs.length - 1;
        return (
          <div key={log.id} style={{ display: "flex", gap: "1rem", paddingBottom: isLast ? 0 : "1.25rem" }}>
            {/* Timeline line + dot */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: actorColor[log.actor] ?? "#ccc", marginTop: 4, flexShrink: 0 }} />
              {!isLast && <div style={{ width: 1, flex: 1, background: "#f0f0f0", marginTop: 4 }} />}
            </div>
            {/* Content */}
            <div style={{ flex: 1, paddingBottom: isLast ? 0 : "0.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem" }}>
                <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111" }}>
                  {ACTION_LABELS[log.action] ?? log.action}
                </span>
                <span style={{ fontSize: "0.7rem", color: actorColor[log.actor] ?? "#aaa", background: "#f5f5f5", borderRadius: 3, padding: "0.1rem 0.4rem" }}>
                  {actorLabel[log.actor] ?? log.actor}
                </span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "#aaa" }}>
                {new Date(String(log.createdAt)).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              {before?.status != null && after?.status != null && String(before.status) !== String(after.status) && (
                <div style={{ marginTop: "0.35rem", fontSize: "0.75rem", color: "#777", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.4rem" }}>{String(before.status).toLowerCase()}</span>
                  <span style={{ color: "#bbb" }}>→</span>
                  <span style={{ background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.4rem" }}>{String(after.status).toLowerCase()}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConclusionBanner({
  pValue,
  srmFlagged,
  rows,
  startAt,
}: {
  pValue: number | null;
  srmFlagged: boolean;
  rows: Array<{ v: VariantStub; sessions: number; orders: number; revenue: number; cvr: number | null; liftPct: number | null }>;
  startAt: string | null;
}) {
  if (srmFlagged) return null; // SRM banner already shown above

  const totalSessions = rows.reduce((s, r) => s + r.sessions, 0);
  const significant = pValue != null && pValue < 0.05;
  const hasEnoughData = totalSessions >= 100;
  const control = rows.find((r) => r.v.isControl);
  const winner = significant
    ? rows.filter((r) => !r.v.isControl).sort((a, b) => (b.liftPct ?? 0) - (a.liftPct ?? 0))[0]
    : null;

  if (!hasEnoughData) {
    return (
      <div style={{ marginBottom: "1rem", padding: "0.875rem 1.25rem", background: "#f9fafb", border: "1px solid #e9e9e9", borderRadius: 8 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#111", marginBottom: "0.3rem" }}>Collecting data</div>
        <div style={{ fontSize: "0.75rem", color: "#888", lineHeight: 1.6 }}>
          Need at least 100 sessions per variant before results are meaningful. Keep the experiment running.
        </div>
      </div>
    );
  }

  if (significant && winner) {
    const lift = winner.liftPct != null ? `${winner.liftPct > 0 ? "+" : ""}${(winner.liftPct * 100).toFixed(1)}%` : "";

    // Revenue impact projection
    const durationDays = startAt ? (Date.now() - new Date(startAt).getTime()) / (1000 * 60 * 60 * 24) : 0;
    let projection: React.ReactNode = null;
    if (durationDays >= 1 && control && control.revenue > 0 && winner.liftPct != null) {
      const controlRevPerDay = control.revenue / durationDays;
      const annualUplift = controlRevPerDay * 365 * winner.liftPct;
      const monthlyUplift = controlRevPerDay * 30 * winner.liftPct;
      const fmtK = (n: number) =>
        Math.abs(n) >= 1000
          ? `$${(n / 1000).toFixed(1)}k`
          : `$${Math.round(n).toLocaleString()}`;
      projection = (
        <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #bbf7d0", display: "flex", alignItems: "flex-end", gap: "2rem" }}>
          <div>
            <div style={{ fontSize: "0.68rem", color: "#15803d", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
              Est. annual revenue impact
            </div>
            <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111", letterSpacing: "-0.03em", lineHeight: 1 }}>
              +{fmtK(annualUplift)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.68rem", color: "#15803d", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.2rem" }}>
              Per month
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "#555", letterSpacing: "-0.02em", lineHeight: 1 }}>
              +{fmtK(monthlyUplift)}
            </div>
          </div>
          <div style={{ fontSize: "0.7rem", color: "#6b7280", maxWidth: 200, lineHeight: 1.4, paddingBottom: "0.1rem" }}>
            Based on control revenue rate over {Math.round(durationDays)} days, extrapolated with {lift} lift.
          </div>
        </div>
      );
    }

    return (
      <div style={{ marginBottom: "1rem", padding: "0.875rem 1.25rem", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#166534", marginBottom: "0.3rem" }}>
          ✓ Significant result — ready to conclude (p = {pValue!.toFixed(4)})
        </div>
        <div style={{ fontSize: "0.75rem", color: "#15803d", lineHeight: 1.6 }}>
          <strong>{winner.v.name}</strong> is the winner with {lift} lift over {control?.v.name ?? "control"}.
          {" "}You can now ship this variant or end the test.
        </div>
        {projection}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1rem", padding: "0.875rem 1.25rem", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8 }}>
      <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "#92400e", marginBottom: "0.3rem" }}>
        Not yet significant (p = {pValue != null ? pValue.toFixed(4) : "—"})
      </div>
      <div style={{ fontSize: "0.75rem", color: "#78350f", lineHeight: 1.6 }}>
        Results are not conclusive yet. Keep running until p &lt; 0.05 (95% confidence) before making a decision.
        Stopping early risks acting on random variation.
      </div>
    </div>
  );
}

function FunnelBar({ funnel }: { funnel: { visitors: number; sessions: number; atc: number; checkout: number; orders: number; revenue: number } }) {
  const { visitors, sessions, atc, checkout, orders, revenue } = funnel;
  const rate = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  const steps = [
    { label: "Visitors", value: visitors, sub: null },
    { label: "Sessions", value: sessions, sub: rate(sessions, visitors) },
    { label: "Add to Cart", value: atc, sub: rate(atc, sessions) },
    { label: "Checkout", value: checkout, sub: rate(checkout, atc) },
    { label: "Orders", value: orders, sub: rate(orders, sessions) },
    { label: "Revenue", value: revenue > 0 ? `$${revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—", sub: orders > 0 ? `$${(revenue / orders).toFixed(2)} AOV` : null },
  ];

  return (
    <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden", marginBottom: "1.5rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
        {steps.map((s, i) => (
          <div
            key={s.label}
            style={{
              padding: "1rem 1.25rem",
              borderRight: i < steps.length - 1 ? "1px solid #e9e9e9" : "none",
              position: "relative",
            }}
          >
            <div style={{ fontSize: "0.68rem", color: "#bbb", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>{s.label}</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111" }}>
              {typeof s.value === "number" ? s.value.toLocaleString() : s.value}
            </div>
            {s.sub && (
              <div style={{ fontSize: "0.7rem", color: "#aaa", marginTop: "0.15rem" }}>{s.sub} conversion</div>
            )}
          </div>
        ))}
      </div>
      {/* Drop-off bar */}
      {sessions > 0 && (
        <div style={{ background: "#f9f9f9", borderTop: "1px solid #f3f3f3", padding: "0.5rem 1.25rem", display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "0.7rem", color: "#bbb" }}>Overall CVR</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#111" }}>{rate(orders, sessions)}</span>
          <span style={{ fontSize: "0.7rem", color: "#bbb", marginLeft: "1rem" }}>Revenue / visitor</span>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#111" }}>
            {sessions > 0 && revenue > 0 ? `$${(revenue / sessions).toFixed(2)}` : "—"}
          </span>
        </div>
      )}
    </div>
  );
}

function GuardrailRow({
  name, value, label, description, last = false, onChange,
}: {
  name: string;
  value: boolean;
  label: string;
  description: string;
  last?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", padding: "1rem 1.25rem", borderBottom: last ? "none" : "1px solid #f3f3f3" }}>
      <input type="hidden" name={name} value={String(value)} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#111", marginBottom: "0.25rem" }}>{label}</div>
        <div style={{ fontSize: "0.75rem", color: "#aaa", lineHeight: 1.5 }}>{description}</div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          flexShrink: 0,
          width: 36, height: 20, borderRadius: 10,
          background: value ? "#16a34a" : "#e5e7eb",
          border: "none", cursor: "pointer", position: "relative",
          transition: "background 0.2s",
        }}
        aria-label={value ? "Enabled" : "Disabled"}
      >
        <span style={{
          position: "absolute", top: 2, left: value ? 18 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
        }} />
      </button>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", padding: "0.75rem 0", borderBottom: "1px solid #f5f5f5" }}>
      <span style={{ width: 180, fontSize: "0.8125rem", color: "#999", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.8125rem", color: "#111" }}>{value}</span>
    </div>
  );
}

type ResultRow = {
  variantId: string;
  _sum: { sessions: number | null; uniqueVisitors: number | null; addToCartCount: number | null; initiateCheckoutCount: number | null; conversionCount: number | null; revenue: number | null };
  _max: { windowEnd: string | null; pValue: number | null; srmPValue: number | null; liftPct: number | null };
};

type LiveOrder = {
  variantId: string | null;
  _count: { id: number };
  _sum: { revenue: number | null };
};

type VariantStub = { id: string; name: string; isControl: boolean };

type BreakdownRow = { variantId: string; dim: string; sessions: number; atc: number; checkout: number; orders: number; revenue: number };
type Breakdown = { device: BreakdownRow[]; source: BreakdownRow[]; visitorType: BreakdownRow[] };

function BreakdownSection({ variants, breakdown }: { variants: VariantStub[]; breakdown: Breakdown }) {
  const [dim, setDim] = React.useState<"device" | "source" | "visitorType">("device");
  const rows = breakdown[dim];
  const dimValues = [...new Set(rows.map((r) => r.dim))].sort();
  if (dimValues.length === 0) return null;

  const DIM_LABELS: Record<string, string> = {
    device: "Device", source: "Traffic source", visitorType: "Visitor type",
  };
  const VALUE_LABELS: Record<string, string> = {
    mobile: "Mobile", tablet: "Tablet", desktop: "Desktop", unknown: "Unknown",
    paid: "Paid", organic: "Organic", direct: "Direct", social: "Social", email: "Email", referral: "Referral",
    new: "New", returning: "Returning",
  };

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.3rem 0.75rem", fontSize: "0.75rem", border: "1px solid #e9e9e9",
    borderRadius: 6, cursor: "pointer", background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#555", fontWeight: active ? 500 : 400,
  });

  const thS: React.CSSProperties = { textAlign: "left", fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.5rem 0.75rem", fontWeight: 500, borderBottom: "1px solid #e9e9e9", whiteSpace: "nowrap" };
  const tdS: React.CSSProperties = { padding: "0.6rem 0.75rem", fontSize: "0.8125rem", color: "#111", borderBottom: "1px solid #f3f3f3" };
  const tdNS: React.CSSProperties = { ...tdS, textAlign: "right", fontVariantNumeric: "tabular-nums" };

  const fmtCvr = (orders: number, sessions: number) =>
    sessions > 0 ? `${((orders / sessions) * 100).toFixed(2)}%` : "—";
  const fmtRev = (r: number) => r > 0 ? `$${r.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  // Compute control CVR per dim value for lift
  const controlId = variants.find((v) => v.isControl)?.id;
  const controlByDim = new Map<string, BreakdownRow>();
  if (controlId) {
    for (const r of rows) {
      if (r.variantId === controlId) controlByDim.set(r.dim, r);
    }
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Breakdown
        </div>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          {(["device", "source", "visitorType"] as const).map((d) => (
            <button key={d} style={btnStyle(dim === d)} onClick={() => setDim(d)}>
              {DIM_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto", border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={thS}>{DIM_LABELS[dim]}</th>
              {variants.map((v) => (
                <React.Fragment key={v.id}>
                  <th style={{ ...thS, textAlign: "right" }}>{v.name} sessions</th>
                  <th style={{ ...thS, textAlign: "right" }}>{v.name} CVR</th>
                  <th style={{ ...thS, textAlign: "right" }}>{v.name} revenue</th>
                  {!v.isControl && <th style={{ ...thS, textAlign: "right" }}>vs control</th>}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {dimValues.map((dv) => {
              const ctrl = controlByDim.get(dv);
              const ctrlCvr = ctrl && ctrl.sessions > 0 ? ctrl.orders / ctrl.sessions : null;
              return (
                <tr key={dv}>
                  <td style={{ ...tdS, fontWeight: 500 }}>{VALUE_LABELS[dv] ?? dv}</td>
                  {variants.map((v) => {
                    const r = rows.find((x) => x.variantId === v.id && x.dim === dv);
                    const sessions = r?.sessions ?? 0;
                    const orders = r?.orders ?? 0;
                    const revenue = r?.revenue ?? 0;
                    const varCvr = sessions > 0 ? orders / sessions : null;
                    const lift = !v.isControl && ctrlCvr != null && varCvr != null && ctrlCvr > 0
                      ? ((varCvr - ctrlCvr) / ctrlCvr)
                      : null;
                    return (
                      <React.Fragment key={v.id}>
                        <td style={tdNS}>{sessions.toLocaleString()}</td>
                        <td style={tdNS}>{fmtCvr(orders, sessions)}</td>
                        <td style={tdNS}>{fmtRev(revenue)}</td>
                        {!v.isControl && (
                          <td style={{ ...tdNS, color: lift == null ? "#999" : lift > 0 ? "#16a34a" : lift < 0 ? "#dc2626" : "#111" }}>
                            {lift == null ? "—" : `${lift > 0 ? "+" : ""}${(lift * 100).toFixed(1)}%`}
                          </td>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "0.7rem", color: "#bbb", margin: "0.375rem 0 0" }}>
        CVR and lift computed per segment. Revenue is order revenue attributed to visitors in that segment.
      </p>
    </div>
  );
}

function ResultsTable({
  variants,
  resultRows,
  liveOrders,
  startAt,
  breakdown,
}: {
  variants: VariantStub[];
  resultRows: ResultRow[];
  liveOrders: LiveOrder[];
  startAt: string | null;
  breakdown: Breakdown;
}) {
  const srmFlagged = resultRows.some((r) => (r._max.srmPValue ?? 1) < 0.01);
  const pValue = resultRows.find((r) => r._max.pValue != null)?._max.pValue ?? null;

  const rows = variants.map((v) => {
    const res = resultRows.find((r) => r.variantId === v.id);
    const live = liveOrders.find((o) => o.variantId === v.id);

    const sessions = res?._sum.sessions ?? 0;
    const orders = Math.max(res?._sum.conversionCount ?? 0, live?._count.id ?? 0);
    const revenue = Math.max(res?._sum.revenue ?? 0, live?._sum.revenue ?? 0);
    const atc = res?._sum.addToCartCount ?? 0;
    const checkout = res?._sum.initiateCheckoutCount ?? 0;

    const cvr = sessions > 0 ? orders / sessions : null;
    const atcRate = sessions > 0 ? atc / sessions : null;
    const checkoutRate = sessions > 0 ? checkout / sessions : null;
    const aov = orders > 0 ? revenue / orders : null;

    return { v, sessions, orders, revenue, atc, checkout, cvr, atcRate, checkoutRate, aov, liftPct: res?._max.liftPct ?? null };
  });

  const fmt = (n: number | null, decimals = 1, suffix = "%") =>
    n == null ? "—" : `${(n * (suffix === "%" ? 100 : 1)).toFixed(decimals)}${suffix}`;
  const fmtMoney = (n: number | null) =>
    n == null || n === 0 ? "—" : `$${n.toFixed(2)}`;

  const thStyle: React.CSSProperties = { textAlign: "left", fontSize: "0.7rem", color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.05em", padding: "0.5rem 0.75rem", fontWeight: 500, borderBottom: "1px solid #e9e9e9", whiteSpace: "nowrap" as const };
  const tdStyle: React.CSSProperties = { padding: "0.75rem", fontSize: "0.8125rem", color: "#111", borderBottom: "1px solid #f3f3f3" };
  const tdNumStyle: React.CSSProperties = { ...tdStyle, textAlign: "right" as const, fontVariantNumeric: "tabular-nums" };

  return (
    <div>
      {srmFlagged && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, fontSize: "0.8125rem", color: "#991b1b" }}>
          ⚠ <strong>Sample Ratio Mismatch</strong> — visitor allocation is significantly off from target weights. Results cannot be trusted until this is resolved.
        </div>
      )}
      <ConclusionBanner pValue={pValue} srmFlagged={srmFlagged} rows={rows} startAt={startAt} />
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#fafafa" }}>
              <th style={thStyle}>Variant</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Sessions</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Orders</th>
              <th style={{ ...thStyle, textAlign: "right" }}>CVR</th>
              <th style={{ ...thStyle, textAlign: "right" }}>ATC Rate</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Checkout Rate</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Revenue</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rev / visitor</th>
              <th style={{ ...thStyle, textAlign: "right" }}>AOV</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Lift</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ v, sessions, orders, revenue, cvr, atcRate, checkoutRate, aov, liftPct }) => (
              <tr key={v.id}>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 500 }}>{v.name}</span>
                  {v.isControl && (
                    <span style={{ marginLeft: "0.4rem", fontSize: "0.65rem", color: "#999", background: "#f3f3f3", borderRadius: 3, padding: "0.1rem 0.4rem" }}>control</span>
                  )}
                </td>
                <td style={tdNumStyle}>{sessions.toLocaleString()}</td>
                <td style={tdNumStyle}>{orders.toLocaleString()}</td>
                <td style={tdNumStyle}>{fmt(cvr)}</td>
                <td style={tdNumStyle}>{fmt(atcRate)}</td>
                <td style={tdNumStyle}>{fmt(checkoutRate)}</td>
                <td style={tdNumStyle}>{fmtMoney(revenue)}</td>
                <td style={tdNumStyle}>{sessions > 0 && revenue > 0 ? `$${(revenue / sessions).toFixed(2)}` : "—"}</td>
                <td style={tdNumStyle}>{fmtMoney(aov)}</td>
                <td style={{ ...tdNumStyle, color: liftPct == null ? "#999" : liftPct > 0 ? "#16a34a" : liftPct < 0 ? "#dc2626" : "#111" }}>
                  {v.isControl ? "—" : liftPct == null ? "—" : `${liftPct > 0 ? "+" : ""}${(liftPct * 100).toFixed(1)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "0.7rem", color: "#bbb", margin: "0.5rem 0 0" }}>
        Cumulative totals across all rollup windows. Click ↻ Refresh results to include the latest data.
      </p>
      <BreakdownSection variants={variants} breakdown={breakdown} />
    </div>
  );
}

function getVariantDetail(
  v: { themeId?: string | null; redirectUrl?: string | null; priceAdjType?: string | null; priceAdjValue?: number | null },
  type: ExperimentType,
): string {
  if (type === "THEME" && v.themeId) return ` · Theme ${v.themeId.split("/").pop()}`;
  if (type === "URL_REDIRECT" && v.redirectUrl) return ` · → ${v.redirectUrl}`;
  if (type === "PRICE" && v.priceAdjValue != null) {
    return ` · ${v.priceAdjType === "percent" ? `${v.priceAdjValue}% off` : `$${v.priceAdjValue} fixed`}`;
  }
  return "";
}
