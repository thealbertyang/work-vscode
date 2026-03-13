import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { JiraClient, JiraIssue } from "./jiraClient";
import { issueUri } from "./agentDecorationProvider";
import { VSCODE_COMMANDS } from "../../../../shared/contracts";
import { LocalStoryReader } from "../local/local-story-reader";

const ISSUE_TYPE_ICONS: Record<string, string> = {
  bug: "bug",
  story: "book",
  epic: "star-full",
  task: "tasklist",
  subtask: "list-tree",
  "sub-task": "list-tree",
  initiative: "rocket",
  feature: "lightbulb",
};

function issueIcon(issueType: string, status: string): vscode.ThemeIcon {
  const icon = ISSUE_TYPE_ICONS[issueType.toLowerCase()] ?? "issues";
  return new vscode.ThemeIcon(icon, statusColor(status));
}

function statusColor(status: string): vscode.ThemeColor {
  const s = status.toLowerCase();
  if (s.includes("done") || s.includes("closed") || s.includes("resolved")) {
    return new vscode.ThemeColor("charts.green");
  }
  if (s.includes("progress") || s.includes("active") || s.includes("started")) {
    return new vscode.ThemeColor("charts.blue");
  }
  if (s.includes("block")) return new vscode.ThemeColor("charts.red");
  if (s.includes("review") || s.includes("testing")) return new vscode.ThemeColor("charts.yellow");
  return new vscode.ThemeColor("foreground");
}

type AgentSession = {
  sessionName: string;
  windows: number;
  attachedClients: number;
};

type AgentSessionsLoad = {
  sessions: AgentSession[];
  unavailableReason?: string;
};

type TreeNode = IssueItem | StoryAgentSummaryItem | AgentSessionItem | AgentInfoItem;

type StorySessionSelection = {
  visible: AgentSession[];
  hiddenDetached: number;
  hiddenOverflow: number;
};

const TMUX_BIN_CANDIDATES = [
  "tmux",
  "/opt/homebrew/bin/tmux",
  "/usr/local/bin/tmux",
];

const DEFAULT_MAX_SESSIONS_PER_STORY = 4;

function runTmuxListSessions(tmuxBin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      tmuxBin,
      ["list-sessions", "-F", "#{session_name}\t#{session_windows}\t#{session_attached}"],
      { timeout: 1200, windowsHide: true },
      (error, stdout) => {
        if (error) {
          // ENOENT = binary not found → try next candidate
          if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            reject(error);
            return;
          }
          // Exit code 1 with no stdout = "no server running" / no sessions.
          // tmux binary exists and works, just nothing to list.
          if (!stdout?.trim()) {
            resolve("");
            return;
          }
        }
        resolve(stdout);
      },
    );
  });
}

function parseSessions(raw: string): AgentSession[] {
  const deduped = new Map<string, AgentSession>();
  for (const line of raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    const parts = line.split("\t");
    if (parts.length < 3 || !parts[0].startsWith("agents-")) continue;

    const session = {
      sessionName: parts[0],
      windows: Number.parseInt(parts[1] ?? "0", 10) || 0,
      attachedClients: Number.parseInt(parts[2] ?? "0", 10) || 0,
    };

    const existing = deduped.get(session.sessionName);
    if (
      !existing
      || session.attachedClients > existing.attachedClients
      || session.windows > existing.windows
    ) {
      deduped.set(session.sessionName, session);
    }
  }

  return Array.from(deduped.values()).sort(compareSessions);
}

async function loadOnlineAgentSessions(): Promise<AgentSessionsLoad> {
  let lastError: unknown;
  for (const candidate of TMUX_BIN_CANDIDATES) {
    try {
      const raw = await runTmuxListSessions(candidate);
      return { sessions: parseSessions(raw) };
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "tmux unavailable";
  return { sessions: [], unavailableReason: message };
}

function explorerShowDetachedSessions(): boolean {
  return vscode.workspace
    .getConfiguration("work")
    .get<boolean>("explorer.showDetachedSessions", false);
}

function explorerMaxSessionsPerStory(): number {
  const configured = vscode.workspace
    .getConfiguration("work")
    .get<number>("explorer.maxSessionsPerStory", DEFAULT_MAX_SESSIONS_PER_STORY);
  if (!Number.isFinite(configured)) return DEFAULT_MAX_SESSIONS_PER_STORY;
  return Math.max(1, Math.min(20, Math.floor(configured)));
}

function selectStorySessions(sessions: AgentSession[]): StorySessionSelection {
  const showDetached = explorerShowDetachedSessions();
  const maxSessions = explorerMaxSessionsPerStory();
  const filtered = showDetached
    ? sessions
    : sessions.filter((session) => session.attachedClients > 0);
  const hiddenDetached = showDetached ? 0 : Math.max(0, sessions.length - filtered.length);
  const visible = filtered.slice(0, maxSessions);
  const hiddenOverflow = Math.max(0, filtered.length - visible.length);
  return { visible, hiddenDetached, hiddenOverflow };
}

export class WorkspaceIssuesProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly client: JiraClient,
    private readonly storyReader?: LocalStoryReader,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (
      element instanceof AgentSessionItem
      || element instanceof AgentInfoItem
    ) return [];

    if (element instanceof StoryAgentSummaryItem) {
      return element.sessions.map((session) => new AgentSessionItem(session));
    }

    if (element instanceof IssueItem) {
      if (element.tmuxUnavailableReason) {
        return [new AgentInfoItem(`tmux unavailable: ${element.tmuxUnavailableReason}`)];
      }
      if (element.sessions.length === 0) {
        return [new AgentInfoItem("No agent activity", element.issue, true)];
      }
      const selection = selectStorySessions(element.sessions);
      if (selection.visible.length === 0) {
        const hidden = selection.hiddenDetached + selection.hiddenOverflow;
        const label = hidden > 0
          ? `No attached agent activity · ${hidden} hidden`
          : "No agent activity";
        return [new AgentInfoItem(label, element.issue, true)];
      }
      const hiddenCount = selection.hiddenDetached + selection.hiddenOverflow;
      return [
        new StoryAgentSummaryItem(
          element.issue,
          selection.visible,
          element.sessions.length,
          hiddenCount,
        ),
      ];
    }

    // Root: stories (Jira preferred, local snapshots fallback)
    const [issuesResult, sessionsResult] = await Promise.allSettled([
      this.client.searchMyOpenSprintIssues(),
      loadOnlineAgentSessions(),
    ]);

    let issues: JiraIssue[] = [];
    if (issuesResult.status === "fulfilled") {
      issues = issuesResult.value;
    } else {
      const error = issuesResult.reason;
      const message = error instanceof Error ? error.message : "Unknown error";
      vscode.window.showErrorMessage(`Failed to load Work stories: ${message}`);
    }

    if (issues.length === 0) {
      const localStories = this.storyReader?.readAll() ?? [];
      issues = localStories.map((story) => ({
        key: story.key,
        summary: story.summary,
        status: story.status,
        issueType: "story",
        project: story.projectKey || story.key.split("-")[0] || "",
        assignee: story.assignee ?? null,
      }));
    }

    const sessionsLoad: AgentSessionsLoad = sessionsResult.status === "fulfilled"
      ? sessionsResult.value
      : { sessions: [], unavailableReason: "failed to query sessions" };

    const sessionsByStory = new Map<string, AgentSession[]>();
    for (const session of sessionsLoad.sessions) {
      const key = extractWorkKeyFromSession(session.sessionName);
      if (!key) continue;
      const list = sessionsByStory.get(key) ?? [];
      list.push(session);
      sessionsByStory.set(key, list);
    }

    const rows = issues.map((issue) => ({
      issue,
      sessions: sessionsByStory.get(issue.key.toUpperCase()) ?? [],
    }));

    rows.sort((a, b) => {
      const aAttached = attachedCount(a.sessions);
      const bAttached = attachedCount(b.sessions);
      if (aAttached !== bAttached) return bAttached - aAttached;

      if (a.sessions.length !== b.sessions.length) return b.sessions.length - a.sessions.length;

      const aRank = statusRank(a.issue.status);
      const bRank = statusRank(b.issue.status);
      if (aRank !== bRank) return aRank - bRank;

      return a.issue.key.localeCompare(b.issue.key);
    });

    return rows.map(({ issue, sessions }) =>
      new IssueItem(issue, sessions, sessionsLoad.unavailableReason));
  }
}

function trimAgentsPrefix(sessionName: string): string {
  return sessionName.replace(/^agents-/, "");
}

function compareSessions(a: AgentSession, b: AgentSession): number {
  if (a.attachedClients !== b.attachedClients) return b.attachedClients - a.attachedClients;
  if (a.windows !== b.windows) return b.windows - a.windows;
  return a.sessionName.localeCompare(b.sessionName);
}

function attachedCount(sessions: AgentSession[]): number {
  return sessions.filter((s) => s.attachedClients > 0).length;
}

function statusRank(status: string): number {
  const lower = status.toLowerCase();
  if (lower.includes("progress") || lower.includes("active") || lower.includes("started")) return 0;
  if (lower.includes("review") || lower.includes("test")) return 1;
  if (lower.includes("todo") || lower.includes("to do") || lower.includes("backlog")) return 2;
  if (lower.includes("block")) return 3;
  if (lower.includes("done") || lower.includes("closed") || lower.includes("resolved")) return 4;
  return 5;
}

function extractWorkKeyFromSession(sessionName: string): string | null {
  const short = trimAgentsPrefix(sessionName).toUpperCase();
  const m = short.match(/([A-Z][A-Z0-9]{1,9}-\d{1,6})/);
  return m ? m[1] : null;
}

function extractRunnerFromSession(sessionName: string): string | null {
  const short = trimAgentsPrefix(sessionName).toLowerCase();
  const runner = short.match(/^(claude|codex|cursor|aider|agent)\b/);
  return runner ? runner[1] : null;
}

function runnerLabel(runner: string | null): string | null {
  if (!runner) return null;
  switch (runner) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "aider":
      return "Aider";
    case "agent":
      return "Agent";
    default:
      return runner;
  }
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 3))}...`;
}

function removeKnownParts(sessionName: string): string | null {
  const runner = extractRunnerFromSession(sessionName);
  const workKey = extractWorkKeyFromSession(sessionName)?.toLowerCase();

  let value = trimAgentsPrefix(sessionName);
  if (runner) value = value.replace(new RegExp(`^${runner}-`, "i"), "");
  if (workKey) value = value.replace(new RegExp(workKey, "i"), "");

  value = value.replace(/--+/g, "-").replace(/^-+|-+$/g, "").trim();
  return value ? truncate(value, 28) : null;
}

function formatSessionLabel(sessionName: string): string {
  const runner = runnerLabel(extractRunnerFromSession(sessionName));
  const workKey = extractWorkKeyFromSession(sessionName);

  if (runner && workKey) return `${runner} · ${workKey}`;
  if (runner) return runner;
  if (workKey) return workKey;
  return truncate(trimAgentsPrefix(sessionName), 46);
}

function formatSessionDescription(session: AgentSession): string {
  const state = session.attachedClients > 0 ? "attached" : "detached";
  const detail = removeKnownParts(session.sessionName);
  const parts = [state, `${session.windows}w`];
  if (detail) parts.push(detail);
  return parts.join(" · ");
}

function formatIssueDescription(issue: JiraIssue, sessions: AgentSession[]): string {
  if (sessions.length === 0) return issue.status;
  const attached = attachedCount(sessions);
  return `${issue.status} · ${attached}/${sessions.length} online`;
}

function trimSummary(summary: string): string {
  const compact = summary.replace(/\s+/g, " ").trim();
  return truncate(compact, 92);
}

export class AgentSessionItem extends vscode.TreeItem {
  constructor(public readonly session: AgentSession) {
    super(formatSessionLabel(session.sessionName), vscode.TreeItemCollapsibleState.None);
    const attached = session.attachedClients > 0;
    this.description = formatSessionDescription(session);
    this.iconPath = new vscode.ThemeIcon(
      "hubot",
      new vscode.ThemeColor(attached ? "charts.green" : "charts.blue"),
    );
    this.contextValue = "workAgentSession";
    this.tooltip = [
      session.sessionName,
      `${session.windows} window${session.windows === 1 ? "" : "s"}`,
      `${session.attachedClients} attached`,
    ].join(" · ");
    this.command = {
      command: VSCODE_COMMANDS.ATTACH_AGENT_SESSION,
      title: "Attach Agent Session",
      arguments: [session.sessionName],
    };
  }
}

export class StoryAgentSummaryItem extends vscode.TreeItem {
  constructor(
    public readonly issue: JiraIssue,
    public readonly sessions: AgentSession[],
    public readonly totalSessions: number,
    public readonly hiddenSessions: number,
  ) {
    super("Agent activity", vscode.TreeItemCollapsibleState.Collapsed);
    const sessionCount = sessions.length;
    const activeCount = attachedCount(sessions);
    const detachedCount = Math.max(0, sessionCount - activeCount);
    const totalWindows = sessions.reduce((sum, s) => sum + s.windows, 0);
    const hiddenDetail = hiddenSessions > 0 ? ` · ${hiddenSessions} hidden` : "";
    this.description = `${sessionCount}/${totalSessions} sessions · ${activeCount} attached · ${detachedCount} detached${hiddenDetail}`;
    this.iconPath = new vscode.ThemeIcon("pulse");
    this.tooltip = `${sessionCount} shown of ${totalSessions} sessions across ${totalWindows} tmux windows`;
    this.contextValue = "workAgentSummary";
  }
}

export class AgentInfoItem extends vscode.TreeItem {
  constructor(label: string, issue?: JiraIssue, interactive = false) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon("info");
    this.contextValue = interactive ? "workAgentInfoNoActivity" : "workAgentInfo";
    if (interactive && issue) {
      this.command = {
        command: VSCODE_COMMANDS.NEW_STORY_AGENT,
        title: "New Story Agent",
        arguments: [issue],
      };
      this.tooltip = "Start a new story agent";
    }
  }
}

export class IssueItem extends vscode.TreeItem {
  constructor(
    public readonly issue: JiraIssue,
    public readonly sessions: AgentSession[],
    public readonly tmuxUnavailableReason?: string,
  ) {
    super(`${issue.key}: ${trimSummary(issue.summary)}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = formatIssueDescription(issue, sessions);
    this.iconPath = issueIcon(issue.issueType, issue.status);
    // resourceUri links this item to the AgentDecorationProvider via the
    // workspace-issue:// scheme — enables the right-side agent badge.
    this.resourceUri = issueUri(issue.key);
    this.contextValue = "workIssue";
    this.tooltip = [
      issue.key,
      issue.status,
      issue.issueType,
      issue.assignee ?? null,
    ]
      .filter(Boolean)
      .join(" · ");
    this.command = {
      command: VSCODE_COMMANDS.OPEN_ISSUE,
      title: "Open Issue",
      arguments: [issue],
    };
  }
}
