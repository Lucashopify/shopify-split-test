import { createCookieSessionStorage } from "react-router";

const stateStorage = createCookieSessionStorage({
  cookie: {
    name: "__oauth_state",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes — enough to complete the OAuth flow
    secrets: [process.env.SHOPIFY_API_SECRET ?? "fallback-secret"],
  },
});

export async function createOAuthState(
  request: Request,
): Promise<{ state: string; setCookie: string }> {
  const session = await stateStorage.getSession(request.headers.get("Cookie"));
  const state = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  session.set("state", state);
  const setCookie = await stateStorage.commitSession(session);
  return { state, setCookie };
}

export async function validateOAuthState(
  request: Request,
  receivedState: string,
): Promise<boolean> {
  const session = await stateStorage.getSession(request.headers.get("Cookie"));
  const storedState = session.get("state");
  return typeof storedState === "string" && storedState.length > 0 && storedState === receivedState;
}

export async function clearOAuthState(request: Request): Promise<string> {
  const session = await stateStorage.getSession(request.headers.get("Cookie"));
  return stateStorage.destroySession(session);
}
