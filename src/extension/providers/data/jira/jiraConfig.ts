import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { MASKED_SECRET } from "../../../constants";
import {
  SETTINGS_KEYS,
  SETTINGS_SECTION,
  type ConfigSource,
} from "../../../../shared/contracts";
import { buildEnvKeys } from "../../../../shared/app-identity";

export interface ApiTokenConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  jql: string;
}


// Prefer extension-scoped `<APP_ENV_PREFIX>_*` vars; keep Jira aliases for compatibility.
const BASE_URL_KEYS = buildEnvKeys("BASE_URL", ["JIRA_URL"]);
const EMAIL_KEYS = buildEnvKeys("EMAIL", ["JIRA_USER_EMAIL"]);
const TOKEN_KEYS = buildEnvKeys("API_TOKEN", ["JIRA_API_TOKEN"]);
const WEBVIEW_SERVER_URL_KEYS = buildEnvKeys("WEBVIEW_SERVER_URL");
const WEBVIEW_PATH_KEYS = buildEnvKeys("WEBVIEW_PATH");
const DOCS_PATH_KEYS = buildEnvKeys("DOCS_PATH");

const isMaskedSecret = (value: string) => value.trim() === MASKED_SECRET;
const stripMaskedSecret = (value: string) => (isMaskedSecret(value) ? "" : value);

export function getWebviewServerUrl(): string {
  const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const env = getEnvMap();
  const fromConfig = resolveEnvPlaceholders(
    String(config.get(SETTINGS_KEYS.WEBVIEW_SERVER_URL) || ""),
    env,
  );
  const fromEnv = pickFirst(env, WEBVIEW_SERVER_URL_KEYS);
  return (fromConfig || fromEnv).trim();
}

export function getWebviewPath(): string {
  const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const env = getEnvMap();
  const fromConfig = resolveEnvPlaceholders(
    String(config.get(SETTINGS_KEYS.WEBVIEW_PATH) || ""),
    env,
  );
  const fromEnv = pickFirst(env, WEBVIEW_PATH_KEYS);
  return (fromConfig || fromEnv).trim();
}

export function getDocsPath(): string {
  const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const env = getEnvMap();
  const fromConfig = resolveEnvPlaceholders(
    String(config.get(SETTINGS_KEYS.DOCS_PATH) || ""),
    env,
  );
  const fromEnv = pickFirst(env, DOCS_PATH_KEYS);
  return (fromConfig || fromEnv).trim();
}

export function getApiTokenConfig(): ApiTokenConfig {
  const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const env = getEnvMap();

  const baseUrl =
    pickFirst(env, BASE_URL_KEYS) ||
    resolveEnvPlaceholders(
      String(
        config.get(SETTINGS_KEYS.BASE_URL) || config.get(SETTINGS_KEYS.JIRA_URL) || "",
      ),
      env,
    );
  const email =
    pickFirst(env, EMAIL_KEYS) ||
    resolveEnvPlaceholders(String(config.get(SETTINGS_KEYS.EMAIL) || ""), env);
  const apiToken = stripMaskedSecret(
    pickFirst(env, TOKEN_KEYS) ||
      resolveEnvPlaceholders(String(config.get(SETTINGS_KEYS.API_TOKEN) || ""), env),
  );
  const jql =
    getEnvValue(env, "JIRA_JQL") ||
    resolveEnvPlaceholders(String(config.get(SETTINGS_KEYS.JQL) || ""), env);

  return {
    baseUrl: baseUrl.trim(),
    email: email.trim(),
    apiToken: apiToken.trim(),
    jql: jql.trim(),
  };
}

export function getApiTokenConfigSource(): ConfigSource {
  const config = vscode.workspace.getConfiguration(SETTINGS_SECTION);
  const folders = vscode.workspace.workspaceFolders ?? [];
  const envMap = getEnvMap();

  const values: ApiTokenConfig = {
    baseUrl: "",
    email: "",
    apiToken: "",
    jql: "",
  };
  const sources: Record<keyof Omit<ApiTokenConfig, "jql">, ConfigSource> = {
    baseUrl: "none",
    email: "none",
    apiToken: "none",
  };

  const applyEnv = (env: Record<string, string>, source: ConfigSource) => {
    const baseUrl = pickFirst(env, BASE_URL_KEYS);
    if (baseUrl) {
      values.baseUrl = baseUrl;
      sources.baseUrl = source;
    }
    const email = pickFirst(env, EMAIL_KEYS);
    if (email) {
      values.email = email;
      sources.email = source;
    }
    const apiToken = pickFirst(env, TOKEN_KEYS);
    if (apiToken) {
      values.apiToken = apiToken;
      sources.apiToken = source;
    }
  };

  for (const folder of folders) {
    const envPath = path.join(folder.uri.fsPath, ".env");
    const envLocalPath = path.join(folder.uri.fsPath, ".env.local");
    applyEnv(parseEnvFile(envPath), "env");
    applyEnv(parseEnvFile(envLocalPath), "env.local");
  }

  const processEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      processEnv[key] = value;
    }
  }
  applyEnv(processEnv, "process.env");

  if (!values.baseUrl) {
    const fromConfig = resolveEnvPlaceholders(
      String(
        config.get(SETTINGS_KEYS.BASE_URL) || config.get(SETTINGS_KEYS.JIRA_URL) || "",
      ),
      envMap,
    ).trim();
    if (fromConfig) {
      values.baseUrl = fromConfig;
      sources.baseUrl = "settings";
    }
  }
  if (!values.email) {
    const fromConfig = resolveEnvPlaceholders(
      String(config.get(SETTINGS_KEYS.EMAIL) || ""),
      envMap,
    ).trim();
    if (fromConfig) {
      values.email = fromConfig;
      sources.email = "settings";
    }
  }
  if (!values.apiToken) {
    const fromConfigRaw = resolveEnvPlaceholders(
      String(config.get(SETTINGS_KEYS.API_TOKEN) || ""),
      envMap,
    ).trim();
    if (fromConfigRaw) {
      values.apiToken = isMaskedSecret(fromConfigRaw) ? MASKED_SECRET : fromConfigRaw;
      sources.apiToken = "settings";
    }
  }

  if (!values.baseUrl || !values.email || !values.apiToken) {
    return "none";
  }

  const uniqueSources = new Set<ConfigSource>([
    sources.baseUrl,
    sources.email,
    sources.apiToken,
  ]);
  if (uniqueSources.size === 1) {
    return uniqueSources.values().next().value ?? "none";
  }

  return "mixed";
}

function resolveEnvPlaceholders(value: string | undefined, env: Record<string, string>): string {
  if (!value) {
    return "";
  }

  return value.replace(/\$\{env:([^}]+)\}/g, (_match, name) => env[name] ?? "");
}

function getEnvValue(env: Record<string, string>, key: string): string {
  return env[key] ?? "";
}

function pickFirst(env: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = env[key];
    if (value) {
      return value;
    }
  }
  return "";
}

function getEnvMap(): Record<string, string> {
  const merged: Record<string, string> = {};
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const envPath = path.join(folder.uri.fsPath, ".env");
    const envLocalPath = path.join(folder.uri.fsPath, ".env.local");
    Object.assign(merged, parseEnvFile(envPath));
    Object.assign(merged, parseEnvFile(envLocalPath));
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      merged[key] = value;
    }
  }

  return merged;
}

export function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const contents = fs.readFileSync(filePath, "utf8");
  const result: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1];
    let value = match[2] ?? "";

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}
