import { type LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  EmptyState,
  DataTable,
} from "@shopify/polaris";
import { PlusIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
  });

  if (!shop) return { segments: [] };

  const segments = await prisma.segment.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { experiments: true } } },
  });

  return { segments };
};

export default function Segments() {
  const { segments } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const rows = segments.map((seg) => [
    seg.name,
    seg._count.experiments,
    new Date(seg.createdAt).toLocaleDateString(),
    <Button key={seg.id} variant="plain" onClick={() => navigate(`/app/segments/${seg.id}`)}>
      Edit
    </Button>,
  ]);

  return (
    <Page
      title="Segments"
      subtitle="Define audience filters to target or slice experiment results"
      primaryAction={{
        content: "New segment",
        icon: PlusIcon,
        onAction: () => navigate("/app/segments/new"),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="p" tone="subdued" variant="bodySm">
                Segments use a boolean rule builder (AND / OR / NOT) across
                device, geo, UTM, customer type, and custom attributes.
                Full segment builder ships in Phase 6.
              </Text>

              {segments.length === 0 ? (
                <EmptyState
                  heading="No segments yet"
                  action={{
                    content: "Create a segment",
                    onAction: () => navigate("/app/segments/new"),
                  }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <Text as="p" tone="subdued">
                    Segments let you target experiments to specific audiences
                    and slice results by device, geo, traffic source, and more.
                  </Text>
                </EmptyState>
              ) : (
                <DataTable
                  columnContentTypes={["text", "numeric", "text", "text"]}
                  headings={["Name", "Experiments", "Created", ""]}
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
