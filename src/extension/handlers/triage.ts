import path from "path";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { workspace, Uri } from "vscode";
import type { HandlerDependencies } from "./types";
import {
  type AppPersistedState,
  type TriageState,
  EMPTY_APP_STATE,
  EMPTY_TRIAGE_STATE,
  statusToBucket,
} from "../../shared/contracts";

type TriageDependencies = Pick<HandlerDependencies, "context" | "client">;

const STATE_FILENAME = "state.json";

const getStatePath = (context: HandlerDependencies["context"]): string => {
  const workspaceFolder =
    workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ??
    workspace.workspaceFolders?.[0];
  const wsRoot = workspaceFolder?.uri.fsPath ?? context.extensionPath;
  return path.join(wsRoot, ".claude", STATE_FILENAME);
};

const readState = (context: HandlerDependencies["context"]): AppPersistedState => {
  const filePath = getStatePath(context);
  try {
    if (!existsSync(filePath)) {
      return EMPTY_APP_STATE;
    }
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as AppPersistedState;
    if (parsed.version !== 1) {
      return EMPTY_APP_STATE;
    }
    // Be defensive: keep runtime state resilient to partial/corrupt values.
    const triage: TriageState =
      parsed.triage && typeof parsed.triage === "object"
        ? {
            issues: Array.isArray((parsed.triage as any).issues)
              ? ((parsed.triage as any).issues as any[])
              : EMPTY_TRIAGE_STATE.issues,
            lastTriagedAt:
              typeof (parsed.triage as any).lastTriagedAt === "number" ||
              (parsed.triage as any).lastTriagedAt === null
                ? ((parsed.triage as any).lastTriagedAt as number | null)
                : EMPTY_TRIAGE_STATE.lastTriagedAt,
          }
        : EMPTY_TRIAGE_STATE;
    return { version: 1, triage };
  } catch {
    return EMPTY_APP_STATE;
  }
};

const writeState = (context: HandlerDependencies["context"], state: AppPersistedState): void => {
  const filePath = getStatePath(context);
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
};

export const createTriageHandlers = ({ context, client }: TriageDependencies) => ({
  getTriageState: async (): Promise<TriageState> => {
    return readState(context).triage;
  },

  runTriage: async (): Promise<TriageState> => {
    const issues = await client.searchMyOpenSprintIssues();
    const triaged: TriageState = {
      issues: issues.map((issue) => ({
        ...issue,
        bucket: statusToBucket(issue.status),
      })),
      lastTriagedAt: Date.now(),
    };

    const state = readState(context);
    state.triage = triaged;
    writeState(context, state);

    return triaged;
  },
});
