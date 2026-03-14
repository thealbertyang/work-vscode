import {
  ACTIONS,
  IPC_COMMAND_PAYLOAD_SCHEMAS,
  IPC_COMMANDS,
  IPC_EVENT_PAYLOAD_SCHEMAS,
  IPC_EVENTS,
  ROUTE_META,
} from "../contracts";
import { RPC_METHODS, VSCODE_COMMANDS, type ActionDefinition } from "../contracts/commands";
import type { RouteMeta } from "../contracts/routes";
import { APP_ID, APP_NAME, APP_NAMESPACE } from "../app-identity";
import type {
  TopologyConfig,
  UniversalAction,
  UniversalCommand,
  UniversalConfig,
  UniversalEvent,
  UniversalRoute,
  UniversalShellSection,
  UniversalStage,
  UniversalStorageTarget,
  UniversalView,
} from "./types";

const buildDefaultActions = (): Record<string, UniversalAction> => {
  // Widen to the base contract type so optional fields are visible.
  const entries = (Object.values(ACTIONS) as ActionDefinition[]).map((action) => [
    action.id,
    {
      id: action.id,
      description: action.description,
      command: action.vscode,
      rpc: action.rpc,
      route: action.route,
    },
  ]);
  return Object.fromEntries(entries);
};

const buildDefaultCommands = (): Record<string, UniversalCommand> => {
  const commands: Record<string, UniversalCommand> = {};
  Object.values(VSCODE_COMMANDS).forEach((command) => {
    commands[command] = { id: command, kind: "vscode", title: command };
  });
  Object.values(RPC_METHODS).forEach((method) => {
    commands[method] = { id: method, kind: "rpc" };
  });
  Object.values(IPC_COMMANDS).forEach((command) => {
    commands[command] = {
      id: command,
      kind: "ipc",
      payloadSchema:
        IPC_COMMAND_PAYLOAD_SCHEMAS[command as keyof typeof IPC_COMMAND_PAYLOAD_SCHEMAS],
    };
  });
  return commands;
};

const buildDefaultEvents = (): Record<string, UniversalEvent> => {
  const entries = Object.values(IPC_EVENTS).map((event) => [
    event,
    {
      id: event,
      kind: "ipc" as const,
      payloadSchema: IPC_EVENT_PAYLOAD_SCHEMAS[event as keyof typeof IPC_EVENT_PAYLOAD_SCHEMAS],
    },
  ]);
  return Object.fromEntries(entries);
};

const buildDefaultRoutes = (): Record<string, UniversalRoute> => {
  // `as const satisfies ...` preserves literal types; widen so optional fields
  // (tabLabel/tabOrder/tabHidden/redirect/...) are accessible in a uniform way.
  const entries = Object.entries(ROUTE_META as Record<string, RouteMeta>).map(([id, meta]) => [
    id,
    {
      id,
      path: meta.path,
      view: id,
      // Deep links are represented as a path template; the scheme/base is runtime-specific.
      deepLink: `/app/${APP_ID}/route${meta.path}`,
      section: meta.section,
      tabLabel: meta.tabLabel,
      tabOrder: meta.tabOrder,
      tabHidden: meta.tabHidden,
    },
  ]);
  return Object.fromEntries(entries);
};

const buildDefaultViews = (): Record<string, UniversalView> => {
  const entries = Object.entries(ROUTE_META as Record<string, RouteMeta>).map(([id, meta]) => [
    id,
    {
      id,
      label: meta.tabLabel,
      title: meta.tabLabel,
      route: id,
    },
  ]);
  return Object.fromEntries(entries);
};

const buildDefaultStorageTargets = (): Record<string, UniversalStorageTarget> => ({
  settings: {
    id: "settings",
    kind: "settings",
    scope: "workspace",
    description: "User intent configuration (workspace or global).",
  },
  secrets: {
    id: "secrets",
    kind: "secrets",
    scope: "global",
    description: "Sensitive credentials stored in VS Code secrets.",
  },
  globalState: {
    id: "globalState",
    kind: "state",
    scope: "global",
    description: "Small global flags and restart markers.",
  },
  workspaceState: {
    id: "workspaceState",
    kind: "state",
    scope: "workspace",
    description: "Workspace-scoped flags.",
  },
  globalFiles: {
    id: "globalFiles",
    kind: "file",
    scope: "global",
    description: "Large caches in global storage.",
  },
  workspaceFiles: {
    id: "workspaceFiles",
    kind: "file",
    scope: "workspace",
    description: "Workspace caches and snapshots.",
  },
  webviewState: {
    id: "webviewState",
    kind: "vscodeStorage",
    scope: "webview",
    description: "Webview local state via vscodeApi.setState.",
  },
  webviewLocal: {
    id: "webviewLocal",
    kind: "localStorage",
    scope: "webview",
    description: "Webview local or session storage (UI-only).",
  },
  webviewIndexedDb: {
    id: "webviewIndexedDb",
    kind: "indexeddb",
    scope: "webview",
    description: "Webview IndexedDB for offline UI caches (no secrets).",
  },
  extensionSqlite: {
    id: "extensionSqlite",
    kind: "sqlite",
    scope: "workspace",
    description: "Optional SQLite database for structured caches.",
  },
  externalDatabase: {
    id: "externalDatabase",
    kind: "remoteDb",
    scope: "global",
    description: "Remote database or service-backed storage.",
  },
});

const buildDefaultStages = (): Record<string, UniversalStage> => ({
  plan: {
    id: "plan",
    label: "Plan",
    icon: "calendar",
    order: 1,
    defaultRoute: "/plan",
    subnav: {
      daily: { label: "Daily", path: "/plan", order: 1 },
      weekly: { label: "Weekly", path: "/plan/weekly", order: 2 },
      monthly: { label: "Monthly", path: "/plan/monthly", order: 3 },
      quarterly: { label: "Quarterly", path: "/plan/quarterly", order: 4 },
      career: { label: "Career", path: "/plan/career", order: 5 },
    },
  },
  execute: {
    id: "execute",
    label: "Execute",
    icon: "play",
    order: 2,
    defaultRoute: "/execute",
    subnav: {},
  },
  review: {
    id: "review",
    label: "Review",
    icon: "eye",
    order: 3,
    defaultRoute: "/review",
  },
  ship: {
    id: "ship",
    label: "Ship",
    icon: "rocket",
    order: 4,
    defaultRoute: "/ship",
  },
  observe: {
    id: "observe",
    label: "Observe",
    icon: "pulse",
    order: 5,
    defaultRoute: "/observe",
  },
  system: {
    id: "system",
    label: "System",
    icon: "gear",
    order: 99,
    defaultRoute: "/system/settings",
    subnav: {
      settings: { label: "Settings", path: "/system/settings", order: 1 },
      docs: { label: "Docs", path: "/system/docs", order: 2 },
      registry: { label: "Registry", path: "/system/registry", order: 3 },
    },
  },
});

const buildDefaultShellSections = (): Record<string, UniversalShellSection> => ({
  now: {
    id: "now",
    label: "Now",
    description: "Current work, next action, delegation, and checkpoint.",
    icon: "pulse",
    order: 1,
    defaultRoute: "/",
  },
  work: {
    id: "work",
    label: "Work",
    description: "Lifecycle views, queue, handoffs, and related work.",
    icon: "briefcase",
    order: 2,
    defaultRoute: "/execute",
    stageIds: ["plan", "execute", "review", "ship"],
  },
  agents: {
    id: "agents",
    label: "Agents",
    description: "Online agents, terminals, sessions, and runtime state.",
    icon: "hubot",
    order: 3,
    defaultRoute: "/agents",
  },
  observe: {
    id: "observe",
    label: "Observe",
    description: "Signals, failures, health, and recent events.",
    icon: "pulse",
    order: 4,
    defaultRoute: "/observe",
  },
  system: {
    id: "system",
    label: "System",
    description: "Settings, docs, registry, and developer tools.",
    icon: "gear",
    order: 5,
    defaultRoute: "/system/settings",
  },
});

export const buildDefaultTopology = (): TopologyConfig => ({
  defaultDomain: "app",

  domains: {
    app: { id: "app", label: "App", concern: "Runtime primitives, lifecycle, transport, routing, messaging", color: "var(--color-domain-app)" },
    identity: { id: "identity", label: "Identity", concern: "Authentication, credentials, accounts", color: "var(--color-domain-identity)" },
    content: { id: "content", label: "Content", concern: "Business logic, issues, triage, automations, external data", color: "var(--color-domain-content)" },
    view: { id: "view", label: "View", concern: "Presentation, theme, layout, stage views", color: "var(--color-domain-view)" },
  },

  overrides: {
    // VS Code commands
    "work.openApp": "app",
    "work.refresh": "app",
    "work.runDevWebview": "app",
    "work.restartExtensionHost": "app",
    "work.reloadWebviews": "app",
    "work.syncEnvToSettings": "app",
    "work.reinstallExtension": "app",
    "work.login": "identity",
    "work.logout": "identity",
    "work.openIssue": "content",
    "work.startTaskTerminal": "app",
    // RPC methods
    showInformation: "app", execCommand: "app", getState: "app",
    registerChannel: "app", unregisterChannel: "app", sendMessage: "app",
    addMessageListener: "app", rmMessageListener: "app",
    axiosGet: "app", axiosPost: "app", axiosPut: "app", axiosDelete: "app",
    openSettings: "app", syncEnvToSettings: "app", startTaskTerminal: "app",
    getUniversalConfig: "app", getFullConfig: "app",
    getDocsIndex: "app", getDocContent: "app", revealDocAsset: "app", openDocInEditor: "app",
    restartExtensionHost: "app", reloadWebviews: "app", reinstallExtension: "app",
    saveApiToken: "identity", disconnect: "identity",
    getIssue: "content", listIssues: "content", openIssueInBrowser: "content",
    getTriageState: "content", runTriage: "content",
    getAutomations: "content", getAutomationRuns: "content",
    onDidOpenTextDocument: "app", buildExtension: "app", buildWebview: "app",
    runDevWebview: "app",
    getTheme: "view", setTheme: "view", onThemeChange: "view",
    // IPC commands / events
    "work.route.navigate": "view", "work.webview.refresh": "app",
    "work.state.updated": "app", "work.webview.ready": "app",
    "work.route.changed": "view", "work.ui.action": "app", "work.ui.event": "app",
  },

  prefixRules: [
    { prefix: "identity.", domain: "identity" },
    { prefix: "content.", domain: "content" },
    { prefix: "view.", domain: "view" },
    { prefix: "app.", domain: "app" },
    { prefix: "work.identity.", domain: "identity" },
    { prefix: "work.content.", domain: "content" },
    { prefix: "work.view.", domain: "view" },
    { prefix: "work.app.", domain: "app" },
  ],

  stageMap: {
    plan: "view",
    execute: "view",
    review: "view",
    ship: "view",
    observe: "view",
    system: "app",
  },

  storageDomains: {
    settings: ["app", "identity", "content"],
    secrets: ["identity"],
    globalState: ["app"],
    workspaceState: ["app"],
    globalFiles: ["app"],
    workspaceFiles: ["content"],
    webviewState: ["view"],
    webviewLocal: ["view"],
    webviewIndexedDb: ["view"],
    extensionSqlite: ["app", "content"],
    externalDatabase: ["content"],
  },

  layers: {
    kernel: { id: "kernel", label: "Kernel", concern: "Runtime primitives", modules: ["app", "config", "messages"] },
    identity: { id: "identity", label: "Identity", concern: "Authentication, credentials, accounts", modules: ["auth"] },
    data: { id: "data", label: "Data", concern: "External I/O — HTTP client, state queries", modules: ["http"] },
    domain: { id: "domain", label: "Domain", concern: "Business logic — issues, triage, automations", modules: ["issues", "triage", "automations"] },
    ui: { id: "ui", label: "UI", concern: "Presentation — theme, layout, URL state", modules: ["theme"] },
    work: { id: "work", label: "Work", concern: "Stage feature views — plan, execute, review, ship, observe", modules: ["plan", "execute", "review", "ship", "observe"] },
    system: { id: "system", label: "System", concern: "Meta — settings, docs, registry, dev tools, configuration", modules: ["system", "settings", "docs", "dev", "universal"] },
  },
});

export const DEFAULT_UNIVERSAL_CONFIG: UniversalConfig = {
  app: {
    id: APP_ID,
    name: APP_NAME,
    namespace: APP_NAMESPACE,
    defaultRoute: "/",
    intentScheme: "app",
  },
  namespaces: {
    app: { id: "app", prefix: APP_NAMESPACE, description: "Primary app namespace." },
    actions: { id: "actions", prefix: APP_NAMESPACE, description: "Action identifiers." },
    commands: { id: "commands", prefix: APP_NAMESPACE, description: "Command identifiers." },
    events: { id: "events", prefix: APP_NAMESPACE, description: "Event identifiers." },
    routes: { id: "routes", prefix: APP_NAMESPACE, description: "Route identifiers." },
    settings: { id: "settings", prefix: APP_NAMESPACE, description: "Settings namespace." },
  },
  styles: {
    theme: "default",
    cssVariables: {
      "--app-accent": "#EAD872",
    },
  },
  shell: {
    defaultSection: "now",
    sections: buildDefaultShellSections(),
  },
  stages: buildDefaultStages(),
  actions: buildDefaultActions(),
  commands: buildDefaultCommands(),
  events: buildDefaultEvents(),
  routes: buildDefaultRoutes(),
  views: buildDefaultViews(),
  platforms: {
    vscode: { id: "vscode", kind: "vscode", description: "VS Code webview panel." },
    web: { id: "web", kind: "web", description: "Browser via WS bridge (localhost dev)." },
    remote: { id: "remote", kind: "remote", description: "VS Code Remote (SSH/WSL/Codespaces)." },
  },
  environments: {
    dev: { id: "dev", kind: "dev", description: "Development." },
    prod: { id: "prod", kind: "prod", description: "Installed extension." },
    test: { id: "test", kind: "test", description: "Test/CI." },
  },
  storage: {
    targets: buildDefaultStorageTargets(),
  },
  topology: buildDefaultTopology(),
};
