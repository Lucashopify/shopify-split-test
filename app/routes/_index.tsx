import { redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, Form } from "react-router";
import { login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const shop = url.searchParams.get("shop");
  if (shop) {
    // Shopify app launch — let the embedded app route handle auth/token exchange
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  return login(request);
};

export default function Index() {
  const data = useLoaderData<{ shop?: string }>();
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Split Tester</h1>
      <p>Enter your Shopify store domain to continue.</p>
      <Form method="post">
        <input
          type="text"
          name="shop"
          placeholder="your-store.myshopify.com"
          style={{ padding: "0.5rem", marginRight: "0.5rem", width: "280px" }}
        />
        <button type="submit" style={{ padding: "0.5rem 1rem" }}>
          Open app
        </button>
      </Form>
      {data?.shop === "MISSING_SHOP" && <p style={{ color: "red" }}>Please enter a shop domain.</p>}
      {data?.shop === "INVALID_SHOP" && <p style={{ color: "red" }}>Invalid shop domain.</p>}
    </div>
  );
}
