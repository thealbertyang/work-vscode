import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

type ProposedTestMessage = string | { message?: string };
type ProposedTestSnapshot = {
  state?: number;
  message?: ProposedTestMessage[];
  duration?: number;
};
type ProposedTestItem = {
  uri?: vscode.Uri;
  id: string;
  label: string;
};
type ProposedTestRunResult = {
  results: Iterable<[ProposedTestItem, ProposedTestSnapshot]>;
};
type ProposedTestsApi = {
  onDidChangeTestResults?: (
    listener: (results: Iterable<ProposedTestRunResult>) => void,
  ) => vscode.Disposable;
};

// VS Code's proposed test observer API is not part of the stable typings we build against.
// Treat both failed and errored result states as actionable.
const FAILED_TEST_STATES = new Set([4, 6]);

const EVENTS_DIR_SETTING = "work.eventsDir";
const DEFAULT_EVENTS_DIR = path.join(
  process.env.CLAUDE_CONFIG_DIR?.trim()
    || path.join(
      process.env.DEVELOPER_HOME?.trim()
        || path.join(process.env.HOME ?? "", process.env.DEVELOPER_NAMESPACE?.trim() || "Developer"),
      ".claude",
    ),
  "events",
);

function getEventsDir(): string {
  return vscode.workspace.getConfiguration().get<string>(EVENTS_DIR_SETTING) ?? DEFAULT_EVENTS_DIR;
}

function writeEventFile(event: Record<string, unknown>): void {
  const eventsDir = getEventsDir();
  try {
    fs.mkdirSync(eventsDir, { recursive: true });
    const id = `evt_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const fullEvent = { id, ...event };
    const filePath = path.join(eventsDir, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(fullEvent, null, 2) + "\n");
  } catch (err) {
    console.warn("[test-failure-bridge] Failed to write event:", err);
  }
}

export class TestFailureBridge implements vscode.Disposable {
  private disposable: vscode.Disposable | undefined;

  start(): void {
    if (this.disposable) return;

    const testsApi = vscode.tests as unknown as ProposedTestsApi | undefined;
    try {
      if (!testsApi?.onDidChangeTestResults) {
        return;
      }

      this.disposable = testsApi.onDidChangeTestResults((results) => {
        for (const result of results) {
          this.processTestResult(result);
        }
      });
    } catch {
      // testObserver is a proposed API — silently skip when not enabled
    }
  }

  private processTestResult(result: ProposedTestRunResult): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";

    for (const [test, snapshot] of result.results) {
      if (FAILED_TEST_STATES.has(Number(snapshot.state))) {
        const message = snapshot.message?.[0];
        const errorText = message
          ? (typeof message === "string" ? message : message.message)
          : "Unknown failure";

        writeEventFile({
          type: "test.failure",
          source: "vscode",
          timestamp: new Date().toISOString(),
          payload: {
            suite: workspaceFolder,
            file: test.uri?.fsPath ?? test.id,
            test: test.label,
            error: typeof errorText === "string" ? errorText : String(errorText),
            stack: "",
            exitCode: 1,
            runner: "vscode-test-api",
            duration_ms: snapshot.duration ?? 0,
            attempt: 1,
          },
        });
      }
    }
  }

  dispose(): void {
    this.disposable?.dispose();
    this.disposable = undefined;
  }
}
