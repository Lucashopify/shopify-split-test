import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate, useSubmit } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Button,
  Banner,
  Divider,
  Badge,
  Box,
  InlineGrid,
  Thumbnail,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { getThemes } from "../lib/shopify/admin.server";
import type { ExperimentType } from "@prisma/client";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
    include: { variants: { orderBy: [{ isControl: "desc" }, { createdAt: "asc" }] } },
  });
  if (!experiment) throw new Response("Experiment not found", { status: 404 });

  const variant = experiment.variants.find((v) => v.id === params.variantId);
  if (!variant) throw new Response("Variant not found", { status: 404 });

  // Fetch type-specific data
  let themes: Array<{ id: string; name: string; role: string }> = [];
  if (experiment.type === "THEME") {
    try {
      themes = await getThemes(admin);
    } catch (err) {
      console.error("[variant editor] Failed to fetch themes:", err);
    }
  }

  return { experiment, variant, themes };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return { error: "Shop not found" };

  const experiment = await prisma.experiment.findFirst({
    where: { id: params.id, shopId: shop.id },
  });
  if (!experiment) return { error: "Not found" };

  const variant = await prisma.variant.findFirst({
    where: { id: params.variantId, experimentId: experiment.id },
  });
  if (!variant) return { error: "Variant not found" };

  const name = String(formData.get("name") ?? variant.name).trim();
  const trafficWeight = Number(formData.get("trafficWeight") ?? variant.trafficWeight);

  // Type-specific fields
  const updates: Record<string, unknown> = { name, trafficWeight };

  if (experiment.type === "THEME") {
    updates.themeId = String(formData.get("themeId") ?? "").trim() || null;
  } else if (experiment.type === "URL_REDIRECT") {
    updates.redirectUrl = String(formData.get("redirectUrl") ?? "").trim() || null;
  } else if (experiment.type === "PRICE") {
    const adjType = String(formData.get("priceAdjType") ?? "percent");
    const adjValue = parseFloat(String(formData.get("priceAdjValue") ?? "0"));
    updates.priceAdjType = adjType;
    updates.priceAdjValue = isNaN(adjValue) ? null : adjValue;
  } else if (["SECTION", "PAGE", "TEMPLATE"].includes(experiment.type)) {
    updates.customLiquid = String(formData.get("customLiquid") ?? "").trim() || null;
  }

  await prisma.variant.update({ where: { id: variant.id }, data: updates });

  return redirect(`/app/experiments/${experiment.id}`);
};

export default function VariantEditor() {
  const { experiment, variant, themes } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const type = experiment.type as ExperimentType;
  const backUrl = `/app/experiments/${experiment.id}`;

  const [name, setName] = useState(variant.name);
  const [trafficWeight, setTrafficWeight] = useState(String(variant.trafficWeight));
  const [themeId, setThemeId] = useState(variant.themeId ?? "");
  const [redirectUrl, setRedirectUrl] = useState(variant.redirectUrl ?? "");
  const [priceAdjType, setPriceAdjType] = useState(variant.priceAdjType ?? "percent");
  const [priceAdjValue, setPriceAdjValue] = useState(
    variant.priceAdjValue != null ? String(variant.priceAdjValue) : "",
  );
  const [customLiquid, setCustomLiquid] = useState(variant.customLiquid ?? "");

  const handleSave = useCallback(() => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("trafficWeight", trafficWeight);
    if (type === "THEME") fd.set("themeId", themeId);
    if (type === "URL_REDIRECT") fd.set("redirectUrl", redirectUrl);
    if (type === "PRICE") {
      fd.set("priceAdjType", priceAdjType);
      fd.set("priceAdjValue", priceAdjValue);
    }
    if (["SECTION", "PAGE", "TEMPLATE"].includes(type)) {
      fd.set("customLiquid", customLiquid);
    }
    submit(fd, { method: "post" });
  }, [name, trafficWeight, themeId, redirectUrl, priceAdjType, priceAdjValue, customLiquid, type, submit]);

  const themeOptions = [
    { label: "— Select a theme —", value: "" },
    ...themes.map((t) => ({
      label: `${t.name}${t.role === "MAIN" ? " (Live)" : ""}`,
      value: t.id,
    })),
  ];

  return (
    <Page
      title={`Configure: ${variant.name}`}
      backAction={{ content: experiment.name, onAction: () => navigate(backUrl) }}
      primaryAction={{ content: "Save", onAction: handleSave }}
      titleMetadata={variant.isControl ? <Badge>Control</Badge> : undefined}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {/* Basic */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Variant details</Text>
                <InlineGrid columns={2} gap="400">
                  <TextField
                    label="Variant name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                  />
                  <TextField
                    label="Traffic weight (%)"
                    type="number"
                    value={trafficWeight}
                    onChange={setTrafficWeight}
                    min={1}
                    max={99}
                    autoComplete="off"
                    helpText="Weights across all variants should sum to 100."
                  />
                </InlineGrid>
              </BlockStack>
            </Card>

            {/* THEME */}
            {type === "THEME" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Theme</Text>
                  {variant.isControl ? (
                    <Banner tone="info">
                      The control variant uses your current live theme. No configuration needed.
                    </Banner>
                  ) : (
                    <>
                      <Text as="p" tone="subdued">
                        Select the unpublished theme visitors in this variant will see.
                        Duplicate your live theme first in the Shopify Theme Editor, then
                        make your changes before selecting it here.
                      </Text>
                      <Select
                        label="Variant theme"
                        options={themeOptions}
                        value={themeId}
                        onChange={setThemeId}
                      />
                      {themeId && (
                        <InlineStack gap="200" blockAlign="center">
                          <Thumbnail source={ImageIcon} size="small" alt="theme" />
                          <Text as="span" tone="subdued">
                            {themes.find((t) => t.id === themeId)?.name ?? themeId}
                          </Text>
                        </InlineStack>
                      )}
                    </>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* URL REDIRECT */}
            {type === "URL_REDIRECT" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Redirect destination</Text>
                  {variant.isControl ? (
                    <Banner tone="info">
                      The control variant keeps visitors on the original URL. No redirect needed.
                    </Banner>
                  ) : (
                    <TextField
                      label="Destination URL"
                      value={redirectUrl}
                      onChange={setRedirectUrl}
                      placeholder="https://yourstore.com/new-landing-page"
                      autoComplete="off"
                      helpText="Visitors assigned to this variant will be redirected here. Use a relative path (e.g. /pages/sale) or an absolute URL."
                    />
                  )}
                </BlockStack>
              </Card>
            )}

            {/* PRICE */}
            {type === "PRICE" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Price adjustment</Text>
                  {variant.isControl ? (
                    <Banner tone="info">
                      The control variant shows the original price. No adjustment needed.
                    </Banner>
                  ) : (
                    <InlineGrid columns={2} gap="400">
                      <Select
                        label="Adjustment type"
                        options={[
                          { label: "Percentage discount (%)", value: "percent" },
                          { label: "Fixed price ($)", value: "fixed" },
                        ]}
                        value={priceAdjType}
                        onChange={setPriceAdjType}
                      />
                      <TextField
                        label={priceAdjType === "percent" ? "Discount (%)" : "Fixed price ($)"}
                        type="number"
                        value={priceAdjValue}
                        onChange={setPriceAdjValue}
                        min={0}
                        autoComplete="off"
                        placeholder={priceAdjType === "percent" ? "e.g. 10" : "e.g. 29.99"}
                      />
                    </InlineGrid>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* SECTION / PAGE / TEMPLATE */}
            {["SECTION", "PAGE", "TEMPLATE"].includes(type) && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Custom Liquid</Text>
                  <Text as="p" tone="subdued">
                    This Liquid code is injected into the variant wrapper block placed in
                    the Theme Editor. Use the <strong>Variant Content</strong> app block
                    to position it on the page.
                  </Text>
                  <Box
                    background="bg-surface-secondary"
                    borderRadius="200"
                    padding="300"
                  >
                    <TextField
                      label="Liquid code"
                      labelHidden
                      value={customLiquid}
                      onChange={setCustomLiquid}
                      multiline={12}
                      autoComplete="off"
                      monospaced
                      placeholder={"{% if product.available %}\n  <p>In stock — ships today!</p>\n{% endif %}"}
                    />
                  </Box>
                  <Banner tone="warning">
                    Liquid is rendered server-side. Test thoroughly in a preview before starting the experiment.
                  </Banner>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
