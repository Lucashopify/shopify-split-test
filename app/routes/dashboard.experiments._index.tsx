import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  EmptyState,
  Filters,
  IndexTable,
  useIndexResourceState,
  Badge,
  Tabs,
  Box,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { requireDashboardSession } from "../lib/dashboard-auth.server";
import { prisma } from "../db.server";
import { ExperimentStatusBadge } from "../components/ExperimentStatusBadge";
import type { ExperimentStatus, ExperimentType } from "@prisma/client";

const STATUS_TABS = [
  { id: "all", content: "All" },
  { id: "RUNNING", content: "Running" },
  { id: "DRAFT", content: "Draft" },
  { id: "PAUSED", content: "Paused" },
  { id: "COMPLETED", content: "Completed" },
  { id: "ARCHIVED", content: "Archived" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireDashboardSession(request); // auth
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "all";
  const query = url.searchParams.get("query") ?? "";

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) {
    return { experiments: [], total: 0 };
  }

  const where = {
    shopId: shop.id,
    ...(statusFilter !== "all"
      ? { status: statusFilter as ExperimentStatus }
      : {}),
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

export default function ExperimentsIndex() {
  const { experiments, total } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [queryValue, setQueryValue] = useState(
    searchParams.get("query") ?? "",
  );
  const selectedTabIndex = STATUS_TABS.findIndex(
    (t) => t.id === (searchParams.get("status") ?? "all"),
  );

  const { selectedResources, allResourcesSelected, handleSelectionChange } =
    useIndexResourceState(experiments);

  const handleTabChange = useCallback(
    (idx: number) => {
      const params = new URLSearchParams(searchParams);
      const id = STATUS_TABS[idx].id;
      if (id === "all") {
        params.delete("status");
      } else {
        params.set("status", id);
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const handleQueryChange = useCallback(
    (val: string) => {
      setQueryValue(val);
      const params = new URLSearchParams(searchParams);
      if (val) {
        params.set("query", val);
      } else {
        params.delete("query");
      }
      setSearchParams(params);
    },
    [searchParams, setSearchParams],
  );

  const rowMarkup = experiments.map((exp, idx) => (
    <IndexTable.Row
      id={exp.id}
      key={exp.id}
      selected={selectedResources.includes(exp.id)}
      position={idx}
      onClick={() => navigate(`/dashboard/experiments/${exp.id}`)}
    >
      <IndexTable.Cell>
        <Text as="span" fontWeight="semibold">
          {exp.name}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{exp.type.replace(/_/g, " ")}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <ExperimentStatusBadge status={exp.status as ExperimentStatus} />
      </IndexTable.Cell>
      <IndexTable.Cell>{exp.variants.length}</IndexTable.Cell>
      <IndexTable.Cell>{exp._count.allocations.toLocaleString()}</IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(exp.updatedAt).toLocaleDateString()}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Experiments"
      primaryAction={{
        content: "New experiment",
        icon: PlusIcon,
        onAction: () => navigate("/dashboard/experiments/new"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Tabs
              tabs={STATUS_TABS}
              selected={selectedTabIndex < 0 ? 0 : selectedTabIndex}
              onSelect={handleTabChange}
            >
              <Box paddingInline="400" paddingBlock="200">
                <Filters
                  queryValue={queryValue}
                  queryPlaceholder="Search experiments"
                  filters={[]}
                  onQueryChange={handleQueryChange}
                  onQueryClear={() => handleQueryChange("")}
                  onClearAll={() => handleQueryChange("")}
                />
              </Box>

              {experiments.length === 0 ? (
                <Box padding="400">
                  <EmptyState
                    heading="No experiments found"
                    action={{
                      content: "Create experiment",
                      onAction: () => navigate("/dashboard/experiments/new"),
                    }}
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <Text as="p" tone="subdued">
                      Try adjusting your filters or create a new experiment.
                    </Text>
                  </EmptyState>
                </Box>
              ) : (
                <IndexTable
                  resourceName={{ singular: "experiment", plural: "experiments" }}
                  itemCount={total}
                  selectedItemsCount={
                    allResourcesSelected ? "All" : selectedResources.length
                  }
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Name" },
                    { title: "Type" },
                    { title: "Status" },
                    { title: "Variants" },
                    { title: "Visitors" },
                    { title: "Updated" },
                  ]}
                >
                  {rowMarkup}
                </IndexTable>
              )}
            </Tabs>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
