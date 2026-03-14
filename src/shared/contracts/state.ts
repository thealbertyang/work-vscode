export type ConfigSource =
  | "env.local"
  | "env"
  | "process.env"
  | "settings"
  | "mixed"
  | "none";

export type AuthType = "apiToken" | "none";

export type DevState = {
  lastExtensionBuildAt: number | null;
  lastWebviewRenderAt: number | null;
};

export type WebviewState = {
  baseUrl: string;
  email: string;
  apiTokenConfigured: boolean;
  configSource: ConfigSource;
  authType?: AuthType;
  hasStoredToken?: boolean;
  devMode?: boolean;
  extensionId?: string;
  uriScheme?: string;
  app?: {
    id?: string;
    name?: string;
    version?: string;
  };
  dev?: DevState;
};

export type JiraIssueSummary = {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  project: string;
};

export type JiraIssueDetails = JiraIssueSummary & {
  description?: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  created?: string;
  updated?: string;
  url?: string;
};

export type SettingsState = {
  baseUrl: string;
  email: string;
  apiToken: string;
  jql: string;
  maxResults: number;
  docsPath?: string;
  webviewPath?: string;
  webviewServerUrl?: string;
};

export type ConnectionState = {
  isConnected: boolean;
  source: ConfigSource;
  authType: AuthType;
};

export type UserState = {
  email?: string;
  baseUrl?: string;
  authType?: AuthType;
};

export type AppState = {
  webview: WebviewState;
  settings: SettingsState;
  connection: ConnectionState;
  user?: UserState;
  issue?: JiraIssueDetails | null;
};
