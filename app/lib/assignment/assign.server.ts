/**
 * Server-side assignment upsert.
 *
 * Called by /api/assign (storefront POST) and by the Cloudflare Worker
 * (edge decisions, Phase 4).
 *
 * Guarantees:
 *  - One Visitor row per (shopId, visitorToken) — upsert on conflict.
 *  - One Allocation row per (experimentId, visitorId) — write-once.
 *  - Assignments are consistent with client-side FNV-1a bucketing.
 *    On first visit the client computes a local assignment; this function
 *    recomputes server-side and corrects any drift (edge case: none expected
 *    since both use the same FNV-1a implementation).
 */
import { prisma } from "../../db.server";
import {
  getBucket,
  assignVariant,
  isInAllocation,
} from "./bucket.server";
import type { ExperimentStatus } from "@prisma/client";

type SegmentRule = { field: string; op: string; value: string };
type SegmentRuleTree = { op: string; children: SegmentRule[] };

function matchesSegment(rules: unknown, attrs: Partial<Record<string, string>>): boolean {
  try {
    const r = rules as SegmentRuleTree;
    if (!r?.children?.length) return true;
    const results = r.children.map((child) => {
      const val = attrs[child.field];
      if (val == null) return true; // unknown attribute → allow
      const v = val.toLowerCase();
      const t = (child.value ?? "").toLowerCase();
      if (child.op === "eq") return v === t;
      if (child.op === "neq") return v !== t;
      if (child.op === "contains") return v.includes(t);
      return true;
    });
    return r.op === "OR" ? results.some(Boolean) : results.every(Boolean);
  } catch {
    return true; // parse error → allow
  }
}

export type AssignInput = {
  shopId: string;
  visitorToken: string;
  // Client-reported assignments (used as cache — server validates)
  clientAssignments?: Record<string, string>;
  // Visitor attributes for segmentation
  device?: string;
  country?: string;
  pageUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  shopifyCustomerId?: string;
};

export type AssignResult = {
  visitorId: string;
  assignments: Record<string, string>; // experimentId → variantId
};

export async function assignVisitor(input: AssignInput): Promise<AssignResult> {
  const {
    shopId,
    visitorToken,
    clientAssignments = {},
    device,
    country,
    pageUrl,
    utmSource,
    utmMedium,
    utmCampaign,
    referrer,
    shopifyCustomerId,
  } = input;

  // Upsert visitor
  const visitor = await prisma.visitor.upsert({
    where: { shopId_visitorToken: { shopId, visitorToken } },
    create: {
      shopId,
      visitorToken,
      device,
      country,
      utmSource,
      utmMedium,
      utmCampaign,
      referrer,
      shopifyCustomerId,
    },
    update: {
      lastSeenAt: new Date(),
      // Update attributes if they weren't set before
      device: device ?? undefined,
      country: country ?? undefined,
      shopifyCustomerId: shopifyCustomerId ?? undefined,
    },
  });

  // Load running experiments for this shop
  const experiments = await prisma.experiment.findMany({
    where: { shopId, status: "RUNNING" as ExperimentStatus },
    include: {
      variants: { orderBy: { createdAt: "asc" } },
      segment: { select: { id: true, rules: true } },
    },
  });

  const assignments: Record<string, string> = {};

  for (const exp of experiments) {
    // Check traffic allocation
    if (!isInAllocation(visitorToken, exp.id, exp.trafficAllocation)) {
      continue;
    }

    // Check segment match
    if (exp.segment) {
      const attrs: Partial<Record<string, string>> = {};
      if (device) attrs.device = device;
      if (country) attrs.country = country;
      if (utmSource) attrs.utmSource = utmSource;
      if (utmMedium) attrs.utmMedium = utmMedium;
      if (utmCampaign) attrs.utmCampaign = utmCampaign;
      if (referrer) attrs.referrer = referrer;
      if (visitor.customerType) attrs.customerType = visitor.customerType;
      if (!matchesSegment(exp.segment.rules, attrs)) continue;
    }

    // Check for existing allocation (write-once guarantee)
    const existing = await prisma.allocation.findUnique({
      where: {
        experimentId_visitorId: { experimentId: exp.id, visitorId: visitor.id },
      },
    });

    let variantId: string | null = null;

    if (existing) {
      variantId = existing.variantId;
    } else {
      // Compute server-side assignment
      const bucket = getBucket(visitorToken, exp.id);
      const variant = assignVariant(exp.variants, bucket);

      if (variant) {
        variantId = variant.id;

        // Write allocation — ignore race conditions (unique constraint)
        try {
          await prisma.allocation.create({
            data: {
              experimentId: exp.id,
              variantId: variant.id,
              visitorId: visitor.id,
            },
          });
        } catch (err) {
          // Concurrent upsert — re-read the winner
          const race = await prisma.allocation.findUnique({
            where: {
              experimentId_visitorId: {
                experimentId: exp.id,
                visitorId: visitor.id,
              },
            },
          });
          variantId = race?.variantId ?? null;
        }
      }
    }

    if (variantId) {
      assignments[exp.id] = variantId;
    }
  }

  return { visitorId: visitor.id, assignments };
}

/**
 * Upsert a raw event from the storefront.
 * Resolves the internal visitorId from the visitorToken.
 */
export async function recordEvent(input: {
  shopId: string;
  visitorToken: string;
  type: string;
  assignments: Record<string, string>;
  pageUrl?: string;
  elementId?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
}) {
  const { shopId, visitorToken, type, assignments, pageUrl, elementId, metadata, occurredAt } = input;

  const visitor = await prisma.visitor.findUnique({
    where: { shopId_visitorToken: { shopId, visitorToken } },
  });

  if (!visitor) return; // visitor hasn't been assigned yet — drop event

  const eventType = normalizeEventType(type);
  if (!eventType) return;

  // Write one Event row per experiment the visitor is assigned to
  for (const [experimentId, variantId] of Object.entries(assignments)) {
    try {
      await prisma.event.create({
        data: {
          shopId,
          experimentId,
          variantId,
          visitorId: visitor.id,
          type: eventType,
          url: pageUrl,
          elementId,
          metadata: metadata as never,
          occurredAt: occurredAt ?? new Date(),
        },
      });
    } catch (err: unknown) {
      // Stale cookie — experimentId/variantId no longer exists; skip silently
      const code = (err as { code?: string })?.code;
      if (code === "P2003" || code === "P2025") continue;
      throw err;
    }
  }
}

type ValidEventType =
  | "PAGE_VIEW"
  | "ADD_TO_CART"
  | "INITIATE_CHECKOUT"
  | "PURCHASE"
  | "CLICK"
  | "CUSTOM";

function normalizeEventType(raw: string): ValidEventType | null {
  const map: Record<string, ValidEventType> = {
    PAGE_VIEW: "PAGE_VIEW",
    page_viewed: "PAGE_VIEW",
    ADD_TO_CART: "ADD_TO_CART",
    product_added_to_cart: "ADD_TO_CART",
    INITIATE_CHECKOUT: "INITIATE_CHECKOUT",
    checkout_started: "INITIATE_CHECKOUT",
    PURCHASE: "PURCHASE",
    checkout_completed: "PURCHASE",
    CLICK: "CLICK",
    CUSTOM: "CUSTOM",
  };
  return map[raw] ?? null;
}
