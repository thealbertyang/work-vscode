export const SETTINGS_SECTION = "work";

export const SETTINGS_KEYS = {
  BASE_URL: "baseUrl",
  JIRA_URL: "jiraUrl",
  EMAIL: "email",
  API_TOKEN: "apiToken",
  JQL: "jql",
  MAX_RESULTS: "maxResults",
  DOCS_PATH: "docsPath",
  WEBVIEW_PATH: "webviewPath",
  WEBVIEW_SERVER_URL: "webviewServerUrl",
} as const;

export type SettingKey = (typeof SETTINGS_KEYS)[keyof typeof SETTINGS_KEYS];

export const settingKey = (key: SettingKey): string => `${SETTINGS_SECTION}.${key}`;
