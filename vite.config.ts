import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Load .env so SHOPIFY_APP_URL etc. are available when running `npx react-router dev`
const env = loadEnv("development", process.cwd(), "");
Object.assign(process.env, env);

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost").hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 24678,
    clientPort: 24678,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: host === "localhost" ? ["localhost"] : true,
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      allow: ["app", "node_modules"],
    },
  },
  plugins: [reactRouter(), tsconfigPaths()],
  build: {
    assetsInlineLimit: 0,
  },
  ssr: {
    external: ["bullmq", "ioredis"],
  },
});
