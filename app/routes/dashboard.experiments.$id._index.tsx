import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useFetcher } from "react-router";
import { useState } from "react";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { syncConfigToMetafield } from "../lib/experiments/config.server";
import type { ExperimentStatus, ExperimentType } from "@prisma/client";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, setCookie } = await requireDashboardSession(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: {
      variants: {
        orderBy: [{ isControl: "desc" }, { createdAt: "asc" }],
      },
      _count: { select: { allocations: true, events: true, orders: true } },
    },
  });

  if (!experiment) throw new Response("Experiment not found", { status: 404 });

  return Response.json({ experiment }, { headers: { "Set-Cookie": setCookie } });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await requireDashboardSession(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return { error: "Shop not found" };

  const exp = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
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
    await prisma.experiment.update({
      where: { id: exp.id },
      data: { status: statusMap[intent] },
    });
    try {
      await syncConfigToMetafield(admin, shop.id);
    } catch (err) {
      console.error("[action] Failed to sync config metafield:", err);
    }
    return { ok: true };
  }

  return { error: "Unknown intent" };
};

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "#16a34a", PAUSED: "#d97706", DRAFT: "#6b7280",
  COMPLETED: "#2563eb", ARCHIVED: "#9ca3af", SCHEDULED: "#7c3aed",
};

const TABS = ["Overview", "Variants", "Results"];

export default function ExperimentDetail() {
  const { experiment } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const [tab, setTab] = useState(0);

  const status = experiment.status as ExperimentStatus;
  const type = experiment.type as ExperimentType;
  const isSubmitting = fetcher.state !== "idle";

  // Optimistic status: use pending intent while fetcher is submitting
  const pendingIntent = fetcher.formData?.get("intent") as string | undefined;
  const intentStatusMap: Record<string, string> = {
    start: "RUNNING", pause: "PAUSED", resume: "RUNNING",
    complete: "COMPLETED", archive: "ARCHIVED",
  };
  const displayStatus = (pendingIntent && intentStatusMap[pendingIntent]) ? intentStatusMap[pendingIntent] : status;

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>
              {experiment.name}
            </h1>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", fontSize: "0.75rem", color: STATUS_COLORS[displayStatus] ?? "#999" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[displayStatus] ?? "#999", display: "inline-block" }} />
              {displayStatus.toLowerCase()}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {(displayStatus === "RUNNING" || displayStatus === "PAUSED") && (
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="complete" />
                <button type="submit" disabled={isSubmitting} style={{ padding: "0.4rem 0.875rem", background: "none", color: "#777", border: "1px solid #e9e9e9", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer" }}>
                  Mark complete
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

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden", marginBottom: "1.5rem" }}>
        {[
          { label: "Visitors", value: experiment._count.allocations.toLocaleString() },
          { label: "Events", value: experiment._count.events.toLocaleString() },
          { label: "Orders", value: experiment._count.orders.toLocaleString() },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: "1.1rem 1.5rem", borderRight: i < 2 ? "1px solid #e9e9e9" : "none" }}>
            <div style={{ fontSize: "0.7rem", color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>{s.label}</div>
            <div style={{ fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.03em", color: "#111" }}>{s.value}</div>
          </div>
        ))}
      </div>

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
          {experiment.hypothesis && <DetailRow label="Hypothesis" value={experiment.hypothesis} />}
          <DetailRow label="Traffic allocation" value={`${experiment.trafficAllocation}%`} />
          <DetailRow label="Target template" value={experiment.targetTemplate ?? "All pages"} />
          <DetailRow label="Created" value={new Date(experiment.createdAt).toLocaleString()} />
        </div>
      )}

      {tab === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
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

      {tab === 2 && (
        <div style={{ padding: "2rem", border: "1px dashed #e9e9e9", borderRadius: 8, textAlign: "center" }}>
          {displayStatus === "DRAFT" ? (
            <p style={{ fontSize: "0.875rem", color: "#999", margin: 0 }}>Start the experiment to begin collecting results.</p>
          ) : (
            <p style={{ fontSize: "0.875rem", color: "#999", margin: 0 }}>Results will appear here once enough data has been collected.</p>
          )}
        </div>
      )}
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
