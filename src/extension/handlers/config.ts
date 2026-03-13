import path from "path";
import { readFileSync, readdirSync, existsSync } from "fs";
import { workspace, Uri, ExtensionMode, env as vscodeEnv } from "vscode";
import { DEFAULT_WS_BRIDGE_HOST, DEFAULT_WS_BRIDGE_PORT, WS_BRIDGE_TOKEN_KEY } from "../constants";
import {
  getApiTokenConfig,
  getApiTokenConfigSource,
} from "../providers/data/jira/jiraConfig";
import { SETTINGS_KEYS, SETTINGS_SECTION } from "../../shared/contracts";
import { buildEnvKeys, firstEnvValue } from "../../shared/app-identity";
import type { HandlerDependencies } from "./types";

type ConfigDependencies = Pick<
  HandlerDependencies,
  "context" | "storage" | "client" | "buildWatcher" | "renderTracker"
>;

export type FullConfig = {
  app: {
    id: string;
    name: string;
    version: string;
    namespace: string;
    extensionPath: string;
  };
  connection: {
    baseUrl: string;
    email: string;
    apiTokenConfigured: boolean;
    configSource: string;
    authType: string;
    hasStoredToken: boolean;
  };
  settings: Record<string, unknown>;
  dev: {
    devMode: boolean;
    extensionId: string;
    uriScheme: string;
    lastExtensionBuildAt: number | null;
    lastWebviewRenderAt: number | null;
    wsBridgeHost: string;
    wsBridgePort: number;
    wsBridgeToken?: string;
  };
  env: Record<string, string>;
  agents: {
    configDir: string;
    plansDir: string;
    plansCount: number;
    hasAppConfig: boolean;
  };
  ipc: {
    commands: string[];
    events: string[];
  };
  universal: {
    stages: Record<string, { order: number; label: string; aiRole: string; humanGate: string }>;
    automationModes: Record<string, { description: string; risk: string }>;
    platforms: Record<string, string>;
  };
  docs: {
    matrices: string[];
    runbooks: string[];
  };
  workflows: {
    cadence: Record<string, { view: string; focus: string }>;
  };
};

const listFiles = (dir: string, ext: string): string[] => {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith(ext));
  } catch {
    return [];
  }
};

const BASE_URL_ENV_KEYS = buildEnvKeys("BASE_URL", ["JIRA_URL"]);
const EMAIL_ENV_KEYS = buildEnvKeys("EMAIL", ["JIRA_USER_EMAIL"]);
const API_TOKEN_ENV_KEYS = buildEnvKeys("API_TOKEN", ["JIRA_API_TOKEN"]);
const WEBVIEW_SERVER_URL_ENV_KEYS = buildEnvKeys("WEBVIEW_SERVER_URL");
const WEBVIEW_PATH_ENV_KEYS = buildEnvKeys("WEBVIEW_PATH");
const DOCS_PATH_ENV_KEYS = buildEnvKeys("DOCS_PATH");
const WEBVIEW_PORT_ENV_KEYS = buildEnvKeys("WEBVIEW_PORT");
const WS_BRIDGE_TOKEN_ENV_KEYS = buildEnvKeys("WS_BRIDGE_TOKEN");
const WS_BRIDGE_ORIGINS_ENV_KEYS = buildEnvKeys("WS_BRIDGE_ORIGINS");
const WS_BRIDGE_HOST_ENV_KEYS = buildEnvKeys("WS_BRIDGE_HOST");
const WS_BRIDGE_PORT_ENV_KEYS = buildEnvKeys("WS_BRIDGE_PORT");

export const createConfigHandlers = ({
  context,
  storage,
  client,
  buildWatcher,
  renderTracker,
}: ConfigDependencies) => ({
  getFullConfig: async (): Promise<FullConfig> => {
    const defaults = await client.getApiTokenDefaults();
    const envApiConfig = getApiTokenConfig();
    const hasStoredToken = await client.hasStoredApiToken();
    const hasEnvToken = Boolean(envApiConfig.baseUrl && envApiConfig.email && envApiConfig.apiToken);
    const hasStoredConfig = Boolean(defaults.baseUrl && defaults.email && hasStoredToken);
    const isConfigured = hasEnvToken || hasStoredConfig;
    const configSource = isConfigured ? getApiTokenConfigSource() : "none";

    const config = workspace.getConfiguration(SETTINGS_SECTION);

    const settingsObj: Record<string, unknown> = {};
    for (const key of Object.values(SETTINGS_KEYS)) {
      const value = config.get(key);
      // Mask sensitive values
      if (key === "apiToken" && value) {
        settingsObj[key] = "********";
      } else {
        settingsObj[key] = value ?? "";
      }
    }

    // Read env vars relevant to the extension
    const envVars: Record<string, string> = {};
    const envKeys = [
      ...BASE_URL_ENV_KEYS,
      ...EMAIL_ENV_KEYS,
      ...API_TOKEN_ENV_KEYS,
      "JIRA_JQL",
      ...WEBVIEW_SERVER_URL_ENV_KEYS,
      ...WEBVIEW_PATH_ENV_KEYS,
      ...DOCS_PATH_ENV_KEYS,
      ...WEBVIEW_PORT_ENV_KEYS,
      ...WS_BRIDGE_TOKEN_ENV_KEYS,
      ...WS_BRIDGE_ORIGINS_ENV_KEYS,
      ...WS_BRIDGE_HOST_ENV_KEYS,
      ...WS_BRIDGE_PORT_ENV_KEYS,
    ];
    for (const key of envKeys) {
      const value = process.env[key];
      if (value) {
        // Mask tokens
        if (key.includes("TOKEN") || key.includes("SECRET")) {
          envVars[key] = "********";
        } else {
          envVars[key] = value;
        }
      }
    }

    // Check .claude directory
    const workspaceFolder =
      workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ??
      workspace.workspaceFolders?.[0];
    const wsRoot = workspaceFolder?.uri.fsPath ?? context.extensionPath;
    const agentsDir = path.join(wsRoot, ".claude");
    const plansDir = path.join(agentsDir, "plans");
    const docsDir = existsSync(path.join(wsRoot, "docs", "agents"))
      ? path.join(wsRoot, "docs", "agents")
      : path.join(wsRoot, "docs");
    const runbooksDir = existsSync(path.join(agentsDir, "runbooks"))
      ? path.join(agentsDir, "runbooks")
      : path.join(wsRoot, "docs", "runbooks");
    let plansCount = 0;
    try {
      if (existsSync(plansDir)) {
        plansCount = readdirSync(plansDir).filter((f: string) => f.endsWith(".md")).length;
      }
    } catch { /* ignore */ }

    const pkg = JSON.parse(
      readFileSync(path.join(context.extensionPath, "package.json"), "utf8"),
    );

    const wsBridgeToken =
      firstEnvValue(process.env, WS_BRIDGE_TOKEN_ENV_KEYS) ||
      (storage.getGlobalState<string>(WS_BRIDGE_TOKEN_KEY) ?? "").trim() ||
      undefined;

    const wsBridgeHost =
      (firstEnvValue(process.env, WS_BRIDGE_HOST_ENV_KEYS) || DEFAULT_WS_BRIDGE_HOST).trim() ||
      DEFAULT_WS_BRIDGE_HOST;
    const wsBridgePort = (() => {
      const raw = firstEnvValue(process.env, WS_BRIDGE_PORT_ENV_KEYS);
      const parsed = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
        return parsed;
      }
      return DEFAULT_WS_BRIDGE_PORT;
    })();

    return {
      app: {
        id: pkg.name || "work",
        name: pkg.displayName || "Work",
        version: pkg.version || "0.0.0",
        namespace: SETTINGS_SECTION,
        extensionPath: context.extensionPath,
      },
      connection: {
        baseUrl: envApiConfig.baseUrl || defaults.baseUrl,
        email: envApiConfig.email || defaults.email,
        apiTokenConfigured: isConfigured,
        configSource,
        authType: isConfigured ? "apiToken" : "none",
        hasStoredToken,
      },
      settings: settingsObj,
      dev: {
        devMode: context.extensionMode === ExtensionMode.Development,
        extensionId: context.extension.id,
        uriScheme: vscodeEnv.uriScheme,
        lastExtensionBuildAt: buildWatcher.getLastBuildAt(),
        lastWebviewRenderAt: renderTracker.getLastRenderedAt(),
        wsBridgeHost,
        wsBridgePort,
        wsBridgeToken,
      },
      env: envVars,
      agents: {
        configDir: ".claude",
        plansDir: ".claude/plans",
        plansCount,
        hasAppConfig: existsSync(path.join(agentsDir, "app.config.toml")),
      },
      ipc: {
        commands: ["work.route.navigate", "work.webview.refresh"],
        events: [
          "work.webview.ready",
          "work.route.changed",
          "work.ui.action",
          "work.ui.event",
        ],
      },
      universal: {
        stages: {
          plan: { order: 1, label: "Plan", aiRole: "Summarize + rank tasks", humanGate: "Confirm selection" },
          execute: { order: 2, label: "Execute", aiRole: "Draft code/tests", humanGate: "Review + edit" },
          review: { order: 3, label: "Review", aiRole: "Risk scan + checklist", humanGate: "Approve or request changes" },
          ship: { order: 4, label: "Ship", aiRole: "Release summary + notes", humanGate: "Approve publish" },
          observe: { order: 5, label: "Observe", aiRole: "Signal triage + summaries", humanGate: "Confirm action" },
        },
        automationModes: {
          assist: { description: "Drafts and suggestions only", risk: "low" },
          guided: { description: "Executes after explicit confirmation", risk: "medium" },
          auto: { description: "Executes without confirmation", risk: "high" },
        },
        platforms: {
          vscode: "VS Code webview panel",
          web: "Browser at localhost:5173 via WS bridge",
          cli: "CLI via codex/claude-code",
        },
      },
      docs: {
        matrices: listFiles(docsDir, ".md"),
        runbooks: listFiles(runbooksDir, ".md"),
      },
      workflows: {
        cadence: {
          daily: { view: "/plan", focus: "Today's tasks, blockers" },
          weekly: { view: "/plan/weekly", focus: "Sprint progress, upcoming work" },
          monthly: { view: "/plan/monthly", focus: "Milestone tracking, velocity" },
          quarterly: { view: "/plan/quarterly", focus: "OKR alignment, roadmap" },
          career: { view: "/plan/career", focus: "Growth goals, skill development" },
        },
      },
    };
  },
});
