import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, useSubmit, useNavigation, useNavigate } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  TextField,
  FormLayout,
  Divider,
  Badge,
  Banner,
} from "@shopify/polaris";
import { useState } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const shopData = await admin.graphql(`
    query GetShop {
      shop {
        name
        myshopifyDomain
        primaryDomain { url }
        plan { displayName }
        currencyCode
        ianaTimezone
      }
    }
  `);

  const { data } = await shopData.json();

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    include: { billingPlan: true },
  });

  return {
    shopName: data.shop.name,
    shopDomain: session.shop,
    primaryDomain: data.shop.primaryDomain?.url,
    planName: data.shop.plan?.displayName,
    currency: data.shop.currencyCode,
    timezone: data.shop.ianaTimezone,
    appPlan: shop?.billingPlan?.planName ?? "free_trial",
    trialEndsAt: shop?.billingPlan?.trialEndsAt ?? null,
  };
};

export default function Settings() {
  const {
    shopName,
    shopDomain,
    primaryDomain,
    planName,
    currency,
    timezone,
    appPlan,
    trialEndsAt,
  } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const trialDaysLeft = trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0;

  return (
    <Page title="Settings">
      <Layout>
        {appPlan === "free_trial" && trialDaysLeft > 0 && (
          <Layout.Section>
            <Banner
              title={`Free trial — ${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining`}
              action={{ content: "Choose a plan", onAction: () => navigate("/app/billing") }}
              tone="info"
            />
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Store information
              </Text>
              <FormLayout>
                <FormLayout.Group>
                  <TextField
                    label="Shop name"
                    value={shopName}
                    autoComplete="off"
                    readOnly
                  />
                  <TextField
                    label="Shopify domain"
                    value={shopDomain}
                    autoComplete="off"
                    readOnly
                  />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField
                    label="Primary domain"
                    value={primaryDomain ?? ""}
                    autoComplete="off"
                    readOnly
                  />
                  <TextField
                    label="Shopify plan"
                    value={planName ?? ""}
                    autoComplete="off"
                    readOnly
                  />
                </FormLayout.Group>
                <FormLayout.Group>
                  <TextField
                    label="Currency"
                    value={currency ?? ""}
                    autoComplete="off"
                    readOnly
                  />
                  <TextField
                    label="Timezone"
                    value={timezone ?? ""}
                    autoComplete="off"
                    readOnly
                  />
                </FormLayout.Group>
              </FormLayout>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Cookie &amp; consent
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Visitor assignment uses a first-party <code>SameSite=Lax</code>{" "}
                cookie signed with your app's secret. Tracking events are
                suppressed until the visitor accepts cookies via Shopify's
                Customer Privacy API. No PII is stored in the cookie.
              </Text>
              <InlineStack gap="200">
                <Badge tone="success">GDPR compliant</Badge>
                <Badge tone="success">CCPA compliant</Badge>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Webhooks
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Registered automatically on install:{" "}
                <code>orders/create</code>, <code>orders/paid</code>,{" "}
                <code>orders/cancelled</code>, <code>themes/*</code>,{" "}
                <code>products/update</code>, and GDPR mandatory webhooks.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
