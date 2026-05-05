import { Card, BlockStack, Text } from "@shopify/polaris";

interface StatCardProps {
  label: string;
  value: string | number;
  tone?: "success" | "critical" | "caution" | "subdued";
}

export function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <Card>
      <BlockStack gap="100">
        <Text as="p" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <Text as="p" variant="headingXl" tone={tone}>
          {value}
        </Text>
      </BlockStack>
    </Card>
  );
}
