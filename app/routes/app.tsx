import { type LoaderFunctionArgs } from "react-router";
import { Link, Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import type { LinksFunction } from "react-router";
import { authenticate } from "../shopify.server";

function RouterLink({ url, children, ...rest }: { url: string; children?: React.ReactNode; [key: string]: unknown }) {
  return <Link to={url} {...(rest as any)}>{children}</Link>;
}

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "", shop: session.shop };
};

export default function App() {
  const { apiKey, shop } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={enTranslations} linkComponent={RouterLink}>
        <s-app-nav>
          <s-link href="/app">Dashboard</s-link>
          <s-link href="/app/experiments">Experiments</s-link>
          <s-link href="/app/results">Results</s-link>
          <s-link href="/app/lift-assist">Lift Assist</s-link>
          <s-link href="/app/segments">Segments</s-link>
          <s-link href="/app/settings">Settings</s-link>
          <s-link href="/app/billing">Billing</s-link>
        </s-app-nav>
        <Outlet />
      </PolarisProvider>
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs: Parameters<typeof boundary.headers>[0]) => {
  return boundary.headers(headersArgs);
};
