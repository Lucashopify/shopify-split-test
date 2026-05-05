import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  DataTable,
  EmptyState,
  Box,
  Divider,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { StatCard } from "../components/StatCard";
import { ExperimentStatusBadge } from "../components/ExperimentStatusBadge";
import type { ExperimentStatus, ExperimentType } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: {
      experiments: {
        where: {
          status: { in: ["RUNNING", "PAUSED", "SCHEDULED"] },
        },
        orderBy: { updatedAt: "desc" },
        take: 10,
        include: { variants: true },
      },
      billingPlan: true,
    },
  });

  const [activeCount, totalCount, visitorCount] = await Promise.all([
    prisma.experiment.count({
      where: { shopId: shop?.id, status: "RUNNING" },
    }),
    prisma.experiment.count({
      where: { shopId: shop?.id },
    }),
    prisma.visitor.count({
      where: { shopId: shop?.id },
    }),
  ]);

  return {
    shopDomain: session.shop,
    activeExperiments: activeCount,
    totalExperiments: totalCount,
    visitorsTested: visitorCount,
    recentExperiments: shop?.experiments ?? [],
    billingPlan: shop?.billingPlan?.planName ?? "free_trial",
  };
};

export default function Dashboard() {
  const {
    shopDomain,
    activeExperiments,
    totalExperiments,
    visitorsTested,
    recentExperiments,
    billingPlan,
  } = useLoaderData<typeof loader>();

  const navigate = useNavigate();

  const experimentRows = recentExperiments.map((exp) => [
    exp.name,
    <Badge key={`type-${exp.id}`} tone="info">
      {exp.type.replace("_", " ")}
    </Badge>,
    <ExperimentStatusBadge key={`status-${exp.id}`} status={exp.status as ExperimentStatus} />,
    exp.variants.length,
    new Date(exp.updatedAt).toLocaleDateString(),
    <Button
      key={`view-${exp.id}`}
      variant="plain"
      onClick={() => navigate(`/app/experiments/${exp.id}`)}
    >
      View
    </Button>,
  ]);

  return (
    <Page
      title="Dashboard"
      subtitle={shopDomain}
      primaryAction={{
        content: "New experiment",
        icon: PlusIcon,
        onAction: () => navigate("/app/experiments/new"),
      }}
      secondaryActions={[{
        content: "Open standalone dashboard ↗",
        onAction: () => window.open(`/dashboard?shop=${shopDomain}`, "_blank"),
      }]}
    >
      <Layout>
        <Layout.Section>
          <InlineStack gap="400" wrap={false}>
            <StatCard
              label="Running tests"
              value={activeExperiments}
              tone={activeExperiments > 0 ? "success" : undefined}
            />
            <StatCard label="Total experiments" value={totalExperiments} />
            <StatCard
              label="Visitors tested"
              value={visitorsTested.toLocaleString()}
            />
            <StatCard
              label="Plan"
              value={billingPlan.replace("_", " ")}
            />
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  Active &amp; recent experiments
                </Text>
                <Button
                  variant="plain"
                  onClick={() => navigate("/app/experiments")}
                >
                  View all
                </Button>
              </InlineStack>

              {recentExperiments.length === 0 ? (
                <EmptyState
                  heading="No experiments yet"
                  action={{
                    content: "Create your first experiment",
                    onAction: () => navigate("/app/experiments/new"),
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" tone="subdued">
                    Start A/B testing your storefront — no code required.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "numeric",
                    "text",
                    "text",
                  ]}
                  headings={[
                    "Name",
                    "Type",
                    "Status",
                    "Variants",
                    "Updated",
                    "",
                  ]}
                  rows={experimentRows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
