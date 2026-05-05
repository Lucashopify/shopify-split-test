import type { LoaderFunctionArgs } from "react-router";
import { authenticate, login } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.pathname === "/auth/login") {
    return login(request);
  }
  await authenticate.admin(request);
  return null;
};
