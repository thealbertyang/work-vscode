export type AutomationStatus = "ACTIVE" | "INACTIVE";
export type AutomationSource = "global" | "local";
export type RunStatus = "ACCEPTED" | "ARCHIVED" | "PENDING";

export type Automation = {
  id: string;
  name: string;
  prompt: string;
  status: AutomationStatus;
  rrule: string;
  rruleHuman: string;
  cwds: string[];
  hasMemory: boolean;
  nextRunAt?: number;
  lastRunAt?: number;
  source: AutomationSource;
  createdAt?: number;
  updatedAt?: number;
};

export type AutomationRun = {
  threadId: string;
  automationId: string;
  status: RunStatus;
  threadTitle?: string;
  inboxSummary?: string;
  sourceCwd?: string;
  createdAt: number;
  updatedAt: number;
  archivedReason?: string;
};

export type AutomationsIndex = {
  global: Automation[];
  local: Automation[];
  error?: string;
};
