import type { RouteName } from "./routes";

export const VSCODE_COMMANDS = {
  LOGIN: "work.login",
  LOGOUT: "work.logout",
  REFRESH: "work.refresh",
  REFRESH_STORY_TASKS: "work.refreshStoryTasks",
  OPEN_BROWSER: "work.openBrowser",
  REFRESH_BROWSER: "work.refreshBrowser",
  RESTART_EXTENSION_HOST: "work.restartExtensionHost",
  SYNC_ENV_TO_SETTINGS: "work.syncEnvToSettings",
  REINSTALL_EXTENSION: "work.reinstallExtension",
  OPEN_ISSUE: "work.openIssue",
  START_TASK_TERMINAL: "work.startTaskTerminal",
  OPEN_AGENT_CHAT: "work.openAgentChat",
  ATTACH_AGENT_SESSION: "work.attachAgentSession",
  START_STORY_AGENT: "work.startStoryAgent",
  NEW_STORY_AGENT: "work.newStoryAgent",
  OPEN_AGENT_TERMINAL: "work.openAgentTerminal",
} as const;

export type VscodeCommandId = (typeof VSCODE_COMMANDS)[keyof typeof VSCODE_COMMANDS];

export const RPC_METHODS = {
  SHOW_INFORMATION: "showInformation",
  GET_THEME: "getTheme",
  SET_THEME: "setTheme",
  ON_THEME_CHANGE: "onThemeChange",
  REGISTER_CHANNEL: "registerChannel",
  UNREGISTER_CHANNEL: "unregisterChannel",
  SEND_MESSAGE: "sendMessage",
  ADD_MESSAGE_LISTENER: "addMessageListener",
  RM_MESSAGE_LISTENER: "rmMessageListener",
  EXEC_COMMAND: "execCommand",
  AXIOS_GET: "axiosGet",
  AXIOS_POST: "axiosPost",
  AXIOS_PUT: "axiosPut",
  AXIOS_DELETE: "axiosDelete",
  ON_DID_OPEN_TEXT_DOCUMENT: "onDidOpenTextDocument",
  GET_STATE: "getState",
  GET_ISSUE: "getIssue",
  LIST_ISSUES: "listIssues",
  GET_TRIAGE_STATE: "getTriageState",
  RUN_TRIAGE: "runTriage",
  GET_DOCS_INDEX: "getDocsIndex",
  GET_DOC_CONTENT: "getDocContent",
  REVEAL_DOC_ASSET: "revealDocAsset",
  SAVE_API_TOKEN: "saveApiToken",
  DISCONNECT: "disconnect",
  OPEN_SETTINGS: "openSettings",
  SYNC_ENV_TO_SETTINGS: "syncEnvToSettings",
  OPEN_ISSUE_IN_BROWSER: "openIssueInBrowser",
  OPEN_BROWSER: "openBrowser",
  REFRESH_BROWSER: "refreshBrowser",
  REINSTALL_EXTENSION: "reinstallExtension",
  RESTART_EXTENSION_HOST: "restartExtensionHost",
  START_TASK_TERMINAL: "startTaskTerminal",
  GET_AUTOMATIONS: "getAutomations",
  GET_AUTOMATION_RUNS: "getAutomationRuns",
  GET_UNIVERSAL_CONFIG: "getUniversalConfig",
  OPEN_AGENT_TERMINAL: "openAgentTerminal",
} as const;

export type RpcMethod = (typeof RPC_METHODS)[keyof typeof RPC_METHODS];

export type ActionDefinition = {
  id: string;
  rpc?: RpcMethod;
  vscode?: VscodeCommandId;
  route?: RouteName;
  description?: string;
};

export const ACTIONS = {
  APP_LOGIN: {
    id: "work.app.login",
    vscode: VSCODE_COMMANDS.LOGIN,
    route: "systemSettings",
  },
  APP_LOGOUT: {
    id: "work.app.logout",
    vscode: VSCODE_COMMANDS.LOGOUT,
  },
  APP_REFRESH: {
    id: "work.app.refresh",
    vscode: VSCODE_COMMANDS.REFRESH,
  },
  APP_REFRESH_STORY_TASKS: {
    id: "work.app.refreshStoryTasks",
    vscode: VSCODE_COMMANDS.REFRESH_STORY_TASKS,
  },
  APP_OPEN_BROWSER: {
    id: "work.app.openBrowser",
    vscode: VSCODE_COMMANDS.OPEN_BROWSER,
    rpc: RPC_METHODS.OPEN_BROWSER,
    description: "Open the Work app in the VS Code integrated browser",
  },
  APP_REFRESH_BROWSER: {
    id: "work.app.refreshBrowser",
    vscode: VSCODE_COMMANDS.REFRESH_BROWSER,
    rpc: RPC_METHODS.REFRESH_BROWSER,
    description: "Refresh the Work app in the VS Code integrated browser",
  },
  ISSUE_OPEN: {
    id: "work.issue.open",
    vscode: VSCODE_COMMANDS.OPEN_ISSUE,
    route: "reviewIssue",
  },
  DEV_RESTART_EXTENSION_HOST: {
    id: "work.dev.restartExtensionHost",
    vscode: VSCODE_COMMANDS.RESTART_EXTENSION_HOST,
    rpc: RPC_METHODS.RESTART_EXTENSION_HOST,
  },
  DEV_SYNC_ENV: {
    id: "work.dev.syncEnvToSettings",
    vscode: VSCODE_COMMANDS.SYNC_ENV_TO_SETTINGS,
    rpc: RPC_METHODS.SYNC_ENV_TO_SETTINGS,
  },
  DEV_REINSTALL_EXTENSION: {
    id: "work.dev.reinstallExtension",
    vscode: VSCODE_COMMANDS.REINSTALL_EXTENSION,
    rpc: RPC_METHODS.REINSTALL_EXTENSION,
  },
  DEV_TASK_TERMINAL: {
    id: "work.dev.startTaskTerminal",
    vscode: VSCODE_COMMANDS.START_TASK_TERMINAL,
    rpc: RPC_METHODS.START_TASK_TERMINAL,
  },
  UNIVERSAL_CONFIG_GET: {
    id: "work.universal.getConfig",
    rpc: RPC_METHODS.GET_UNIVERSAL_CONFIG,
  },
  AGENT_CHAT_OPEN: {
    id: "work.agent.openChat",
    vscode: VSCODE_COMMANDS.OPEN_AGENT_CHAT,
    description: "Open VS Code Chat with Claude agent",
  },
  AGENT_SESSION_ATTACH: {
    id: "work.agent.attachSession",
    vscode: VSCODE_COMMANDS.ATTACH_AGENT_SESSION,
    description: "Attach VS Code terminal to tmux agent session",
  },
  AGENT_STORY_START: {
    id: "work.agent.startStory",
    vscode: VSCODE_COMMANDS.START_STORY_AGENT,
    description: "Start or focus agent for a story",
  },
  AGENT_STORY_NEW: {
    id: "work.agent.newStory",
    vscode: VSCODE_COMMANDS.NEW_STORY_AGENT,
    description: "Start a new agent for a story",
  },
  AGENT_TERMINAL_OPEN: {
    id: "work.agent.openTerminal",
    vscode: VSCODE_COMMANDS.OPEN_AGENT_TERMINAL,
    rpc: RPC_METHODS.OPEN_AGENT_TERMINAL,
    description: "Open a VS Code terminal attached to an agent tmux session",
  },
  SETTINGS_OPEN: {
    id: "work.settings.open",
    rpc: RPC_METHODS.OPEN_SETTINGS,
    route: "systemSettings",
  },
  AUTH_SAVE_TOKEN: {
    id: "work.auth.saveApiToken",
    rpc: RPC_METHODS.SAVE_API_TOKEN,
  },
  AUTH_DISCONNECT: {
    id: "work.auth.disconnect",
    rpc: RPC_METHODS.DISCONNECT,
  },
  ISSUE_OPEN_BROWSER: {
    id: "work.issue.openBrowser",
    rpc: RPC_METHODS.OPEN_ISSUE_IN_BROWSER,
  },
} as const satisfies Record<string, ActionDefinition>;

const actionsByRpc: Record<string, ActionDefinition> = {};
const actionsByCommand: Record<string, ActionDefinition> = {};

// `as const satisfies ...` preserves literal types, which makes `Object.values(ACTIONS)`
// a union of all literal objects (some without `rpc`/`vscode`). Widen to ActionDefinition.
(Object.values(ACTIONS) as ActionDefinition[]).forEach((action) => {
  if (action.rpc) {
    actionsByRpc[action.rpc] = action;
  }
  if (action.vscode) {
    actionsByCommand[action.vscode] = action;
  }
});

export const rpcActionId = (method: string): string => `work.rpc.${method}`;

export const getActionByRpcMethod = (method: string): ActionDefinition => {
  return actionsByRpc[method] ?? { id: rpcActionId(method), rpc: method as RpcMethod };
};

export const getActionByVscodeCommand = (command: string): ActionDefinition => {
  return actionsByCommand[command] ?? {
    id: `work.command.${command}`,
    vscode: command as VscodeCommandId,
  };
};
