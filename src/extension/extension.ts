import * as vscode from "vscode";
import { IDENTITIES } from "./policy/identities";
import { PermissionPolicy } from "./policy/permission-policy";
import { AgentDecorationProvider } from "./providers/data/jira/agentDecorationProvider";
import { JiraClient, JiraIssue } from "./providers/data/jira/jiraClient";
import {
  AgentSessionItem,
  IssueItem,
  StoryAgentSummaryItem,
  WorkspaceIssuesProvider,
} from "./providers/data/jira/issueProvider";
import { LocalStoryReader } from "./providers/data/local/local-story-reader";
import { StorageService } from "./service/storage-service";
import { WorkspaceUriHandler } from "./service/uri-handler";
import { WorkMcpEventListener } from "./service/work-mcp-events";
import { buildAgentTerminalTitle, openOrReuseAgentTerminal } from "./service/agent-terminal";
import { spawnAgentViaWorkMcp } from "./service/work-mcp-client";
import { VSCODE_COMMANDS } from "../shared/contracts";

const LEGACY_START_TASK_TERMINAL_COMMANDS = [
  "atlassian.startDevTaskTerminal",
  "work.startDevTaskTerminal",
] as const;

type CommandHandler = (...args: unknown[]) => unknown;
const ATTACH_SHELL = "/bin/sh";

function workspaceRoot(): string | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sanitizeSegment(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._:/-]/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.:/]+|[-_.:/]+$/g, "");
}

function isIssue(value: unknown): value is JiraIssue {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<JiraIssue>;
  return (
    typeof maybe.key === "string"
    && typeof maybe.summary === "string"
    && typeof maybe.status === "string"
    && typeof maybe.issueType === "string"
  );
}

function extractIssue(value: unknown): JiraIssue | null {
  if (value instanceof IssueItem) return value.issue;
  if (value instanceof StoryAgentSummaryItem) return value.issue;
  if (isIssue(value)) return value;

  if (value && typeof value === "object" && "issue" in value) {
    const maybeIssue = (value as { issue?: unknown }).issue;
    if (isIssue(maybeIssue)) return maybeIssue;
  }
  return null;
}

function extractSessionName(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value instanceof AgentSessionItem) return value.session.sessionName;
  if (!value || typeof value !== "object") return null;

  const direct = (value as { sessionName?: unknown }).sessionName;
  if (typeof direct === "string") return direct;

  const nested = (value as { session?: { sessionName?: unknown } }).session?.sessionName;
  return typeof nested === "string" ? nested : null;
}

function normalizeStringField(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeAgentTerminalInput(
  input: unknown,
): {
  tool: string;
  role: string;
  story: string;
  session: string;
  windowIndex?: string;
} {
  const params = (input && typeof input === "object") ? input as Record<string, unknown> : {};
  return {
    tool: (normalizeStringField(params.tool) ?? "claude").toUpperCase(),
    role: normalizeStringField(params.role) ?? "worker",
    story: normalizeStringField(params.story) ?? "work",
    session: normalizeStringField(params.session) ?? "",
    windowIndex: normalizeStringField(params.windowIndex ?? params.window),
  };
}

function issueStorySlug(issue: JiraIssue): string {
  const base = sanitizeSegment(`${issue.key}-${issue.summary}`).toLowerCase();
  return base || issue.key.toLowerCase();
}

async function pickIssue(provider: WorkspaceIssuesProvider): Promise<JiraIssue | null> {
  const rows = await provider.getChildren();
  const issues = rows.filter((row): row is IssueItem => row instanceof IssueItem);
  if (issues.length === 0) {
    vscode.window.showWarningMessage("No stories available to launch an agent.");
    return null;
  }

  const picked = await vscode.window.showQuickPick(
    issues.map((item) => ({
      label: item.issue.key,
      description: item.issue.status,
      detail: item.issue.summary,
      issue: item.issue,
    })),
    {
      title: "Select Story",
      placeHolder: "Choose a story to manage",
      ignoreFocusOut: true,
    },
  );
  return picked?.issue ?? null;
}

async function openIssueInBrowser(client: JiraClient, issue: JiraIssue): Promise<void> {
  const url = await client.getIssueUrl(issue.key);
  if (!url) {
    vscode.window.showWarningMessage("Sign in to Work/Jira before opening issues.");
    return;
  }
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

async function launchStoryAgent(
  provider: WorkspaceIssuesProvider,
  issueInput: unknown,
  mode: "start" | "new",
): Promise<void> {
  if (!workspaceRoot()) {
    vscode.window.showWarningMessage("Open a workspace folder before launching story agents.");
    return;
  }

  const issue = extractIssue(issueInput) ?? await pickIssue(provider);
  if (!issue) return;

  const story = issueStorySlug(issue);
  const title = buildAgentTerminalTitle({ tool: "claude", role: "worker", story });
  if (mode === "start") {
    const existing = vscode.window.terminals.find((terminal) =>
      terminal.name === title || terminal.name.startsWith(`${title} | `),
    );
    if (existing) {
      existing.show(true);
      return;
    }
  }

  const action = mode === "start" ? "continue" : "new";

  try {
    const spawned = await spawnAgentViaWorkMcp({
      tool: "claude",
      action,
      story,
      role: "worker",
    });
    const result = openOrReuseAgentTerminal({
      tool: spawned.tool,
      role: spawned.role,
      story: spawned.story,
      session: spawned.tmuxSession,
      windowIndex: spawned.tmuxWindowIndex,
    });
    if (!result.ok) {
      vscode.window.showWarningMessage("Open a workspace folder before spawning agent terminals.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`Failed to launch story agent for ${issue.key}: ${message}`);
  }
}

function registerCommandSafely(
  context: vscode.ExtensionContext,
  id: string,
  handler: CommandHandler,
): void {
  try {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  } catch (error) {
    console.error(`[work] Failed to register command "${id}"`, error);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  let provider: WorkspaceIssuesProvider | undefined;
  let client: JiraClient | undefined;

  const requireProvider = (): WorkspaceIssuesProvider | null => {
    if (provider) return provider;
    vscode.window.showWarningMessage("Work view is still initializing. Try again in a second.");
    return null;
  };

  const requireClient = (): JiraClient | null => {
    if (client) return client;
    vscode.window.showWarningMessage("Work client is not ready. Check extension logs.");
    return null;
  };

  registerCommandSafely(context, VSCODE_COMMANDS.REFRESH, () => {
    const ready = requireProvider();
    if (!ready) return;
    ready.refresh();
  });
  registerCommandSafely(context, VSCODE_COMMANDS.REFRESH_STORY_TASKS, () => {
    const ready = requireProvider();
    if (!ready) return;
    ready.refresh();
  });
  registerCommandSafely(context, VSCODE_COMMANDS.OPEN_ISSUE, async (input?: unknown) => {
    const jira = requireClient();
    if (!jira) return;

    const issue = extractIssue(input);
    if (issue) {
      await openIssueInBrowser(jira, issue);
      return;
    }

    const ready = requireProvider();
    if (!ready) return;
    const picked = await pickIssue(ready);
    if (!picked) return;
    await openIssueInBrowser(jira, picked);
  });
  registerCommandSafely(context, VSCODE_COMMANDS.ATTACH_AGENT_SESSION, async (input?: unknown) => {
    const sessionName = extractSessionName(input);
    if (!sessionName) {
      vscode.window.showWarningMessage("Select an agent session to attach.");
      return;
    }
    const rootPath = workspaceRoot() ?? undefined;
    const terminal = vscode.window.createTerminal({
      name: `Agent: ${sessionName.replace(/^agents-/, "")}`,
      cwd: rootPath,
      shellPath: ATTACH_SHELL,
      shellArgs: ["-c", `exec tmux attach-session -t ${shellQuote(sessionName)}`],
    });
    terminal.show(true);
  });
  registerCommandSafely(context, VSCODE_COMMANDS.START_STORY_AGENT, async (input?: unknown) => {
    const ready = requireProvider();
    if (!ready) return;
    await launchStoryAgent(ready, input, "start");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.NEW_STORY_AGENT, async (input?: unknown) => {
    const ready = requireProvider();
    if (!ready) return;
    await launchStoryAgent(ready, input, "new");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.START_TASK_TERMINAL, async (input?: unknown) => {
    const ready = requireProvider();
    if (!ready) return;
    await launchStoryAgent(ready, input, "new");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.OPEN_AGENT_TERMINAL, async (input?: unknown) => {
    const {
      tool,
      role,
      story,
      session,
      windowIndex,
    } = normalizeAgentTerminalInput(input);

    const result = openOrReuseAgentTerminal({
      tool,
      role,
      story,
      session,
      windowIndex,
    });
    if (!result.ok) {
      vscode.window.showWarningMessage("Open a workspace folder before spawning agent terminals.");
    }
  });
  registerCommandSafely(context, VSCODE_COMMANDS.OPEN_AGENT_CHAT, async () => {
    await vscode.commands.executeCommand("workbench.action.chat.open");
  });

  for (const legacyCommandId of LEGACY_START_TASK_TERMINAL_COMMANDS) {
    registerCommandSafely(context, legacyCommandId, async (input?: unknown) => {
      await vscode.commands.executeCommand(VSCODE_COMMANDS.START_TASK_TERMINAL, input);
    });
  }

  try {
    const storage = new StorageService(context, "work");
    const policy = new PermissionPolicy();
    client = new JiraClient(context, storage, policy, IDENTITIES.HUMAN_OWNER);
    const root = workspaceRoot();
    const storyReader = root ? new LocalStoryReader(root) : undefined;

    provider = new WorkspaceIssuesProvider(client, storyReader);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider("workIssues", provider),
    );
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("work.explorer.showDetachedSessions")
          || event.affectsConfiguration("work.explorer.maxSessionsPerStory")
        ) {
          provider?.refresh();
        }
      }),
    );

    // Register URI handler for deep links and terminal actions
    // e.g. vscode-insiders://albertyang.work/terminal?session=X&window=Y
    const uriHandler = new WorkspaceUriHandler({
      showApp: async () => {},
      navigate: async () => {},
    });
    context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

    // Connect to WorkMCP WS to receive terminal:open events
    const mcpEvents = new WorkMcpEventListener();
    mcpEvents.start();
    context.subscriptions.push(mcpEvents);

    if (storyReader) {
      const decorations = new AgentDecorationProvider(storyReader);
      decorations.startWatching();
      context.subscriptions.push(decorations);
      context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorations));
      context.subscriptions.push(storyReader.watch(() => provider?.refresh()));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[work] Activation failed", error);
    vscode.window.showErrorMessage(`Work activation failed: ${message}`);
  }
}

export function deactivate(): void {
  // Disposables are cleaned up automatically via context.subscriptions
}
