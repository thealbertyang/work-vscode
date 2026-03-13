import { createContext, useContext } from "react";
import type { ChangeEvent } from "react";
import type { JiraIssueDetails, WebviewState } from "../types/handlers";
import type { JiraIssueSummary } from "@shared/contracts";
import type { UniversalConfig } from "@shared/universal";

export type FormState = {
  baseUrl: string;
  email: string;
  apiToken: string;
};

export type StatusState = {
  isConnected: boolean;
  source: string;
};

export type AppContextValue = {
  state: WebviewState;
  status: StatusState;
  form: FormState;
  loading: boolean;
  error: string;
  isWebview: boolean;
  deepLinkBase: string;
  deepLinkUrl: string;
  copyDeepLink: () => Promise<void>;
  updateForm: (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => void;
  saveToken: () => Promise<void>;
  disconnect: () => Promise<void>;
  openSettings: () => Promise<void>;
  syncEnv: () => Promise<void>;
  runDevWebview: () => Promise<void>;
  reloadWebviews: () => Promise<void>;
  reinstallExtension: () => Promise<void>;
  restartExtensionHost: () => Promise<void>;
  startTaskTerminal: () => Promise<void>;
  buildExtension: () => Promise<void>;
  buildWebview: () => Promise<void>;
  formatTimestamp: (value: number | null | undefined) => string;
  sprintIssues: JiraIssueSummary[];
  sprintIssuesLoading: boolean;
  issue: JiraIssueDetails | null;
  issueLoading: boolean;
  issueError: string;
  issueKey?: string;
  issueView: "compact" | "full";
  setIssueView: (view: "compact" | "full") => void;
  openIssueInBrowser: () => Promise<void>;
  refreshIssue: () => void;
  navigate: (path: string) => void;
  routeName: string;
  currentStage: string;
  universalConfig: UniversalConfig | null;
};

const AppContext = createContext<AppContextValue | null>(null);

export const AppContextProvider = AppContext.Provider;

export const useAppContext = (): AppContextValue => {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error("useAppContext must be used within AppContextProvider");
  }
  return ctx;
};
