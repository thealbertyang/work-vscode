import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface LocalStory {
  key: string;
  projectKey: string;
  status: string;
  workStatus: "active" | "blocked" | "review" | "done" | "inbox" | string;
  queue: "active" | "blocked" | "review" | "done" | "inbox" | string;
  assignee: string | null;
  summary: string;
  updatedAt: string | null;
  syncedAt: string | null;
}

function normalizeStory(raw: unknown, fallbackKey: string): LocalStory | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const key = typeof value.key === "string" && value.key.trim() ? value.key.trim().toUpperCase() : fallbackKey;
  const projectKey = typeof value.projectKey === "string" && value.projectKey.trim()
    ? value.projectKey.trim().toUpperCase()
    : key.split("-")[0] ?? "DEV";
  const workStatus =
    typeof value.workStatus === "string" && value.workStatus.trim()
      ? value.workStatus.trim()
      : typeof value.queue === "string" && value.queue.trim()
        ? value.queue.trim()
        : "inbox";

  return {
    key,
    projectKey,
    status: typeof value.status === "string" ? value.status : "Unknown",
    workStatus,
    queue: workStatus,
    assignee: typeof value.assignee === "string" ? value.assignee : null,
    summary: typeof value.summary === "string" ? value.summary : key,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    syncedAt: typeof value.syncedAt === "string" ? value.syncedAt : null,
  };
}

/**
 * Reads local story snapshots from $WORK_STORIES_ROOT/{PROJECT}/{KEY}/state.json.
 * Source of truth for agent-side decorations — zero Jira API calls.
 */
export class LocalStoryReader {
  private readonly storiesDir: string;

  constructor(workspacePath: string) {
    const workNamespace = process.env.WORK_NAMESPACE?.trim() || "_";
    this.storiesDir = process.env.WORK_STORIES_ROOT?.trim() || path.join(workspacePath, workNamespace, "work", "stories");
  }

  read(key: string): LocalStory | null {
    const [project] = key.split("-");
    if (!project) return null;
	    const projectDir = path.join(this.storiesDir, project.toUpperCase());
	    const candidates = [
	      path.join(projectDir, key.toUpperCase(), "state.json"),
	      path.join(projectDir, `${key.toUpperCase()}.json`),
	    ];
    for (const filePath of candidates) {
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
        const story = normalizeStory(parsed, key.toUpperCase());
        if (story) return story;
      } catch {}
    }
    return null;
  }

  readAll(): LocalStory[] {
    const results: LocalStory[] = [];
    try {
      if (!fs.existsSync(this.storiesDir)) return results;
      for (const entry of fs.readdirSync(this.storiesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = path.join(this.storiesDir, entry.name);
        for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
          const filePath = file.isDirectory()
            ? path.join(dir, file.name, "state.json")
            : file.isFile() && file.name.endsWith(".json")
              ? path.join(dir, file.name)
              : "";
          if (!filePath) continue;
          try {
            const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
            const fallbackKey = file.isDirectory()
              ? file.name.toUpperCase()
              : path.basename(file.name, ".json").toUpperCase();
            const story = normalizeStory(raw, fallbackKey);
            if (story) results.push(story);
          } catch {}
        }
      }
    } catch {}
    return results;
  }

  /**
   * Watch story files for changes. Calls onChange with the issue key whenever
   * a story file is created, changed, or deleted. Returns a disposable.
   */
  watch(onChange: (key: string) => void): vscode.Disposable {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(this.storiesDir),
      "**/state.json",
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const handle = (uri: vscode.Uri) => {
      if (path.basename(uri.fsPath).toLowerCase() === "state.json") {
        onChange(path.basename(path.dirname(uri.fsPath)).toUpperCase());
        return;
      }
      onChange(path.basename(uri.fsPath, ".json").toUpperCase());
    };
    const subs = [
      watcher.onDidChange(handle),
      watcher.onDidCreate(handle),
      watcher.onDidDelete(handle),
    ];
    return { dispose: () => { watcher.dispose(); subs.forEach((s) => s.dispose()); } };
  }
}
