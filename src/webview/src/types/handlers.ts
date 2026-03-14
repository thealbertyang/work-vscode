import type { AutomationRun, AutomationsIndex } from "@shared/automations-contract";
import type { DocContent, DocsIndex } from "@shared/docs-contract";
import type { JiraIssueSummary, JiraIssueDetails, WebviewState, TriageState } from "@shared/contracts";
import type { UniversalConfig } from "@shared/universal";
import type { WorkShellSummary } from "work-shared/domain/shell";

export type TextDocumentLike = {
  fileName?: string;
};

export type ObservableHandler<T> = {
  next: (value: T) => void;
};

export type HandlersType = {
  showInformation: (message: string) => void;
  getTheme: () => string;
  setTheme: (theme: string) => Promise<void>;
  onThemeChange: (observer: ObservableHandler<string>) => Promise<() => void>;
  registerChannel: (channel: string) => void;
  unregisterChannel: (channel: string) => boolean | Promise<boolean>;
  sendMessage: (channel: string, message: unknown) => Promise<string | void>;
  addMessageListener: (channel: string, listener: (msg: unknown) => void) => Promise<number>;
  rmMessageListener: (channel: string, listenerNumber: number) => boolean | Promise<boolean>;
  execCommand: (command: string, ...rest: unknown[]) => Promise<unknown>;
  axiosGet: (url: string, config?: unknown) => Promise<unknown>;
  axiosPost: (url: string, data?: unknown, config?: unknown) => Promise<unknown>;
  axiosPut: (url: string, data?: unknown, config?: unknown) => Promise<unknown>;
  axiosDelete: (url: string, config?: unknown) => Promise<unknown>;
  onDidOpenTextDocument: (observer: ObservableHandler<TextDocumentLike>) => Promise<() => void>;
  getState: () => Promise<WebviewState>;
  getIssue: (key: string) => Promise<JiraIssueDetails | null>;
  listIssues: () => Promise<JiraIssueSummary[]>;
  getDocsIndex: () => Promise<DocsIndex>;
  getDocContent: (id: string) => Promise<DocContent | null>;
  openDocInEditor: (id: string) => Promise<boolean>;
  revealDocAsset: (baseId: string, href: string) => Promise<boolean>;
  saveApiToken: (baseUrl: string, email: string, apiToken: string) => Promise<void>;
  disconnect: () => Promise<void>;
  openSettings: () => Promise<void>;
  syncEnvToSettings: () => Promise<void>;
  openIssueInBrowser: (key: string) => Promise<void>;
  reinstallExtension: () => Promise<void>;
  runDevWebview: () => Promise<void>;
  restartExtensionHost: () => Promise<void>;
  reloadWebviews: () => Promise<void>;
  startTaskTerminal: () => Promise<void>;
  getAutomations: () => Promise<AutomationsIndex>;
  getAutomationRuns: (automationId: string) => Promise<AutomationRun[]>;
  getUniversalConfig: () => Promise<UniversalConfig>;
  getWorkShellSummary: () => Promise<WorkShellSummary>;
  getTriageState: () => Promise<TriageState>;
  runTriage: () => Promise<TriageState>;
  getFullConfig: () => Promise<Record<string, unknown>>;
};
