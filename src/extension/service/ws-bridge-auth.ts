import { randomBytes } from "crypto";
import type { StorageService } from "./storage-service";
import { WS_BRIDGE_TOKEN_KEY } from "../constants";
import { buildEnvKeys } from "../../shared/app-identity";

const WS_BRIDGE_TOKEN_ENV_KEYS = buildEnvKeys("WS_BRIDGE_TOKEN");

/**
 * WS bridge auth is intended for local/dev use (browser -> extension host).
 * We support:
 * - env override (`WORK_WS_BRIDGE_TOKEN`, legacy `ATLASSIAN_WS_BRIDGE_TOKEN`)
 * - persisted token in global state (for easy reuse)
 * - auto-generated token if neither exist
 */
export const getOrCreateWsBridgeToken = (storage: StorageService): string => {
  const envToken = WS_BRIDGE_TOKEN_ENV_KEYS
    .map((key) => (process.env[key] ?? "").trim())
    .find(Boolean) ?? "";
  const storedToken = (storage.getGlobalState<string>(WS_BRIDGE_TOKEN_KEY) ?? "").trim();

  let token = envToken || storedToken;
  if (!token) {
    token = randomBytes(24).toString("base64url");
    void storage.setGlobalState(WS_BRIDGE_TOKEN_KEY, token);
    return token;
  }

  if (envToken && envToken !== storedToken) {
    void storage.setGlobalState(WS_BRIDGE_TOKEN_KEY, token);
  }

  return token;
};
