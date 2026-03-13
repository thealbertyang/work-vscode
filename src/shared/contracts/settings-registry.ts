import { SETTINGS_KEYS, SETTINGS_SECTION, settingKey, type SettingKey } from "./settings";
import { buildEnvKeys } from "../app-identity";

export type SettingValueType = "string" | "number" | "boolean" | "object" | "array";

export type SettingsRegistryItem = {
  id: string;
  key: SettingKey;
  type: SettingValueType;
  defaultValue?: unknown;
  description?: string;
  sensitive?: boolean;
  envKeys?: string[];
};

const fullKey = (key: SettingKey): string => settingKey(key);

export const SETTINGS_REGISTRY: Record<SettingKey, SettingsRegistryItem> = {
  [SETTINGS_KEYS.BASE_URL]: {
    id: fullKey(SETTINGS_KEYS.BASE_URL),
    key: SETTINGS_KEYS.BASE_URL,
    type: "string",
    defaultValue: "",
    description: "Jira base URL (e.g. https://your-domain.work.net).",
    envKeys: buildEnvKeys("BASE_URL", ["JIRA_URL"]),
  },
  [SETTINGS_KEYS.JIRA_URL]: {
    id: fullKey(SETTINGS_KEYS.JIRA_URL),
    key: SETTINGS_KEYS.JIRA_URL,
    type: "string",
    defaultValue: "",
    description: "Legacy Jira URL setting (prefer work.baseUrl).",
    envKeys: ["JIRA_URL", ...buildEnvKeys("BASE_URL")],
  },
  [SETTINGS_KEYS.EMAIL]: {
    id: fullKey(SETTINGS_KEYS.EMAIL),
    key: SETTINGS_KEYS.EMAIL,
    type: "string",
    defaultValue: "",
    description: "Atlassian account email.",
    envKeys: buildEnvKeys("EMAIL", ["JIRA_USER_EMAIL"]),
  },
  [SETTINGS_KEYS.API_TOKEN]: {
    id: fullKey(SETTINGS_KEYS.API_TOKEN),
    key: SETTINGS_KEYS.API_TOKEN,
    type: "string",
    defaultValue: "",
    description: "Atlassian API token (prefer .env.local or secrets).",
    sensitive: true,
    envKeys: buildEnvKeys("API_TOKEN", ["JIRA_API_TOKEN"]),
  },
  [SETTINGS_KEYS.JQL]: {
    id: fullKey(SETTINGS_KEYS.JQL),
    key: SETTINGS_KEYS.JQL,
    type: "string",
    defaultValue: "assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC",
    description: "JQL used to load sprint issues.",
    envKeys: ["JIRA_JQL"],
  },
  [SETTINGS_KEYS.MAX_RESULTS]: {
    id: fullKey(SETTINGS_KEYS.MAX_RESULTS),
    key: SETTINGS_KEYS.MAX_RESULTS,
    type: "number",
    defaultValue: 50,
    description: "Maximum number of issues to fetch per refresh.",
  },
  [SETTINGS_KEYS.DOCS_PATH]: {
    id: fullKey(SETTINGS_KEYS.DOCS_PATH),
    key: SETTINGS_KEYS.DOCS_PATH,
    type: "string",
    defaultValue: "",
    description: "Optional path to a docs directory containing Markdown files.",
    envKeys: buildEnvKeys("DOCS_PATH"),
  },
  [SETTINGS_KEYS.WEBVIEW_PATH]: {
    id: fullKey(SETTINGS_KEYS.WEBVIEW_PATH),
    key: SETTINGS_KEYS.WEBVIEW_PATH,
    type: "string",
    defaultValue: "",
    description: "Optional local HTML path for live-refresh webview.",
    envKeys: buildEnvKeys("WEBVIEW_PATH"),
  },
  [SETTINGS_KEYS.WEBVIEW_SERVER_URL]: {
    id: fullKey(SETTINGS_KEYS.WEBVIEW_SERVER_URL),
    key: SETTINGS_KEYS.WEBVIEW_SERVER_URL,
    type: "string",
    defaultValue: "",
    description: "Optional server URL (e.g. http://localhost:5173) for HMR webview loading.",
    envKeys: buildEnvKeys("WEBVIEW_SERVER_URL"),
  },
};

export const SETTINGS_REGISTRY_METADATA = {
  section: SETTINGS_SECTION,
  description: "VS Code settings registry for user intent configuration.",
} as const;
