import * as vscode from "vscode";
import { execFile } from "node:child_process";
import type { DelegationIndexItem, WorkDelegationProjection } from "work-shared/domain/delegation";
import { JiraClient, JiraIssue } from "./jiraClient";
import { issueUri } from "./agentDecorationProvider";
import { VSCODE_COMMANDS } from "../../../../shared/contracts";
import { LocalStoryReader } from "../local/local-story-reader";
import { fetchWorkDelegationProjection } from "../../../service/work-mcp-client";
import {
  delegationSummaryLabel,
  explorerAreaLabel,
  explorerSourceLabel,
  type ExplorerIssueRow,
  mergeExplorerIssueRows,
} from "../work/delegation-rows";
import { collectPickerIssues } from "./issue-picker";

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
  source: "tmux" | "terminal";
};

type AgentSessionsLoad = {
  sessions: AgentSession[];
  unavailableReason?: string;
};

type TreeNode =
  | AgentsRootItem
  | WorkAreaItem
  | IssueItem
  | StoryAgentSummaryItem
  | AgentSessionItem
  | AgentInfoItem
  | DelegationInfoItem;

type StorySessionSelection = {
  visible: AgentSession[];
  hiddenDetached: number;
  hiddenOverflow: number;
};

type ExplorerRowWithSessions = ExplorerIssueRow & {
  sessions: AgentSession[];
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
      source: "tmux" as const,
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

function parseLiveTerminalSessions(): AgentSession[] {
  return vscode.window.terminals.flatMap((terminal) => {
    if (terminal.exitStatus) return [];
    const runner = extractRunnerFromSession(terminal.name);
    const workKey = extractWorkKeyFromSession(terminal.name);
    if (!runner || !workKey) return [];

    return [{
      sessionName: terminal.name,
      windows: 1,
      attachedClients: 1,
      source: "terminal" as const,
    }];
  });
}

function mergeAgentSessions(tmuxSessions: AgentSession[], terminalSessions: AgentSession[]): AgentSession[] {
  if (terminalSessions.length === 0) return tmuxSessions;

  const merged = [...tmuxSessions];
  for (const terminalSession of terminalSessions) {
    const terminalKey = extractWorkKeyFromSession(terminalSession.sessionName);
    const terminalRunner = extractRunnerFromSession(terminalSession.sessionName);
    const hasAttachedTmuxMatch = tmuxSessions.some((tmuxSession) =>
      tmuxSession.attachedClients > 0
      && extractWorkKeyFromSession(tmuxSession.sessionName) === terminalKey
      && extractRunnerFromSession(tmuxSession.sessionName) === terminalRunner
    );
    if (!hasAttachedTmuxMatch) {
      merged.push(terminalSession);
    }
  }

  return merged.sort(compareSessions);
}

async function loadOnlineAgentSessions(): Promise<AgentSessionsLoad> {
  const terminalSessions = parseLiveTerminalSessions();
  let lastError: unknown;
  for (const candidate of TMUX_BIN_CANDIDATES) {
    try {
      const raw = await runTmuxListSessions(candidate);
      return { sessions: mergeAgentSessions(parseSessions(raw), terminalSessions) };
    } catch (error) {
      lastError = error;
    }
  }
  const message = lastError instanceof Error ? lastError.message : "tmux unavailable";
  return { sessions: terminalSessions, unavailableReason: message };
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
  private pickerIssues: JiraIssue[] = [];
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly client: JiraClient,
    private readonly storyReader?: LocalStoryReader,
  ) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getCachedIssues(): JiraIssue[] {
    return [...this.pickerIssues];
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    if (element instanceof AgentsRootItem) {
      if (element.onlineSessions.length === 0) {
        const label = element.tmuxUnavailableReason
          ? `tmux unavailable: ${element.tmuxUnavailableReason}`
          : element.detachedCount > 0
            ? `No online agents · ${element.detachedCount} detached`
            : "No online agents";
        return [new AgentInfoItem(label)];
      }
      return element.onlineSessions.map((session) => new AgentSessionItem(session));
    }

    if (
      element instanceof WorkAreaItem
    ) {
      return element.rows.map(({ issue, delegation, source }) =>
        new IssueItem(
          issue,
          element.sessionsByStory.get(issue.key.toUpperCase()) ?? [],
          element.tmuxUnavailableReason,
          delegation,
          source,
        ));
    }

    if (
      element instanceof AgentSessionItem
      || element instanceof AgentInfoItem
      || element instanceof DelegationInfoItem
    ) return [];

    if (element instanceof StoryAgentSummaryItem) {
      return element.sessions.map((session) => new AgentSessionItem(session));
    }

    if (element instanceof IssueItem) {
      const children: TreeNode[] = [];
      if (element.delegation) {
        children.push(new DelegationInfoItem(element.delegation));
      }
      if (element.sessions.length === 0) {
        const label = element.tmuxUnavailableReason
          ? `No agent activity · tmux unavailable: ${element.tmuxUnavailableReason}`
          : "No agent activity";
        children.push(new AgentInfoItem(label, element.issue, true));
        return children;
      }
      const selection = selectStorySessions(element.sessions);
      if (selection.visible.length === 0) {
        const hidden = selection.hiddenDetached + selection.hiddenOverflow;
        const label = hidden > 0
          ? `No attached agent activity · ${hidden} hidden`
          : "No agent activity";
        children.push(new AgentInfoItem(label, element.issue, true));
        return children;
      }
      const hiddenCount = selection.hiddenDetached + selection.hiddenOverflow;
      children.push(
        new StoryAgentSummaryItem(
          element.issue,
          selection.visible,
          element.sessions.length,
          hiddenCount,
        ),
      );
      return children;
    }

    // Root: canonical Work delegations first, Jira enrichment second, local snapshots fallback.
    const localStories = this.storyReader?.readAll() ?? [];
    const [delegationsResult, issuesResult, sessionsResult] = await Promise.allSettled([
      fetchWorkDelegationProjection({ timeoutMs: 1_200 }),
      this.client.searchMyOpenSprintIssues(),
      loadOnlineAgentSessions(),
    ]);

    let issues: JiraIssue[] = [];
    let delegations: WorkDelegationProjection | null = null;
    if (delegationsResult.status === "fulfilled") {
      delegations = delegationsResult.value;
    }
    if (issuesResult.status === "fulfilled") {
      issues = issuesResult.value;
    } else {
      const error = issuesResult.reason;
      const message = error instanceof Error ? error.message : "Unknown error";
      if (!delegations?.index.length && localStories.length === 0) {
        vscode.window.showErrorMessage(`Failed to load Work stories: ${message}`);
      }
    }

    if (!delegations?.index.length && issues.length === 0) {
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

    const explorerRows = mergeExplorerIssueRows({
      delegations,
      jiraIssues: issues,
      localStories,
    });

    const rows: ExplorerRowWithSessions[] = explorerRows.map((row) => ({
      ...row,
      sessions: sessionsByStory.get(row.issue.key.toUpperCase()) ?? [],
    }));

    const grouped = new Map<"work" | "personal", GroupedExplorerRows>();
    for (const row of rows) {
      const bucket = grouped.get(row.area) ?? { area: row.area, rows: [] };
      bucket.rows.push(row);
      grouped.set(row.area, bucket);
    }

    const sortRows = (a: ExplorerRowWithSessions, b: ExplorerRowWithSessions) => {
      const aAttached = attachedCount(a.sessions);
      const bAttached = attachedCount(b.sessions);
      if (aAttached !== bAttached) return bAttached - aAttached;

      if (a.sessions.length !== b.sessions.length) return b.sessions.length - a.sessions.length;

      const aRank = statusRank(a.issue.status);
      const bRank = statusRank(b.issue.status);
      if (aRank !== bRank) return aRank - bRank;

      return a.issue.key.localeCompare(b.issue.key);
    };

    for (const bucket of grouped.values()) {
      bucket.rows.sort(sortRows);
    }

    this.pickerIssues = collectPickerIssues(
      (["work", "personal"] as const)
        .map((area) => grouped.get(area))
        .flatMap((bucket) => bucket?.rows ?? []),
    );

    const rootNodes: TreeNode[] = [
      new AgentsRootItem(sessionsLoad.sessions, sessionsLoad.unavailableReason),
      ...( ["work", "personal"] as const)
      .map((area) => grouped.get(area))
      .filter((bucket): bucket is GroupedExplorerRows => Boolean(bucket && bucket.rows.length > 0))
      .map((bucket) => new WorkAreaItem(bucket.area, bucket.rows, sessionsByStory, sessionsLoad.unavailableReason)),
    ];

    return rootNodes;
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
  if (session.source === "terminal") {
    return "online · direct terminal";
  }
  const state = session.attachedClients > 0 ? "attached" : "detached";
  const detail = removeKnownParts(session.sessionName);
  const parts = [state, `${session.windows}w`];
  if (detail) parts.push(detail);
  return parts.join(" · ");
}

function formatIssueDescription(
  issue: JiraIssue,
  sessions: AgentSession[],
  delegation?: DelegationIndexItem | null,
  source?: ExplorerIssueRow["source"],
): string {
  const statusParts = [issue.status];
  const sourceLabel = source ? explorerSourceLabel(source) : null;
  if (sourceLabel) {
    statusParts.push(sourceLabel);
  }
  if (delegation) {
    statusParts.push(delegationSummaryLabel(delegation));
  }
  if (sessions.length === 0) return statusParts.join(" · ");
  const attached = attachedCount(sessions);
  statusParts.push(`${attached}/${sessions.length} online`);
  return statusParts.join(" · ");
}

function trimSummary(summary: string): string {
  const compact = summary.replace(/\s+/g, " ").trim();
  return truncate(compact, 92);
}

export class AgentSessionItem extends vscode.TreeItem {
  constructor(public readonly session: AgentSession) {
    super(formatSessionLabel(session.sessionName), vscode.TreeItemCollapsibleState.None);
    this.id = `agent-session:${session.sessionName}`;
    const attached = session.attachedClients > 0;
    this.description = formatSessionDescription(session);
    this.iconPath = new vscode.ThemeIcon(
      "hubot",
      new vscode.ThemeColor(attached ? "charts.green" : "charts.blue"),
    );
    this.contextValue = "workAgentSession";
    this.tooltip = [
      session.sessionName,
      session.source === "terminal" ? "live VS Code terminal" : null,
      `${session.windows} window${session.windows === 1 ? "" : "s"}`,
      `${session.attachedClients} attached`,
    ]
      .filter(Boolean)
      .join(" · ");
    this.command = {
      command: VSCODE_COMMANDS.ATTACH_AGENT_SESSION,
      title: session.source === "terminal" ? "Reveal Agent Terminal" : "Attach Agent Session",
      arguments: [session],
    };
  }
}

export class AgentsRootItem extends vscode.TreeItem {
  public readonly onlineSessions: AgentSession[];
  public readonly detachedCount: number;

  constructor(
    sessions: AgentSession[],
    public readonly tmuxUnavailableReason?: string,
  ) {
    super("Agents", vscode.TreeItemCollapsibleState.Expanded);
    this.id = "agents-root";
    this.onlineSessions = sessions.filter((session) => session.attachedClients > 0);
    this.detachedCount = Math.max(0, sessions.length - this.onlineSessions.length);
    this.description = this.onlineSessions.length > 0 || this.detachedCount > 0
      ? this.detachedCount > 0
        ? `${this.onlineSessions.length} online · ${this.detachedCount} detached`
        : `${this.onlineSessions.length} online`
      : tmuxUnavailableReason
        ? "unavailable"
        : "0 online";
    this.iconPath = new vscode.ThemeIcon(
      "hubot",
      new vscode.ThemeColor(this.onlineSessions.length > 0 ? "charts.green" : "foreground"),
    );
    this.contextValue = "workAgents";
    this.tooltip = this.onlineSessions.length > 0 || this.detachedCount > 0
      ? `${this.onlineSessions.length} online, ${this.detachedCount} detached`
      : tmuxUnavailableReason
        ? `Agents unavailable · ${tmuxUnavailableReason}`
        : "No detected agent sessions";
  }
}

export class WorkAreaItem extends vscode.TreeItem {
  constructor(
    public readonly area: "work" | "personal",
    public readonly rows: ExplorerIssueRow[],
    public readonly sessionsByStory: Map<string, AgentSession[]>,
    public readonly tmuxUnavailableReason?: string,
  ) {
    super(explorerAreaLabel(area), vscode.TreeItemCollapsibleState.Expanded);
    this.id = `work-area:${area}`;
    const activeSessions = rows.reduce(
      (sum, row) => sum + attachedCount(sessionsByStory.get(row.issue.key.toUpperCase()) ?? []),
      0,
    );
    this.description = `${rows.length} item${rows.length === 1 ? "" : "s"}${activeSessions > 0 ? ` · ${activeSessions} online` : ""}`;
    this.iconPath = new vscode.ThemeIcon(area === "work" ? "briefcase" : "person");
    this.contextValue = `workArea.${area}`;
    this.tooltip = `${explorerAreaLabel(area)} stories`;
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
    this.id = `agent-summary:${issue.key}`;
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
    this.id = `agent-info:${issue?.key ?? "root"}`;
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

export class DelegationInfoItem extends vscode.TreeItem {
  constructor(public readonly delegation: DelegationIndexItem) {
    super("Delegation", vscode.TreeItemCollapsibleState.None);
    this.id = `delegation-info:${delegation.storyKey ?? delegation.workId}`;
    this.description = delegationSummaryLabel(delegation);
    this.iconPath = new vscode.ThemeIcon("tasklist");
    this.contextValue = "workDelegationInfo";
    this.tooltip = [
      delegation.storyKey,
      delegationSummaryLabel(delegation),
      `runtime=${delegation.primaryRuntime}`,
    ].join(" · ");
  }
}

export class IssueItem extends vscode.TreeItem {
  constructor(
    public readonly issue: JiraIssue,
    public readonly sessions: AgentSession[],
    public readonly tmuxUnavailableReason?: string,
    public readonly delegation?: DelegationIndexItem | null,
    public readonly source: ExplorerIssueRow["source"] = "jira",
  ) {
    super(`${issue.key}: ${trimSummary(issue.summary)}`, vscode.TreeItemCollapsibleState.Collapsed);
    this.id = `issue:${issue.key}`;
    this.description = formatIssueDescription(issue, sessions, delegation, source);
    this.iconPath = issueIcon(issue.issueType, issue.status);
    // resourceUri links this item to the AgentDecorationProvider via the
    // workspace-issue:// scheme — enables the right-side agent badge.
    this.resourceUri = issueUri(issue.key);
    this.contextValue = "workIssue";
    this.tooltip = [
      issue.key,
      issue.status,
      explorerSourceLabel(source),
      delegation ? delegationSummaryLabel(delegation) : null,
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
type GroupedExplorerRows = {
  area: "work" | "personal";
  rows: ExplorerRowWithSessions[];
};
