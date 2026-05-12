import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { prisma } from "./db.server";
import { syncConfigToMetafield, ensureMetafieldDefinition } from "./lib/experiments/config.server";
import { getShopMetadata } from "./lib/shopify/admin.server";

const APP_URL = process.env.SHOPIFY_APP_URL!;

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY!,
  apiSecretKey: process.env.SHOPIFY_API_SECRET!,
  apiVersion: ApiVersion.January25,
  scopes: ["read_products", "write_products", "read_themes", "write_themes", "read_orders", "write_discounts"],
  appUrl: APP_URL,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  webhooks: {
    ORDERS_CREATE: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    ORDERS_PAID: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    ORDERS_CANCELLED: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    ORDERS_UPDATED: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
    APP_SUBSCRIPTIONS_UPDATE: { deliveryMethod: DeliveryMethod.Http, callbackUrl: "/webhooks" },
  },
  hooks: {
    afterAuth: async ({ session, admin }) => {
      shopify.registerWebhooks({ session });

      const shop = await prisma.shop.upsert({
        where: { shopDomain: session.shop },
        create: {
          shopDomain: session.shop,
          accessToken: session.accessToken ?? "",
          scopes: session.scope ?? "",
          billingPlan: {
            create: {
              planName: "free_trial",
              trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            },
          },
        },
        update: {
          accessToken: session.accessToken ?? "",
          scopes: session.scope ?? "",
          uninstalledAt: null,
        },
        include: { billingPlan: true },
      });

      try {
        const meta = await getShopMetadata(admin);
        await prisma.shop.update({
          where: { id: shop.id },
          data: {
            myshopifyDomain: meta.myshopifyDomain,
            currency: meta.currencyCode,
            timezone: meta.ianaTimezone,
          },
        });
      } catch (err) {
        console.error("[afterAuth] Failed to fetch shop metadata:", err);
      }

      try {
        await ensureMetafieldDefinition(admin);
      } catch (err) {
        console.error("[afterAuth] Failed to ensure metafield definition:", err);
      }

      try {
        await syncConfigToMetafield(admin, shop.id);
      } catch (err) {
        console.error("[afterAuth] Failed to sync config metafield:", err);
      }
    },
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
