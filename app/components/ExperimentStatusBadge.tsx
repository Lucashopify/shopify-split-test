import { Badge } from "@shopify/polaris";
import type { ExperimentStatus } from "@prisma/client";

const STATUS_CONFIG: Record<
  ExperimentStatus,
  { tone: "success" | "info" | "warning" | "critical" | "attention" | undefined; label: string }
> = {
  DRAFT: { tone: undefined, label: "Draft" },
  SCHEDULED: { tone: "attention", label: "Scheduled" },
  RUNNING: { tone: "success", label: "Running" },
  PAUSED: { tone: "warning", label: "Paused" },
  COMPLETED: { tone: "info", label: "Completed" },
  ARCHIVED: { tone: undefined, label: "Archived" },
};

export function ExperimentStatusBadge({ status }: { status: ExperimentStatus }) {
  const { tone, label } = STATUS_CONFIG[status] ?? { tone: undefined, label: status };
  return <Badge tone={tone}>{label}</Badge>;
}
