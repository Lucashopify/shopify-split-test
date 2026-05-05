import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useRevalidator } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Banner,
  Tabs,
  Box,
  DataTable,
  Divider,
  InlineGrid,
  ProgressBar,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { syncConfigToMetafield } from "../lib/experiments/config.server";
import { ExperimentStatusBadge } from "../components/ExperimentStatusBadge";
import type { ExperimentStatus, ExperimentType } from "@prisma/client";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

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

  return { experiment };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
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

const TABS = [
  { id: "overview", content: "Overview" },
  { id: "variants", content: "Variants" },
  { id: "results", content: "Results" },
];

export default function ExperimentDetail() {
  const { experiment } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [selectedTab, setSelectedTab] = useState(0);

  const status = experiment.status as ExperimentStatus;
  const type = experiment.type as ExperimentType;

  const submit = useCallback(
    async (intent: string) => {
      await fetch(`/app/experiments/${experiment.id}`, {
        method: "POST",
        body: new URLSearchParams({ intent }),
      });
      revalidator.revalidate();
    },
    [experiment.id, revalidator],
  );

  const primaryAction = () => {
    if (status === "DRAFT" || status === "PAUSED") {
      return {
        content: status === "DRAFT" ? "Start experiment" : "Resume",
        onAction: () => submit(status === "DRAFT" ? "start" : "resume"),
      };
    }
    if (status === "RUNNING") {
      return { content: "Pause", onAction: () => submit("pause"), tone: "critical" as const };
    }
    return undefined;
  };

  const secondaryActions = [];
  if (status === "RUNNING" || status === "PAUSED") {
    secondaryActions.push({ content: "Mark complete", onAction: () => submit("complete") });
  }
  if (status === "COMPLETED") {
    secondaryActions.push({ content: "Archive", onAction: () => submit("archive") });
  }

  return (
    <Page
      title={experiment.name}
      backAction={{ content: "Experiments", onAction: () => navigate("/app/experiments") }}
      titleMetadata={<ExperimentStatusBadge status={status} />}
      primaryAction={primaryAction()}
      secondaryActions={secondaryActions}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab}>
              <Box padding="400">
                {selectedTab === 0 && (
                  <BlockStack gap="400">
                    <InlineGrid columns={3} gap="400">
                      <StatBox label="Visitors" value={experiment._count.allocations.toLocaleString()} />
                      <StatBox label="Events" value={experiment._count.events.toLocaleString()} />
                      <StatBox label="Orders" value={experiment._count.orders.toLocaleString()} />
                    </InlineGrid>
                    <Divider />
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">Type</Text>
                      <Text as="p">{type.replace(/_/g, " ")}</Text>
                    </BlockStack>
                    {experiment.hypothesis && (
                      <BlockStack gap="200">
                        <Text as="p" tone="subdued">Hypothesis</Text>
                        <Text as="p">{experiment.hypothesis}</Text>
                      </BlockStack>
                    )}
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">Traffic allocation</Text>
                      <InlineStack gap="300" blockAlign="center">
                        <Box minWidth="120px">
                          <ProgressBar progress={experiment.trafficAllocation} size="small" />
                        </Box>
                        <Text as="span">{experiment.trafficAllocation}%</Text>
                      </InlineStack>
                    </BlockStack>
                    <BlockStack gap="200">
                      <Text as="p" tone="subdued">Created</Text>
                      <Text as="p">{new Date(experiment.createdAt).toLocaleString()}</Text>
                    </BlockStack>
                  </BlockStack>
                )}

                {selectedTab === 1 && (
                  <BlockStack gap="300">
                    {experiment.variants.map((v) => (
                      <Card key={v.id}>
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="span" fontWeight="semibold">{v.name}</Text>
                              {v.isControl && <Badge>Control</Badge>}
                            </InlineStack>
                            <Text as="p" tone="subdued" variant="bodySm">
                              Traffic: {v.trafficWeight}%
                              {getVariantSummary(v, experiment.type as ExperimentType)}
                            </Text>
                          </BlockStack>
                          <Button
                            variant="plain"
                            onClick={() => navigate(`/app/experiments/${experiment.id}/variants/${v.id}`)}
                          >
                            Configure
                          </Button>
                        </InlineStack>
                      </Card>
                    ))}
                  </BlockStack>
                )}

                {selectedTab === 2 && (
                  <BlockStack gap="400">
                    {status === "DRAFT" ? (
                      <Banner tone="info">
                        Start the experiment to begin collecting results.
                      </Banner>
                    ) : (
                      <Text as="p" tone="subdued">
                        Statistical results will appear here once enough data has been collected.
                      </Text>
                    )}
                  </BlockStack>
                )}
              </Box>
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" tone="subdued" variant="bodySm">{label}</Text>
        <Text as="p" variant="headingLg" fontWeight="bold">{value}</Text>
      </BlockStack>
    </Card>
  );
}

function getVariantSummary(
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
