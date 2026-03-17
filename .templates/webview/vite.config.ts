import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react-swc";
import vscodeWebviewHmr from "vite-plugin-vscode-webview-hmr";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { buildViteEnvKeys } from "../shared/app-identity";

const WS_BRIDGE_TOKEN_VITE_KEYS = buildViteEnvKeys("WS_BRIDGE_TOKEN");

const firstEnvValue = (keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
};

export default defineConfig(({ command }) => {
  const isServe = command === "serve";

  return {
    root: resolve(__dirname),
    appType: "spa",
    base: isServe ? "/" : "./",
    plugins: [
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      isServe ? vscodeWebviewHmr() : undefined,
      react(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@shared": resolve(__dirname, "..", "shared"),
      },
    },
    build: {
      outDir: "../../out/webview",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      strictPort: true,
      cors: true,
      fs: {
        allow: [resolve(__dirname, "..")],
      },
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
      hmr: {
        protocol: "ws",
        host: "localhost",
        port: 5173,
      },
      // Proxy WS bridge through Vite so VS Code webviews can reach it.
      // VS Code's portMapping proxies HTTP on 5173 but raw WS to 5174 fails;
      // routing through Vite's own port avoids the issue entirely.
      proxy: {
        "/ws-bridge": {
          target: "http://127.0.0.1:5174",
          ws: true,
          // Inject the bridge token server-side so auth works regardless of
          // whether the client (or intermediate proxies) forwarded it.
          rewrite: () => {
            const token = firstEnvValue(WS_BRIDGE_TOKEN_VITE_KEYS);
            return token ? `/?token=${token}` : "/";
          },
        },
      },
    },
  };
});
