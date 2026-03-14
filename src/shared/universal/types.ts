export type UniversalScope = "global" | "workspace" | "webview" | "session";

export type UniversalCommandKind = "vscode" | "rpc" | "ipc" | "internal" | "webview";

export type UniversalEventKind = "ipc" | "webview" | "extension" | "telemetry";

export type UniversalStorageKind =
  | "settings"
  | "secrets"
  | "state"
  | "file"
  | "database"
  | "indexeddb"
  | "sqlite"
  | "remoteDb"
  | "localStorage"
  | "vscodeStorage";

export type UniversalEnvironmentKind = "dev" | "test" | "prod";

export type UniversalPlatformKind = "vscode" | "web" | "desktop" | "remote";

export type UniversalNamespace = {
  id: string;
  prefix: string;
  description?: string;
};

export type UniversalAppConfig = {
  id: string;
  name: string;
  namespace: string;
  version?: string;
  defaultRoute?: string;
  /**
   * Canonical, transport-agnostic intent URL scheme (e.g. "work", "agent", "control").
   * This is NOT the VS Code deep-link scheme (`vscode://`, `vscode-insiders://`).
   */
  intentScheme?: string;
  description?: string;
};

export type UniversalStyleConfig = {
  theme?: string;
  cssVariables?: Record<string, string>;
  classNames?: Record<string, string>;
};

export type UniversalCommand = {
  id: string;
  kind: UniversalCommandKind;
  title?: string;
  description?: string;
  target?: string;
  payloadSchema?: string;
  domain?: string;
};

export type UniversalEvent = {
  id: string;
  kind: UniversalEventKind;
  description?: string;
  payloadSchema?: string;
  domain?: string;
};

export type UniversalAction = {
  id: string;
  description?: string;
  command?: string;
  rpc?: string;
  event?: string;
  route?: string;
  ruleset?: string;
  tags?: string[];
  domain?: string;
};

export type UniversalRoute = {
  id: string;
  path: string;
  view?: string;
  deepLink?: string;
  section?: string;
  tabLabel?: string;
  tabOrder?: number;
  tabHidden?: boolean;
  domain?: string;
};

export type UniversalView = {
  id: string;
  label?: string;
  title?: string;
  description?: string;
  route?: string;
  icon?: string;
};

export type UniversalObjectField = {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
};

export type UniversalObjectClass = {
  id: string;
  description?: string;
  fields?: UniversalObjectField[];
  namespace?: string;
};

export type UniversalDataset = {
  id: string;
  description?: string;
  source?: string;
  storageTarget?: string;
  refreshPolicy?: string;
  schema?: string;
};

export type UniversalStorageTarget = {
  id: string;
  kind: UniversalStorageKind;
  scope?: UniversalScope;
  location?: string;
  description?: string;
  domain?: string;
};

export type UniversalStorageConfig = {
  targets: Record<string, UniversalStorageTarget>;
};

export type UniversalRule = {
  id: string;
  description?: string;
  when: string;
  then: string;
};

export type UniversalRuleSet = {
  id: string;
  description?: string;
  rules: string[];
};

export type UniversalPlatform = {
  id: string;
  kind: UniversalPlatformKind;
  description?: string;
};

export type UniversalEnvironment = {
  id: string;
  kind: UniversalEnvironmentKind;
  description?: string;
};

export type UniversalSubNavItem = {
  label: string;
  path: string;
  order: number;
};

export type UniversalStage = {
  id: string;
  label: string;
  icon?: string;
  order: number;
  defaultRoute: string;
  subnav?: Record<string, UniversalSubNavItem>;
};

export type UniversalShellSection = {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  order: number;
  defaultRoute: string;
  stageIds?: string[];
};

export type UniversalShellConfig = {
  defaultSection: string;
  sections: Record<string, UniversalShellSection>;
};

export type UrlStateHistoryMode = "push" | "replace";

export type UrlStateParam = {
  id: string;
  type: "string" | "enum" | "boolean" | "number";
  values?: string[];
  default?: string;
  description?: string;
  history?: UrlStateHistoryMode;
};

export type UrlStateConfig = {
  [key: string]: UrlStateParam;
};

// ── Topology types ─────────────────────────────────────────

export type TopologyDomain = {
  id: string;
  label: string;
  concern?: string;
  color?: string;
};

export type TopologyPrefixRule = {
  prefix: string;
  domain: string;
};

export type TopologyLayer = {
  id: string;
  label: string;
  concern?: string;
  modules: string[];
};

export type TopologyConfig = {
  defaultDomain: string;
  domains: Record<string, TopologyDomain>;
  overrides?: Record<string, string>;
  prefixRules?: TopologyPrefixRule[];
  stageMap?: Record<string, string>;
  storageDomains?: Record<string, string[]>;
  layers?: Record<string, TopologyLayer>;
};

// ── Universal config ───────────────────────────────────────

export type UniversalConfig = {
  app: UniversalAppConfig;
  namespaces: Record<string, UniversalNamespace>;
  styles?: UniversalStyleConfig;
  shell?: UniversalShellConfig;
  stages?: Record<string, UniversalStage>;
  actions?: Record<string, UniversalAction>;
  commands?: Record<string, UniversalCommand>;
  events?: Record<string, UniversalEvent>;
  routes?: Record<string, UniversalRoute>;
  views?: Record<string, UniversalView>;
  objects?: Record<string, UniversalObjectClass>;
  datasets?: Record<string, UniversalDataset>;
  storage?: UniversalStorageConfig;
  rules?: Record<string, UniversalRule>;
  rulesets?: Record<string, UniversalRuleSet>;
  platforms?: Record<string, UniversalPlatform>;
  environments?: Record<string, UniversalEnvironment>;
  urlState?: UrlStateConfig;
  topology?: TopologyConfig;
  metadata?: Record<string, string>;
};
