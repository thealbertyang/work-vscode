import * as vscode from "vscode";
import { IDENTITIES } from "./policy/identities";
import { PermissionPolicy } from "./policy/permission-policy";
import { AgentDecorationProvider } from "./providers/data/jira/agentDecorationProvider";
import { JiraClient, JiraIssue } from "./providers/data/jira/jiraClient";
import {
  AgentSessionItem,
  IssueItem,
  StoryAgentSummaryItem,
  WorkAreaItem,
  WorkspaceIssuesProvider,
} from "./providers/data/jira/issueProvider";
import { LocalStoryReader } from "./providers/data/local/local-story-reader";
import { StorageService } from "./service/storage-service";
import { WorkspaceUriHandler } from "./service/uri-handler";
import { WorkMcpEventListener } from "./service/work-mcp-events";
import { buildAgentTerminalTitle, openOrReuseAgentTerminal, launchAgentDirectly, revealAgentSession } from "./service/agent-terminal";
import { spawnAgentViaWorkMcp } from "./service/work-mcp-client";
import { VSCODE_COMMANDS } from "../shared/contracts";

const LEGACY_START_TASK_TERMINAL_COMMANDS = [
  "atlassian.startDevTaskTerminal",
  "work.startDevTaskTerminal",
] as const;

type CommandHandler = (...args: unknown[]) => unknown;

function workspaceRoot(): string | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
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

function extractSessionSource(value: unknown): "tmux" | "terminal" | undefined {
  if (value instanceof AgentSessionItem) return value.session.source;
  if (!value || typeof value !== "object") return undefined;

  const direct = (value as { source?: unknown }).source;
  if (direct === "tmux" || direct === "terminal") return direct;

  const nested = (value as { session?: { source?: unknown } }).session?.source;
  return nested === "tmux" || nested === "terminal" ? nested : undefined;
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
  const cachedIssues = provider.getCachedIssues();
  if (cachedIssues.length > 0) {
    const picked = await vscode.window.showQuickPick(
      cachedIssues.map((issue) => ({
        label: issue.key,
        description: issue.status,
        detail: issue.summary,
        issue,
      })),
      {
        title: "Select Story",
        placeHolder: "Choose a story to manage",
        ignoreFocusOut: true,
      },
    );
    return picked?.issue ?? null;
  }

  const rows = await provider.getChildren();
  const issues: JiraIssue[] = [];
  for (const row of rows) {
    if (row instanceof IssueItem) {
      issues.push(row.issue);
      continue;
    }
    if (row instanceof WorkAreaItem) {
      const children = await provider.getChildren(row);
      issues.push(...children
        .filter((child): child is IssueItem => child instanceof IssueItem)
        .map((child) => child.issue));
    }
  }
  if (issues.length === 0) {
    vscode.window.showWarningMessage("No stories available to launch an agent.");
    return null;
  }

  const picked = await vscode.window.showQuickPick(
    issues.map((issue) => ({
      label: issue.key,
      description: issue.status,
      detail: issue.summary,
      issue,
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

  // "start" mode: cycle through existing terminals, spawn only if none exist.
  // "new" mode: always spawn a new terminal.
  if (mode === "start") {
    const result = await openOrReuseAgentTerminal({ tool: "claude", role: "worker", story, reuseOnly: true });
    if (result.ok) return;
  }

  try {
    // MCP spawns the agent and emits terminal:open via WS.
    // WorkMcpEventListener receives the event and calls OPEN_AGENT_TERMINAL,
    // which opens the terminal tab. No need to open it here too.
    await spawnAgentViaWorkMcp({
      tool: "claude",
      action: mode === "start" ? "continue" : "new",
      story,
      role: "worker",
    });
  } catch {
    // MCP unavailable — fall back to direct terminal launch
    launchAgentDirectly({ tool: "claude", role: "worker", story });
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
    const result = revealAgentSession({
      sessionName,
      source: extractSessionSource(input),
    });
    if (!result.ok) {
      vscode.window.showWarningMessage(
        result.error === "terminal_not_found"
          ? "Agent terminal is no longer running."
          : "Unable to reveal agent session.",
      );
    }
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

    console.log(`[work] OPEN_AGENT_TERMINAL called: tool=${tool} story=${story} session=${session} ts=${Date.now()}`);

    const result = await openOrReuseAgentTerminal({
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

  // ── Previously unregistered commands (declared in package.json, handlers in handlers/) ──
  registerCommandSafely(context, VSCODE_COMMANDS.OPEN_APP, async () => {
    const root = workspaceRoot();
    if (!root) { vscode.window.showWarningMessage("No workspace folder open."); return; }
    const panel = vscode.window.createWebviewPanel("workApp", "Work", vscode.ViewColumn.One, { enableScripts: true });
    panel.webview.html = "<html><body><h1>Work App</h1><p>Loading...</p></body></html>";
  });
  registerCommandSafely(context, VSCODE_COMMANDS.LOGIN, async () => {
    vscode.window.showInformationMessage("Work: Login — configure JIRA credentials in .env.local");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.LOGOUT, async () => {
    vscode.window.showInformationMessage("Work: Logged out");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.RUN_DEV_WEBVIEW, async () => {
    const terminal = vscode.window.createTerminal({ name: "Work Webview Dev" });
    terminal.sendText("cd repos/work/vscode && bun run dev:webview");
    terminal.show();
  });
  registerCommandSafely(context, VSCODE_COMMANDS.RESTART_EXTENSION_HOST, async () => {
    await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.RELOAD_WEBVIEWS, async () => {
    vscode.window.showInformationMessage("Work: Webviews reloaded");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.SYNC_ENV_TO_SETTINGS, async () => {
    vscode.window.showInformationMessage("Work: Sync .env.local to settings — use mise run agents:setup");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.REINSTALL_EXTENSION, async () => {
    const terminal = vscode.window.createTerminal({ name: "Work Reinstall" });
    terminal.sendText("mise run work:ext:install");
    terminal.show();
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
    const mcpEvents = new WorkMcpEventListener({
      onTerminalOpen: () => provider?.refresh(),
    });
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
