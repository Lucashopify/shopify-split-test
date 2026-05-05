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
  Banner,
  Box,
  Divider,
  Icon,
} from "@shopify/polaris";
import { WandIcon, ChartVerticalIcon, StarIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

const TEMPLATE_PREVIEWS = [
  {
    slug: "countdown-timer",
    name: "Countdown Timer",
    category: "urgency",
    description: "Add urgency with a deadline timer near the ATC button.",
    estimatedLift: "+4–12% CVR",
  },
  {
    slug: "sticky-atc",
    name: "Sticky Add-to-Cart Bar",
    category: "conversion",
    description: "Persistent ATC bar follows the visitor as they scroll.",
    estimatedLift: "+6–18% CVR",
  },
  {
    slug: "free-shipping-bar",
    name: "Free Shipping Progress Bar",
    category: "aov",
    description: "Show progress toward free shipping to lift AOV.",
    estimatedLift: "+8–22% AOV",
  },
  {
    slug: "scarcity-indicator",
    name: "Inventory Scarcity Indicator",
    category: "urgency",
    description: "Show low stock warnings to reduce cart abandonment.",
    estimatedLift: "+3–9% CVR",
  },
  {
    slug: "trust-badges",
    name: "Trust Badges Row",
    category: "trust",
    description: "Guarantee, returns, and security badges below ATC.",
    estimatedLift: "+2–7% CVR",
  },
  {
    slug: "benefits-bar",
    name: "Business Benefits Bar",
    category: "trust",
    description: "Free shipping, easy returns, warranty icons at a glance.",
    estimatedLift: "+3–8% CVR",
  },
  {
    slug: "hero-offer",
    name: "Hero Offer / Announcement Bar",
    category: "engagement",
    description: "Prominent offer bar above the fold on collection pages.",
    estimatedLift: "+5–15% CTR",
  },
  {
    slug: "reviews-uplift",
    name: "Reviews Uplift on PDP",
    category: "trust",
    description: "Highlight star rating and review count prominently.",
    estimatedLift: "+4–11% CVR",
  },
  {
    slug: "cross-sell-carousel",
    name: "Cross-sell Carousel",
    category: "aov",
    description: "Frequently bought together carousel below the fold.",
    estimatedLift: "+10–30% AOV",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: {
      brandTokens: true,
      billingPlan: true,
    },
  });

  return {
    brandScanned: !!shop?.brandTokens,
    liftAssistEnabled: shop?.billingPlan?.liftAssistEnabled ?? false,
    templates: TEMPLATE_PREVIEWS,
  };
};

export default function LiftAssist() {
  const { brandScanned, liftAssistEnabled, templates } =
    useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page
      title="Lift Assist"
      subtitle="AI-powered experiment recommendations built for your brand"
    >
      <Layout>
        {!liftAssistEnabled && (
          <Layout.Section>
            <Banner
              title="Lift Assist is a paid add-on"
              action={{ content: "Upgrade plan", onAction: () => navigate("/app/billing") }}
              tone="info"
            >
              <Text as="p">
                Unlock brand scanning, AI recommendations, and pre-built
                experiment templates styled to your store.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Brand scanner
                  </Text>
                  <Text as="p" tone="subdued" variant="bodySm">
                    Crawls your storefront to extract colors, fonts, and
                    spacing — then applies your brand to every template.
                  </Text>
                </BlockStack>
                <Button
                  icon={WandIcon}
                  disabled={!liftAssistEnabled}
                  variant="primary"
                >
                  {brandScanned ? "Re-scan brand" : "Scan brand"}
                </Button>
              </InlineStack>

              {brandScanned && (
                <Badge tone="success">Brand tokens extracted</Badge>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="200">
                <Icon source={ChartVerticalIcon} />
                <Text as="h2" variant="headingMd">
                  AI recommendations
                </Text>
              </InlineStack>
              <Text as="p" tone="subdued" variant="bodySm">
                Analyzes your funnel data and proposes which template to test
                where. Powered by Claude (Anthropic). Ships in Phase 5.
              </Text>
              <Button icon={StarIcon} disabled={!liftAssistEnabled}>
                Generate recommendations
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              Template library
            </Text>
            <Text as="p" tone="subdued">
              {templates.length} pre-built experiments. Click any to preview
              and launch.
            </Text>

            {templates.map((tpl) => (
              <Card key={tpl.slug}>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <InlineStack gap="200">
                      <Text as="span" fontWeight="semibold">
                        {tpl.name}
                      </Text>
                      <Badge>{tpl.category}</Badge>
                    </InlineStack>
                    <Text as="p" tone="subdued" variant="bodySm">
                      {tpl.description}
                    </Text>
                    <Text as="span" tone="success" variant="bodySm">
                      {tpl.estimatedLift}
                    </Text>
                  </BlockStack>
                  <Button
                    disabled={!liftAssistEnabled}
                    onClick={() => {
                      // TODO Phase 5: launch template → create experiment
                    }}
                  >
                    Use template
                  </Button>
                </InlineStack>
              </Card>
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
