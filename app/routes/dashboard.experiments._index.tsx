import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { useState, useCallback } from "react";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { ExperimentStatusBadge } from "../components/ExperimentStatusBadge";
import type { ExperimentStatus } from "@prisma/client";

const STATUS_TABS = [
  { id: "all", label: "All" },
  { id: "RUNNING", label: "Running" },
  { id: "DRAFT", label: "Draft" },
  { id: "PAUSED", label: "Paused" },
  { id: "COMPLETED", label: "Completed" },
  { id: "ARCHIVED", label: "Archived" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireDashboardSession(request);
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const query = url.searchParams.get("query") ?? "";

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return { experiments: [], total: 0 };

  const where = {
    shopId: shop.id,
    ...(statusFilter !== "all" ? { status: statusFilter as ExperimentStatus } : {}),
    ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
  };

  const [experiments, total] = await Promise.all([
    prisma.experiment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        variants: { select: { id: true, name: true, isControl: true } },
        _count: { select: { allocations: true } },
      },
    }),
    prisma.experiment.count({ where }),
  ]);

  return { experiments, total };
};

const TYPE_LABELS: Record<string, string> = {
  THEME: "Theme",
  SECTION: "Section",
  PRICE: "Price",
  URL_REDIRECT: "URL redirect",
  TEMPLATE: "Template",
};

export default function ExperimentsIndex() {
  const { experiments, total } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("query") ?? "");

  const activeTab = searchParams.get("status") ?? "all";

  const handleTabChange = useCallback((id: string) => {
    const params = new URLSearchParams(searchParams);
    if (id === "all") params.delete("status"); else params.set("status", id);
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleSearch = useCallback((val: string) => {
    setQuery(val);
    const params = new URLSearchParams(searchParams);
    if (val) params.set("query", val); else params.delete("query");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const th: React.CSSProperties = {
    textAlign: "left",
    fontSize: "0.7rem",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 500,
    padding: "0.6rem 1rem",
    borderBottom: "1px solid #e9e9e9",
    whiteSpace: "nowrap",
  };
  const td: React.CSSProperties = {
    padding: "0.875rem 1rem",
    fontSize: "0.8125rem",
    color: "#111",
    borderBottom: "1px solid #f5f5f5",
    verticalAlign: "middle",
  };

  return (
    <div style={{ padding: "2.5rem 3rem", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.375rem", fontWeight: 600, margin: 0, letterSpacing: "-0.03em", color: "#111" }}>
          Experiments
        </h1>
        <button
          onClick={() => navigate("/dashboard/experiments/new")}
          style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
        >
          + New experiment
        </button>
      </div>

      {/* Tabs + Search */}
      <div style={{ border: "1px solid #e9e9e9", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e9e9e9", padding: "0 1rem" }}>
          <div style={{ display: "flex" }}>
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                style={{
                  padding: "0.75rem 0.875rem",
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === t.id ? "2px solid #111" : "2px solid transparent",
                  cursor: "pointer",
                  fontSize: "0.8125rem",
                  fontWeight: activeTab === t.id ? 500 : 400,
                  color: activeTab === t.id ? "#111" : "#999",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <input
            type="search"
            placeholder="Search experiments…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            style={{
              padding: "0.35rem 0.75rem",
              border: "1px solid #e9e9e9",
              borderRadius: 6,
              fontSize: "0.8125rem",
              color: "#111",
              outline: "none",
              width: 220,
            }}
          />
        </div>

        {experiments.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center" }}>
            <div style={{ fontSize: "0.875rem", color: "#999", marginBottom: "1rem" }}>No experiments found</div>
            <button
              onClick={() => navigate("/dashboard/experiments/new")}
              style={{ padding: "0.4rem 0.875rem", background: "#111", color: "#fff", border: "none", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
            >
              Create experiment
            </button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafafa" }}>
                <th style={th}>Name</th>
                <th style={th}>Type</th>
                <th style={th}>Status</th>
                <th style={th}>Variants</th>
                <th style={{ ...th, textAlign: "right" }}>Visitors</th>
                <th style={{ ...th, textAlign: "right" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {experiments.map((exp) => (
                <tr
                  key={exp.id}
                  onClick={() => navigate(`/dashboard/experiments/${exp.id}`)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#fafafa")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                >
                  <td style={{ ...td, fontWeight: 500 }}>{exp.name}</td>
                  <td style={td}>
                    <span style={{ fontSize: "0.75rem", color: "#777", background: "#f5f5f5", borderRadius: 4, padding: "0.15rem 0.5rem" }}>
                      {TYPE_LABELS[exp.type] ?? exp.type}
                    </span>
                  </td>
                  <td style={td}>
                    <ExperimentStatusBadge status={exp.status as ExperimentStatus} />
                  </td>
                  <td style={{ ...td, color: "#777" }}>{exp.variants.length}</td>
                  <td style={{ ...td, textAlign: "right", color: "#777" }}>{exp._count.allocations.toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", color: "#aaa" }}>{new Date(exp.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 50 && (
          <div style={{ padding: "0.75rem 1rem", borderTop: "1px solid #f5f5f5", fontSize: "0.75rem", color: "#aaa" }}>
            Showing 50 of {total} experiments
          </div>
        )}
      </div>
    </div>
  );
}
