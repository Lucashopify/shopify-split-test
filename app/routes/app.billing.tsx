import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  List,
  Divider,
  Banner,
  Box,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 99,
    visitorCap: 50_000,
    features: [
      "Up to 50k visitors / month",
      "Page & section tests",
      "A/B (2 variants)",
      "Basic analytics",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 299,
    visitorCap: 250_000,
    features: [
      "Up to 250k visitors / month",
      "All test types (theme, price, URL)",
      "A/B/n up to 4 variants",
      "Advanced stats (sequential, CUPED)",
      "Segmentation",
      "Priority support",
    ],
    recommended: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 699,
    visitorCap: 1_000_000,
    features: [
      "Up to 1M visitors / month",
      "Everything in Growth",
      "Lift Assist AI add-on included",
      "Mutual exclusion groups",
      "SLA + dedicated Slack channel",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: null,
    visitorCap: null,
    features: [
      "Unlimited visitors",
      "Everything in Scale",
      "Custom contract",
      "Portfolio reporting (multi-store)",
      "Custom integrations",
    ],
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { billingPlan: true },
  });

  return {
    currentPlan: shop?.billingPlan?.planName ?? "free_trial",
    trialEndsAt: shop?.billingPlan?.trialEndsAt ?? null,
    liftAssistEnabled: shop?.billingPlan?.liftAssistEnabled ?? false,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const planId = formData.get("planId") as string;

  // TODO Phase 6: integrate Shopify Billing API usage-based subscriptions
  // For now redirect back with a flash message
  return redirect("/app/billing");
};

export default function Billing() {
  const { currentPlan, trialEndsAt, liftAssistEnabled } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const nav = useNavigation();

  const trialDaysLeft = trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <Page title="Billing" subtitle="Shopify usage-based billing — pay for what you use">
      <Layout>
        {currentPlan === "free_trial" && (
          <Layout.Section>
            <Banner
              title={`You're on a free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`}
              tone="info"
            >
              <Text as="p">
                Choose a plan before your trial ends to keep your experiments
                running.
              </Text>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" align="start" wrap>
            {PLANS.map((plan) => (
              <Box
                key={plan.id}
                minWidth="260px"
                maxWidth="300px"
              >
                <Card>
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                      <Text as="h2" variant="headingMd">
                        {plan.name}
                      </Text>
                      {plan.recommended && (
                        <Badge tone="success">Recommended</Badge>
                      )}
                      {currentPlan === plan.id && (
                        <Badge tone="info">Current</Badge>
                      )}
                    </InlineStack>

                    <Text as="p" variant="headingXl">
                      {plan.price != null ? `$${plan.price}` : "Custom"}
                      {plan.price != null && (
                        <Text as="span" tone="subdued" variant="bodyMd">
                          {" "}
                          / mo
                        </Text>
                      )}
                    </Text>

                    {plan.visitorCap && (
                      <Text as="p" tone="subdued" variant="bodySm">
                        {plan.visitorCap.toLocaleString()} visitors / month
                      </Text>
                    )}

                    <Divider />

                    <List type="bullet">
                      {plan.features.map((f) => (
                        <List.Item key={f}>{f}</List.Item>
                      ))}
                    </List>

                    <Button
                      variant={plan.recommended ? "primary" : "secondary"}
                      disabled={currentPlan === plan.id}
                      loading={nav.state === "submitting"}
                      onClick={() =>
                        submit(
                          { planId: plan.id },
                          { method: "post" },
                        )
                      }
                    >
                      {plan.price == null
                        ? "Contact sales"
                        : currentPlan === plan.id
                        ? "Current plan"
                        : "Select plan"}
                    </Button>
                  </BlockStack>
                </Card>
              </Box>
            ))}
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Billing notes
              </Text>
              <List type="bullet">
                <List.Item>
                  Billed via Shopify Billing API — charges appear on your
                  Shopify invoice.
                </List.Item>
                <List.Item>
                  Metered by unique visitors tracked per calendar month.
                </List.Item>
                <List.Item>
                  A 3-day grace period applies when a tier cap is exceeded
                  before the app pauses new enrollments.
                </List.Item>
                <List.Item>
                  Lift Assist is available as a paid add-on on Growth and above.
                </List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
