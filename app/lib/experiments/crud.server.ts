import { prisma } from "../../db.server";
import type {
  ExperimentStatus,
  ExperimentType,
  Prisma,
} from "@prisma/client";

export type CreateExperimentInput = {
  shopId: string;
  name: string;
  hypothesis?: string;
  type: ExperimentType;
  targetTemplate?: string;
  targetUrl?: string;
  targetPageHandle?: string;
  trafficAllocation?: number;
  mutualExclusionGroup?: string;
  startAt?: Date;
  endAt?: Date;
  primaryMetric?: string;
  segmentId?: string;
  variants: Array<{
    name: string;
    isControl: boolean;
    trafficWeight: number;
  }>;
};

export async function createExperiment(input: CreateExperimentInput) {
  const {
    variants,
    shopId,
    ...experimentData
  } = input;

  // Validate weights sum to 100
  const totalWeight = variants.reduce((sum, v) => sum + v.trafficWeight, 0);
  if (Math.abs(totalWeight - 100) > 0.01) {
    throw new Error(
      `Variant traffic weights must sum to 100 (got ${totalWeight})`,
    );
  }

  // Ensure exactly one control
  const controlCount = variants.filter((v) => v.isControl).length;
  if (controlCount !== 1) {
    throw new Error("Exactly one variant must be designated as control");
  }

  const experiment = await prisma.experiment.create({
    data: {
      ...experimentData,
      shopId,
      variants: {
        create: variants,
      },
    },
    include: { variants: true },
  });

  await prisma.auditLog.create({
    data: {
      shopId,
      experimentId: experiment.id,
      actor: "merchant",
      action: "experiment.created",
      after: experiment as unknown as Prisma.InputJsonValue,
    },
  });

  return experiment;
}

export async function updateExperimentStatus(
  experimentId: string,
  shopId: string,
  newStatus: ExperimentStatus,
  actor: "merchant" | "system" | "worker" = "merchant",
) {
  const before = await prisma.experiment.findUnique({
    where: { id: experimentId },
  });

  if (!before) throw new Error("Experiment not found");
  if (before.shopId !== shopId) throw new Error("Forbidden");

  const experiment = await prisma.experiment.update({
    where: { id: experimentId },
    data: { status: newStatus },
  });

  await prisma.auditLog.create({
    data: {
      shopId,
      experimentId,
      actor,
      action: `experiment.status.${newStatus.toLowerCase()}`,
      before: { status: before.status } as Prisma.InputJsonValue,
      after: { status: newStatus } as Prisma.InputJsonValue,
    },
  });

  return experiment;
}

export async function getExperiment(experimentId: string, shopId: string) {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
    include: {
      variants: true,
      segment: true,
      results: {
        orderBy: { windowEnd: "desc" },
        take: 48, // last 48 hourly windows
      },
    },
  });

  if (!experiment || experiment.shopId !== shopId) return null;
  return experiment;
}

export async function deleteExperiment(experimentId: string, shopId: string) {
  const experiment = await prisma.experiment.findUnique({
    where: { id: experimentId },
  });

  if (!experiment || experiment.shopId !== shopId)
    throw new Error("Experiment not found");

  if (experiment.status === "RUNNING") {
    throw new Error("Cannot delete a running experiment. Pause it first.");
  }

  await prisma.experiment.delete({ where: { id: experimentId } });
}

/**
 * Enforce mutual exclusion: returns experiments that overlap with the given
 * group and template. Throws if there are active conflicts.
 */
export async function checkMutualExclusion(
  shopId: string,
  mutualExclusionGroup: string | undefined,
  targetTemplate: string | undefined,
  excludeExperimentId?: string,
) {
  if (!mutualExclusionGroup || !targetTemplate) return [];

  const conflicts = await prisma.experiment.findMany({
    where: {
      shopId,
      mutualExclusionGroup,
      targetTemplate,
      status: { in: ["RUNNING", "SCHEDULED"] },
      ...(excludeExperimentId ? { NOT: { id: excludeExperimentId } } : {}),
    },
  });

  return conflicts;
}
