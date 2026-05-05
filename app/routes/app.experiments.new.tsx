import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "react-router";
import { useActionData, useLoaderData, useNavigate, useSubmit } from "react-router";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  TextField,
  Select,
  Banner,
  InlineGrid,
  RangeSlider,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { getThemes } from "../lib/shopify/admin.server";
import type { ExperimentType } from "@prisma/client";

const EXPERIMENT_TYPES = [
  { label: "Theme test — compare two full themes", value: "THEME" },
  { label: "Section / Content test — swap page sections", value: "SECTION" },
  { label: "Price test — compare product prices", value: "PRICE" },
  { label: "URL redirect — route traffic to different pages", value: "URL_REDIRECT" },
  { label: "Page template test", value: "TEMPLATE" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  let themes: Array<{ id: string; name: string; role: string }> = [];
  try {
    themes = await getThemes(admin);
  } catch (err) {
    console.error("[new experiment] Failed to fetch themes:", err);
  }
  return { themes };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const name = String(formData.get("name") ?? "").trim();
  const hypothesis = String(formData.get("hypothesis") ?? "").trim();
  const type = String(formData.get("type") ?? "") as ExperimentType;
  const trafficAllocation = Number(formData.get("trafficAllocation") ?? 100);
  const controlName = String(formData.get("controlName") ?? "Control").trim();
  const variantName = String(formData.get("variantName") ?? "Variant B").trim();

  if (!name) return { error: "Experiment name is required." };
  if (!type) return { error: "Experiment type is required." };

  const shop = await prisma.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) return { error: "Shop not found. Try reinstalling the app." };

  // Type-specific variant B fields
  const variantBData: Record<string, unknown> = {
    name: variantName,
    isControl: false,
    trafficWeight: 50,
  };

  if (type === "THEME") {
    const themeId = String(formData.get("variantThemeId") ?? "").trim();
    if (themeId) variantBData.themeId = themeId;
  } else if (type === "URL_REDIRECT") {
    const redirectUrl = String(formData.get("variantRedirectUrl") ?? "").trim();
    if (redirectUrl) variantBData.redirectUrl = redirectUrl;
  } else if (type === "PRICE") {
    variantBData.priceAdjType = String(formData.get("variantPriceAdjType") ?? "percent");
    const adjValue = parseFloat(String(formData.get("variantPriceAdjValue") ?? ""));
    if (!isNaN(adjValue)) variantBData.priceAdjValue = adjValue;
  } else if (["SECTION", "PAGE", "TEMPLATE"].includes(type)) {
    const liquid = String(formData.get("variantCustomLiquid") ?? "").trim();
    if (liquid) variantBData.customLiquid = liquid;
  }

  const experiment = await prisma.experiment.create({
    data: {
      shopId: shop.id,
      name,
      hypothesis: hypothesis || null,
      type,
      trafficAllocation,
      variants: {
        create: [
          { name: controlName, isControl: true, trafficWeight: 50 },
          variantBData as any,
        ],
      },
    },
  });

  return redirect(`/app/experiments/${experiment.id}`);
};

export default function NewExperiment() {
  const { themes } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [type, setType] = useState<string>("THEME");
  const [trafficAllocation, setTrafficAllocation] = useState<number>(100);
  const [controlName, setControlName] = useState("Control");
  const [variantName, setVariantName] = useState("Variant B");

  // Type-specific state
  const [variantThemeId, setVariantThemeId] = useState("");
  const [variantRedirectUrl, setVariantRedirectUrl] = useState("");
  const [variantPriceAdjType, setVariantPriceAdjType] = useState("percent");
  const [variantPriceAdjValue, setVariantPriceAdjValue] = useState("");
  const [variantCustomLiquid, setVariantCustomLiquid] = useState("");

  const themeOptions = [
    { label: "— Select a theme —", value: "" },
    ...themes.map((t) => ({
      label: `${t.name}${t.role === "MAIN" ? " (Live)" : ""}`,
      value: t.id,
    })),
  ];

  const handleSubmit = useCallback(() => {
    const fd = new FormData();
    fd.set("name", name);
    fd.set("hypothesis", hypothesis);
    fd.set("type", type);
    fd.set("trafficAllocation", String(trafficAllocation));
    fd.set("controlName", controlName);
    fd.set("variantName", variantName);
    if (type === "THEME") fd.set("variantThemeId", variantThemeId);
    if (type === "URL_REDIRECT") fd.set("variantRedirectUrl", variantRedirectUrl);
    if (type === "PRICE") {
      fd.set("variantPriceAdjType", variantPriceAdjType);
      fd.set("variantPriceAdjValue", variantPriceAdjValue);
    }
    if (["SECTION", "PAGE", "TEMPLATE"].includes(type)) {
      fd.set("variantCustomLiquid", variantCustomLiquid);
    }
    submit(fd, { method: "post" });
  }, [name, hypothesis, type, trafficAllocation, controlName, variantName,
      variantThemeId, variantRedirectUrl, variantPriceAdjType, variantPriceAdjValue,
      variantCustomLiquid, submit]);

  return (
    <Page
      title="New experiment"
      backAction={{ content: "Experiments", onAction: () => navigate("/app/experiments") }}
      primaryAction={{
        content: "Create experiment",
        onAction: handleSubmit,
        disabled: !name,
      }}
    >
      <Layout>
        {actionData?.error && (
          <Layout.Section>
            <Banner tone="critical">{actionData.error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="500">
            {/* Basic info */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Details</Text>
                <TextField
                  label="Experiment name"
                  value={name}
                  onChange={setName}
                  placeholder="e.g. Homepage hero — summer sale"
                  autoComplete="off"
                />
                <TextField
                  label="Hypothesis"
                  value={hypothesis}
                  onChange={setHypothesis}
                  placeholder="e.g. Showing a discount badge will increase add-to-cart rate"
                  multiline={3}
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            {/* Type */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Test type</Text>
                <Select
                  label="What are you testing?"
                  options={EXPERIMENT_TYPES}
                  value={type}
                  onChange={setType}
                />
              </BlockStack>
            </Card>

            {/* Variants */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Variants</Text>
                <InlineGrid columns={2} gap="400">
                  <TextField
                    label="Control name"
                    value={controlName}
                    onChange={setControlName}
                    autoComplete="off"
                  />
                  <TextField
                    label="Variant name"
                    value={variantName}
                    onChange={setVariantName}
                    autoComplete="off"
                  />
                </InlineGrid>

                {/* THEME */}
                {type === "THEME" && (
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      The control uses your live theme. Select the theme to test for {variantName || "Variant B"}.
                    </Text>
                    <Select
                      label={`${variantName || "Variant B"} theme`}
                      options={themeOptions}
                      value={variantThemeId}
                      onChange={setVariantThemeId}
                    />
                  </BlockStack>
                )}

                {/* URL REDIRECT */}
                {type === "URL_REDIRECT" && (
                  <TextField
                    label={`${variantName || "Variant B"} destination URL`}
                    value={variantRedirectUrl}
                    onChange={setVariantRedirectUrl}
                    placeholder="https://yourstore.com/new-landing-page"
                    autoComplete="off"
                    helpText="Visitors in this variant are redirected here. Use a relative path or absolute URL."
                  />
                )}

                {/* PRICE */}
                {type === "PRICE" && (
                  <InlineGrid columns={2} gap="400">
                    <Select
                      label="Adjustment type"
                      options={[
                        { label: "Percentage discount (%)", value: "percent" },
                        { label: "Fixed price ($)", value: "fixed" },
                      ]}
                      value={variantPriceAdjType}
                      onChange={setVariantPriceAdjType}
                    />
                    <TextField
                      label={variantPriceAdjType === "percent" ? "Discount (%)" : "Fixed price ($)"}
                      type="number"
                      value={variantPriceAdjValue}
                      onChange={setVariantPriceAdjValue}
                      min={0}
                      autoComplete="off"
                      placeholder={variantPriceAdjType === "percent" ? "e.g. 10" : "e.g. 29.99"}
                    />
                  </InlineGrid>
                )}

                {/* SECTION / PAGE / TEMPLATE */}
                {["SECTION", "PAGE", "TEMPLATE"].includes(type) && (
                  <TextField
                    label={`${variantName || "Variant B"} Liquid code`}
                    value={variantCustomLiquid}
                    onChange={setVariantCustomLiquid}
                    multiline={8}
                    autoComplete="off"
                    monospaced
                    placeholder={"{% if product.available %}\n  <p>In stock — ships today!</p>\n{% endif %}"}
                    helpText="This Liquid is injected via the Variant Content app block in the Theme Editor."
                  />
                )}
              </BlockStack>
            </Card>

            {/* Traffic */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Traffic allocation</Text>
                <Text as="p" tone="subdued">
                  Percentage of your visitors included in this experiment. The rest see the default experience.
                </Text>
                <RangeSlider
                  label={`${trafficAllocation}% of traffic`}
                  value={trafficAllocation}
                  min={5}
                  max={100}
                  step={5}
                  onChange={(v) => setTrafficAllocation(v as number)}
                  output
                />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
