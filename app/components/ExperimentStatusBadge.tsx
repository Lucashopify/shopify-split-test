import type { ExperimentStatus } from "@prisma/client";

const STATUS_CONFIG: Record<ExperimentStatus, { color: string; bg: string; label: string }> = {
  DRAFT:     { color: "#777",    bg: "#f3f3f3", label: "Draft" },
  SCHEDULED: { color: "#7c3aed", bg: "#f5f3ff", label: "Scheduled" },
  RUNNING:   { color: "#16a34a", bg: "#f0fdf4", label: "Running" },
  PAUSED:    { color: "#d97706", bg: "#fffbeb", label: "Paused" },
  COMPLETED: { color: "#2563eb", bg: "#eff6ff", label: "Completed" },
  ARCHIVED:  { color: "#9ca3af", bg: "#f9fafb", label: "Archived" },
};

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  const { color, bg, label } = STATUS_CONFIG[status] ?? { color: "#999", bg: "#f3f3f3", label: status };
  return (
    <span style={{
      display: "inline-block",
      fontSize: "0.7rem",
      fontWeight: 500,
      color,
      background: bg,
      borderRadius: 4,
      padding: "0.15rem 0.5rem",
      letterSpacing: "0.02em",
    }}>
      {label}
    </span>
  );
}
