/**
 * Plan limits — single source of truth for feature gating.
 * All enforcement goes through getPlanLimits().
 */
import { prisma } from "../db.server";

export type PlanLimits = {
  maxRunningExperiments: number; // -1 = unlimited
  allowedTypes: string[];
  segmentsEnabled: boolean;
  csvExportEnabled: boolean;
  liftAssistEnabled: boolean;
  fullAnalyticsEnabled: boolean;
};

const PLAN_LIMITS: Record<string, PlanLimits> = {
  free_trial: {
    maxRunningExperiments: 3,
    allowedTypes: ["THEME", "URL_REDIRECT"],
    segmentsEnabled: false,
    csvExportEnabled: false,
    liftAssistEnabled: false,
    fullAnalyticsEnabled: false,
  },
  starter: {
    maxRunningExperiments: 10,
    allowedTypes: ["THEME", "URL_REDIRECT", "PRICE", "SECTION", "PAGE", "TEMPLATE"],
    segmentsEnabled: false,
    csvExportEnabled: true,
    liftAssistEnabled: false,
    fullAnalyticsEnabled: true,
  },
  growth: {
    maxRunningExperiments: -1,
    allowedTypes: ["THEME", "URL_REDIRECT", "PRICE", "SECTION", "PAGE", "TEMPLATE"],
    segmentsEnabled: true,
    csvExportEnabled: true,
    liftAssistEnabled: true,
    fullAnalyticsEnabled: true,
  },
  scale: {
    maxRunningExperiments: -1,
    allowedTypes: ["THEME", "URL_REDIRECT", "PRICE", "SECTION", "PAGE", "TEMPLATE"],
    segmentsEnabled: true,
    csvExportEnabled: true,
    liftAssistEnabled: true,
    fullAnalyticsEnabled: true,
  },
};

export async function getPlanLimits(shopId: string, preloadedPlanName?: string | null): Promise<PlanLimits & { planName: string }> {
  const planName = preloadedPlanName ?? (await prisma.billingPlan.findUnique({ where: { shopId } }))?.planName ?? "free_trial";
  const limits = PLAN_LIMITS[planName] ?? PLAN_LIMITS.free_trial;
  return { ...limits, planName };
}

export async function checkExperimentLimit(shopId: string, preloadedPlanName?: string | null): Promise<{ allowed: boolean; reason?: string }> {
  const limits = await getPlanLimits(shopId, preloadedPlanName);
  if (limits.maxRunningExperiments === -1) return { allowed: true };

  const running = await prisma.experiment.count({ where: { shopId, status: "RUNNING" } });
  if (running >= limits.maxRunningExperiments) {
    return {
      allowed: false,
      reason: `Your ${limits.planName.replace(/_/g, " ")} plan allows ${limits.maxRunningExperiments} running experiment${limits.maxRunningExperiments !== 1 ? "s" : ""}. Upgrade to run more.`,
    };
  }
  return { allowed: true };
}

export function checkTypeAllowed(limits: PlanLimits, type: string): { allowed: boolean; reason?: string } {
  if (limits.allowedTypes.includes(type)) return { allowed: true };
  return {
    allowed: false,
    reason: `${type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, " ")} tests require a paid plan. Upgrade to unlock all test types.`,
  };
}
