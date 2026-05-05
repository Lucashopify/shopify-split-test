import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  EmptyState,
  DataTable,
  Badge,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { ExperimentStatusBadge } from "../components/ExperimentStatusBadge";
import type { ExperimentStatus } from "@prisma/client";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) return { experiments: [] };

  const experiments = await prisma.experiment.findMany({
    where: {
      shopId: shop.id,
      status: { in: ["RUNNING", "COMPLETED", "PAUSED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      variants: true,
      results: {
        orderBy: { windowEnd: "desc" },
        take: 1,
      },
    },
  });

  return { experiments };
};

export default function Results() {
  const { experiments } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const rows = experiments.map((exp) => {
    const latestResult = exp.results[0];
    const controlVariant = exp.variants.find((v) => v.isControl);
    const treatmentVariant = exp.variants.find((v) => !v.isControl);

    return [
      exp.name,
      <ExperimentStatusBadge key={exp.id} status={exp.status as ExperimentStatus} />,
      controlVariant?.name ?? "—",
      treatmentVariant?.name ?? "—",
      latestResult?.liftPct != null
        ? `${latestResult.liftPct >= 0 ? "+" : ""}${latestResult.liftPct.toFixed(2)}%`
        : "—",
      latestResult?.pValue != null
        ? latestResult.pValue.toFixed(3)
        : "—",
      latestResult?.srmFlagged ? (
        <Badge key={`srm-${exp.id}`} tone="warning">
          SRM
        </Badge>
      ) : (
        "—"
      ),
    ];
  });

  return (
    <Page title="Results">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Experiment results
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Statistical engine (mSPRT, CUPED, Bayesian) ships in Phase 3.
                Results shown here will include lift %, p-values, and Bayesian
                probability-to-be-best per variant.
              </Text>

              {experiments.length === 0 ? (
                <EmptyState
                  heading="No results yet"
                  action={{
                    content: "Create an experiment",
                    onAction: () => navigate("/app/experiments/new"),
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" tone="subdued">
                    Start a test to see results here.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={[
                    "text",
                    "text",
                    "text",
                    "text",
                    "numeric",
                    "numeric",
                    "text",
                  ]}
                  headings={[
                    "Experiment",
                    "Status",
                    "Control",
                    "Treatment",
                    "Lift",
                    "p-value",
                    "Flags",
                  ]}
                  rows={rows}
                />
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
