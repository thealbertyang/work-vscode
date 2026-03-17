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

/** Map a raw state.json to the LocalStory shape consumed by the VS Code tree view. */
function stateToLocalStory(raw: Record<string, unknown>, fallbackKey: string): LocalStory | null {
  if (!raw || typeof raw !== "object") return null;
  const key = typeof raw.key === "string" && raw.key.trim() ? raw.key.trim().toUpperCase() : fallbackKey;
  const projectKey = typeof raw.projectKey === "string" && raw.projectKey.trim()
    ? raw.projectKey.trim().toUpperCase()
    : key.split("-")[0] ?? "DEV";
  const phase = typeof raw.phase === "string" ? raw.phase : typeof raw.status === "string" ? raw.status : "inbox";

  return {
    key,
    projectKey,
    status: phase,
    workStatus: phase,
    queue: phase,
    assignee: typeof raw.assignee === "string" ? raw.assignee
      : (raw.focus as Record<string, unknown>)?.actor as string ?? null,
    summary: typeof raw.summary === "string" ? raw.summary : key,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : null,
  };
}

/**
 * Reads local story state from $WORK_STORIES_ROOT/{PROJECT}/{KEY}/state.json.
 * Source of truth for agent-side decorations — zero Jira API calls.
 */
export class LocalStoryReader {
  private readonly storiesDir: string;

  constructor(workspacePath: string) {
    const workHome = process.env.WORK_HOME?.trim()
      || (process.env.LIFECYCLE_HOME?.trim() ? path.join(process.env.LIFECYCLE_HOME.trim(), "work") : path.join(workspacePath, "_", "work"));
    this.storiesDir = process.env.WORK_STORIES_ROOT?.trim() || path.join(workHome, "stories");
  }

  read(key: string): LocalStory | null {
    const [project] = key.split("-");
    if (!project) return null;
    const projectDir = path.join(this.storiesDir, project.toUpperCase());
    // Scan for directory matching key (e.g., DEV-0001-slug/)
    try {
      for (const entry of fs.readdirSync(projectDir)) {
        if (entry === key.toUpperCase() || entry.toUpperCase().startsWith(`${key.toUpperCase()}-`)) {
          const statePath = path.join(projectDir, entry, "state.json");
          if (fs.existsSync(statePath)) {
            const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
            return stateToLocalStory(parsed, key.toUpperCase());
          }
        }
      }
    } catch {}
    return null;
  }

  readAll(): LocalStory[] {
    const results: LocalStory[] = [];
    try {
      if (!fs.existsSync(this.storiesDir)) return results;
      for (const project of fs.readdirSync(this.storiesDir)) {
        if (project.startsWith(".")) continue;
        const projectDir = path.join(this.storiesDir, project);
        try {
          for (const entry of fs.readdirSync(projectDir)) {
            if (entry.startsWith(".")) continue;
            const statePath = path.join(projectDir, entry, "state.json");
            if (!fs.existsSync(statePath)) continue;
            try {
              const raw = JSON.parse(fs.readFileSync(statePath, "utf-8")) as Record<string, unknown>;
              const story = stateToLocalStory(raw, entry.toUpperCase());
              if (story && story.status !== "done") results.push(story);
            } catch {}
          }
        } catch {}
      }
    } catch {}
    return results;
  }

  /** Watch story files for changes. Returns a disposable. */
  watch(onChange: (key: string) => void): vscode.Disposable {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(this.storiesDir),
      "**/state.json",
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const handle = (uri: vscode.Uri) => {
      onChange(path.basename(path.dirname(uri.fsPath)).toUpperCase());
    };
    const subs = [
      watcher.onDidChange(handle),
      watcher.onDidCreate(handle),
      watcher.onDidDelete(handle),
    ];
    return { dispose: () => { watcher.dispose(); subs.forEach((s) => s.dispose()); } };
  }
}
