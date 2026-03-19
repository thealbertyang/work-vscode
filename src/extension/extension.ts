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
import { openWorkBrowser, refreshWorkBrowser } from "./service/integrated-browser";
import { VSCODE_COMMANDS } from "../shared/contracts";
import { log } from "./providers/data/jira/logger";

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
  phase?: string;
  session: string;
  windowIndex?: string;
} {
  const params = (input && typeof input === "object") ? input as Record<string, unknown> : {};
  return {
    tool: (normalizeStringField(params.tool) ?? "claude").toUpperCase(),
    role: normalizeStringField(params.role) ?? "worker",
    story: normalizeStringField(params.story) ?? "work",
    phase: normalizeStringField(params.phase),
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
  const { openUrl } = await import("./service/integrated-browser");
  await openUrl(url);
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

  const phase = issue.status?.toLowerCase().replace(/\s+/g, "-") || undefined;

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
    launchAgentDirectly({ tool: "claude", role: "worker", story, phase });
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
  // MCP status bar — first thing, before anything else can fail
  const mcpStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  mcpStatus.command = VSCODE_COMMANDS.OPEN_BROWSER;
  mcpStatus.text = "$(globe) Work";
  mcpStatus.tooltip = "Work MCP: initializing...";
  mcpStatus.show();
  context.subscriptions.push(mcpStatus);

  let provider: WorkspaceIssuesProvider | undefined;
  let client: JiraClient | undefined;
  let scheduledRefresh: ReturnType<typeof setTimeout> | null = null;

  const scheduleProviderRefresh = (): void => {
    if (scheduledRefresh) clearTimeout(scheduledRefresh);
    scheduledRefresh = setTimeout(() => {
      scheduledRefresh = null;
      provider?.refresh();
    }, 150);
  };
  context.subscriptions.push({
    dispose: () => {
      if (scheduledRefresh) clearTimeout(scheduledRefresh);
      scheduledRefresh = null;
    },
  });

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
  registerCommandSafely(context, VSCODE_COMMANDS.OPEN_BROWSER, async (input?: unknown) => {
    const target = typeof input === "string" || (input && typeof input === "object")
      ? input as string | { url?: string; path?: string; section?: string }
      : undefined;
    await openWorkBrowser(context, target);
  });
  registerCommandSafely(context, VSCODE_COMMANDS.REFRESH_BROWSER, async () => {
    await refreshWorkBrowser(context);
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
      phase,
      session,
      windowIndex,
    } = normalizeAgentTerminalInput(input);

    console.log(`[work] OPEN_AGENT_TERMINAL called: tool=${tool} story=${story} session=${session} ts=${Date.now()}`);

    const result = await openOrReuseAgentTerminal({
      tool,
      role,
      story,
      phase,
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

  // Launch an agent from a pre-built script file (written by work-agent or lifecycle spawn).
  // The script contains env exports + claude -p "prompt" — ready to source.
  registerCommandSafely(context, "work.launchAgentScript", async (input?: unknown) => {
    const args = (typeof input === "object" && input !== null) ? input as Record<string, unknown> : {};
    const scriptPath = typeof args.script === "string" ? args.script : "";
    const title = typeof args.title === "string" ? args.title : "Agent";

    if (!scriptPath) {
      vscode.window.showWarningMessage("work.launchAgentScript: no script path provided");
      return;
    }

    const root = workspaceRoot();
    const terminal = vscode.window.createTerminal({
      name: title,
      cwd: root || undefined,
      iconPath: new vscode.ThemeIcon("copilot-large"),
      color: new vscode.ThemeColor("terminal.ansiYellow"),
    });
    terminal.sendText(`source "${scriptPath}"`);
    terminal.show();
  });

  // Webview app template is intentionally disabled. The active extension surface is the
  // explorer + commands, and the dormant webview scaffold remains on disk for future work.
  registerCommandSafely(context, VSCODE_COMMANDS.LOGIN, async () => {
    vscode.window.showInformationMessage("Work: Login — configure JIRA credentials in .env.local");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.LOGOUT, async () => {
    vscode.window.showInformationMessage("Work: Logged out");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.RESTART_EXTENSION_HOST, async () => {
    await vscode.commands.executeCommand("workbench.action.restartExtensionHost");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.SYNC_ENV_TO_SETTINGS, async () => {
    vscode.window.showInformationMessage("Work: Sync .env.local to settings — use mise run agents:setup");
  });
  registerCommandSafely(context, VSCODE_COMMANDS.REINSTALL_EXTENSION, async () => {
    const terminal = vscode.window.createTerminal({ name: "Work Reinstall" });
    terminal.sendText("mise run work:ext:install");
    terminal.show();
  });

  // ── File-based IPC fallback for agent launch requests ──
  // Fallback when WS is disconnected. Producers write /tmp/work-agent-launch-*.json.
  // Extension picks them up, opens a VS Code terminal, and deletes the request.
  // JSON shape is generic — any key/value pairs are accepted. Required: `script`.
  {
    const fs = require("fs");
    const path = require("path");
    const LAUNCH_DIR = "/tmp";
    const LAUNCH_PREFIX = "work-agent-launch-";

    const launchTerminalFromRequest = (req: Record<string, unknown>) => {
      const script = req.script as string || "";
      if (!script) return;
      const title = (req.title as string) || "Agent";
      const root = workspaceRoot();
      const terminalOpts: vscode.TerminalOptions = {
        name: title,
        cwd: (req.cwd as string) || root || undefined,
        iconPath: new vscode.ThemeIcon((req.icon as string) || "copilot-large"),
        color: new vscode.ThemeColor((req.color as string) || "terminal.ansiYellow"),
      };
      if (req.env && typeof req.env === "object") {
        terminalOpts.env = req.env as Record<string, string>;
      }
      if (req.shell) {
        terminalOpts.shellPath = req.shell as string;
      }
      const terminal = vscode.window.createTerminal(terminalOpts);
      terminal.sendText(`source "${script}"`);
      terminal.show();
      console.log(`[work] launched terminal: ${title} (cwd: ${(req.cwd as string) || root || "default"})`);
    };

    const processLaunchRequests = () => {
      try {
        const files = fs.readdirSync(LAUNCH_DIR)
          .filter((f: string) => f.startsWith(LAUNCH_PREFIX) && f.endsWith(".json"));
        for (const file of files) {
          const fullPath = path.join(LAUNCH_DIR, file);
          try {
            const req = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
            launchTerminalFromRequest(req);
            fs.unlinkSync(fullPath);
          } catch {}
        }
      } catch {}
    };

    // Check on activation + every 2 seconds
    processLaunchRequests();
    const launchPoller = setInterval(processLaunchRequests, 2000);
    context.subscriptions.push({ dispose: () => clearInterval(launchPoller) });
  }

  for (const legacyCommandId of LEGACY_START_TASK_TERMINAL_COMMANDS) {
    registerCommandSafely(context, legacyCommandId, async (input?: unknown) => {
      await vscode.commands.executeCommand(VSCODE_COMMANDS.START_TASK_TERMINAL, input);
    });
  }

  // Wire MCP status bar updates
  const setMcpConnected = () => {
    mcpStatus.text = "$(check) Work";
    mcpStatus.tooltip = "Work MCP: connected";
    mcpStatus.backgroundColor = undefined;
    mcpStatus.command = VSCODE_COMMANDS.OPEN_BROWSER;
  };
  const setMcpDisconnected = () => {
    mcpStatus.text = "$(warning) Work";
    mcpStatus.tooltip = "Work MCP: disconnected — reconnecting...";
    mcpStatus.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
  };

  // Connect to WorkMCP WS — also before try/catch so it always reconnects
  const mcpEvents = new WorkMcpEventListener({
    onConnected: setMcpConnected,
    onDisconnected: setMcpDisconnected,
    onEvent: () => provider?.refresh(),
    onTerminalOpen: () => provider?.refresh(),
    onTerminalLaunch: (req) => {
      const terminalOpts: vscode.TerminalOptions = {
        name: req.title || "Agent",
        cwd: req.cwd || workspaceRoot() || undefined,
        iconPath: new vscode.ThemeIcon(req.icon || "copilot-large"),
        color: new vscode.ThemeColor(req.color || "terminal.ansiYellow"),
      };
      if (req.env) terminalOpts.env = req.env;
      if (req.shell) terminalOpts.shellPath = req.shell;
      const terminal = vscode.window.createTerminal(terminalOpts);
      terminal.sendText(`source "${req.script}"`);
      terminal.show();
      console.log(`[work] terminal:launch via WS: ${req.title}`);
      provider?.refresh();
    },
  });
  mcpEvents.start();
  context.subscriptions.push(mcpEvents);

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
          scheduleProviderRefresh();
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

    if (storyReader) {
      const decorations = new AgentDecorationProvider(storyReader);
      decorations.startWatching();
      context.subscriptions.push(decorations);
      context.subscriptions.push(vscode.window.registerFileDecorationProvider(decorations));
      context.subscriptions.push(storyReader.watch(() => scheduleProviderRefresh()));
    }

    // Event-driven refresh is the default. Polling remains available as an explicit
    // fallback for environments where WS/file events are unavailable.
    const refreshIntervalMs = vscode.workspace
      .getConfiguration("work")
      .get<number>("explorer.refreshIntervalMs", 0);
    if (refreshIntervalMs > 0) {
      const refreshTimer = setInterval(() => scheduleProviderRefresh(), refreshIntervalMs);
      context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
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
