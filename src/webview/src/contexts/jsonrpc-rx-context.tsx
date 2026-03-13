import { JsonrpcClient, MessageReceiver, MessageSender } from "@jsonrpc-rx/client";
import { createContext } from "react";
import { getRpcPayload, wrapRpcMessage } from "../ipc";
import { buildViteEnvKeys } from "@shared/app-identity";

type VsCodeApi = {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => unknown;
};

const isBrowser = typeof window !== "undefined";
export const isWebview = isBrowser && typeof (window as any).acquireVsCodeApi === "function";

const DEFAULT_WS_BRIDGE_URL = "ws://localhost:5173/ws-bridge";
const WS_BRIDGE_TOKEN_PARAM = "wsToken";
const WS_BRIDGE_TOKEN_STORAGE_KEY = "work.wsBridgeToken";
const WS_BRIDGE_TOKEN_VITE_KEYS = buildViteEnvKeys("WS_BRIDGE_TOKEN");
const WS_BRIDGE_URL_VITE_KEYS = buildViteEnvKeys("WS_BRIDGE_URL");

let bridgeReady = false;

const fallbackApi: VsCodeApi = {
  postMessage: (message: unknown) => console.debug("[webview] postMessage", message),
  getState: () => undefined,
  setState: (state: unknown) => state,
};

const firstViteEnvValue = (keys: readonly string[]): string | undefined => {
  const env = (import.meta as any)?.env ?? {};
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
};

const readWsBridgeToken = (): string | undefined => {
  // 1) Prefer build-time env (useful for CI/dev scripts).
  const envToken = firstViteEnvValue(WS_BRIDGE_TOKEN_VITE_KEYS);
  if (envToken) {
    return envToken;
  }

  // 2) Allow setting the token once via URL query: http://localhost:5173/?wsToken=...
  // This is outside the hash router, so it won't interfere with TanStack's hash history.
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get(WS_BRIDGE_TOKEN_PARAM);
    if (fromUrl && fromUrl.trim()) {
      const trimmed = fromUrl.trim();
      localStorage.setItem(WS_BRIDGE_TOKEN_STORAGE_KEY, trimmed);
      url.searchParams.delete(WS_BRIDGE_TOKEN_PARAM);
      window.history.replaceState(null, "", url.toString());
      return trimmed;
    }
  } catch {
    // ignore
  }

  // 3) Fall back to persisted localStorage.
  try {
    const stored = localStorage.getItem(WS_BRIDGE_TOKEN_STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : undefined;
  } catch {
    return undefined;
  }
};

const readWsBridgeUrl = (): string => {
  const fromEnv = firstViteEnvValue(WS_BRIDGE_URL_VITE_KEYS);
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_WS_BRIDGE_URL;
};

const buildWsBridgeUrl = (): string => {
  const base = readWsBridgeUrl();
  const token = readWsBridgeToken();
  if (!token) {
    return base;
  }
  const url = new URL(base);
  url.searchParams.set("token", token);
  return url.toString();
};

const createWsBridge = (): VsCodeApi | null => {
  try {
    const pending: string[] = [];
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      try {
        ws = new WebSocket(buildWsBridgeUrl());
      } catch {
        ws = null;
        reconnectTimer = window.setTimeout(connect, 2000);
        return;
      }

      ws.onopen = () => {
        bridgeReady = true;
        for (const msg of pending.splice(0)) {
          ws?.send(msg);
        }
        window.dispatchEvent(new CustomEvent("ws-bridge-connected"));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        window.dispatchEvent(new MessageEvent("message", { data }));
      };

      ws.onclose = (event) => {
        bridgeReady = false;
        ws = null;
        if (event.code === 1008) {
          window.dispatchEvent(new CustomEvent("ws-bridge-auth-failed"));
          return;
        }
        reconnectTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();

    return {
      postMessage: (message: unknown) => {
        const serialized = JSON.stringify(message);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(serialized);
        } else {
          pending.push(serialized);
        }
      },
      getState: () => {
        try { return JSON.parse(localStorage.getItem("vscode-state") ?? "null"); }
        catch { return undefined; }
      },
      setState: (state: unknown) => {
        localStorage.setItem("vscode-state", JSON.stringify(state));
        return state;
      },
    };
  } catch {
    return null;
  }
};

let wsApi: VsCodeApi | null = null;

export const getVsCodeApi = (): VsCodeApi => {
  // Unified transport: always prefer WS bridge when a bridge URL is available.
  // This works identically in VS Code webview and browser — single codepath.
  if (!wsApi) {
    wsApi = createWsBridge();
  }
  if (wsApi) return wsApi;

  // Fallback to VS Code postMessage API (only if WS bridge creation failed)
  if (isWebview) {
    const existing = (window as any).__vscodeApi as VsCodeApi | undefined;
    if (existing) return existing;
    const api = (window as any).acquireVsCodeApi() as VsCodeApi;
    (window as any).__vscodeApi = api;
    return api;
  }
  return fallbackApi;
};

export const isBridgeConnected = () => bridgeReady;

const noopSender: MessageSender = () => undefined;
const noopReceiver: MessageReceiver = () => undefined;

const createBrowserClient = () => {
  const vscodeApi = getVsCodeApi();
  const msgSender: MessageSender = (message) => {
    const payload = typeof message === "string" ? message : JSON.stringify(message);
    vscodeApi.postMessage(wrapRpcMessage(payload));
  };
  const msgReceiver: MessageReceiver = (handler) =>
    window.addEventListener("message", (event) => {
      const payload = getRpcPayload(event.data);
      if (payload) {
        handler(payload);
      }
    });
  return new JsonrpcClient(msgSender, msgReceiver);
};

let browserClient: JsonrpcClient | null = null;
const getJsonrpcClient = () => {
  if (!isBrowser) {
    return new JsonrpcClient(noopSender, noopReceiver);
  }
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
};

export const JsonrpcClientContext = createContext<JsonrpcClient>(getJsonrpcClient());

export const JsonrpcClientContextProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <JsonrpcClientContext.Provider value={getJsonrpcClient()}>
      {children}
    </JsonrpcClientContext.Provider>
  );
};
