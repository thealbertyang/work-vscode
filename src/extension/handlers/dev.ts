import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import {
  commands,
  workspace,
  window,
} from "vscode";
import { DEFAULT_WEBVIEW_PORT, REOPEN_APP_AFTER_RESTART_KEY } from "../constants";
import { getWebviewServerUrl } from "../providers/data/jira/jiraConfig";
import { toPromise } from "../util/to-promise";
import { resolveWebviewRoot } from "../webview/paths";
import {
  getServerPort,
  isLocalhostUrl,
  normalizeServerUrl,
  waitForServer,
} from "../webview/reachability";
import { getOrCreateWsBridgeToken } from "../service/ws-bridge-auth";
import type { HandlerDependencies } from "./types";
import type { ExtensionBuildWatcher } from "../service/extension-build-watcher";
import { buildViteEnvKeys } from "../../shared/app-identity";

type DevDependencies = Pick<
  HandlerDependencies,
  "context" |
    "storage" |
    "webviewServer" |
    "extensionInstaller" |
    "buildWatcher" |
    "showApp" |
    "refreshApp" |
    "closeApp"
>;

type AgentTool = "claude" | "codex";
type AgentAction = "continue-last" | "resume" | "fork-last" | "fork" | "new";
type AgentProgress = "todo" | "in-progress" | "blocked" | "done";
type AgentCategory = "feature" | "bugfix" | "research" | "refactor" | "ops" | "chore";
type AgentTmuxMode = "auto" | "off" | "window" | "pane";

type QuickPickChoice<T extends string> = {
  label: string;
  description: string;
  value: T;
};

const AGENT_TOOL_CHOICES: QuickPickChoice<AgentTool>[] = [
  { label: "Codex", description: "OpenAI Codex CLI", value: "codex" },
  { label: "Claude", description: "Claude Code CLI", value: "claude" },
];

const AGENT_ACTION_CHOICES: QuickPickChoice<AgentAction>[] = [
  { label: "Continue Last", description: "Continue the most recent session", value: "continue-last" },
  { label: "Resume", description: "Choose from session history", value: "resume" },
  { label: "Fork Last", description: "Fork from the latest session", value: "fork-last" },
  { label: "Fork", description: "Fork from session history", value: "fork" },
  { label: "New", description: "Start a brand-new session", value: "new" },
];

const AGENT_PROGRESS_CHOICES: QuickPickChoice<AgentProgress>[] = [
  { label: "IN-PROGRESS", description: "Active work", value: "in-progress" },
  { label: "TODO", description: "Queued", value: "todo" },
  { label: "BLOCKED", description: "Waiting on dependency", value: "blocked" },
  { label: "DONE", description: "Completed", value: "done" },
];

const AGENT_CATEGORY_CHOICES: QuickPickChoice<AgentCategory>[] = [
  { label: "Feature", description: "Feature development", value: "feature" },
  { label: "Bugfix", description: "Issue repair", value: "bugfix" },
  { label: "Research", description: "Discovery/investigation", value: "research" },
  { label: "Refactor", description: "Code quality improvements", value: "refactor" },
  { label: "Ops", description: "Environment or infra work", value: "ops" },
  { label: "Chore", description: "Maintenance tasks", value: "chore" },
];

const AGENT_TMUX_MODE_CHOICES: QuickPickChoice<AgentTmuxMode>[] = [
  { label: "Auto", description: "Use tmux if available", value: "auto" },
  { label: "Off", description: "Run directly in this terminal", value: "off" },
  { label: "Window", description: "Force a new tmux window", value: "window" },
  { label: "Pane", description: "Prefer a split pane in tmux", value: "pane" },
];

const WS_BRIDGE_TOKEN_VITE_KEYS = buildViteEnvKeys("WS_BRIDGE_TOKEN");

const DEFAULT_STORY = "work";
const DEFAULT_TAG = "";
const DEFAULT_CUSTOM_VARS = "";
const DEFAULT_TMUX_MODE: AgentTmuxMode = "auto";

const sanitizeSegment = (value: string): string => {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._:/-]/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.:/]+|[-_.:/]+$/g, "");
};

const shellQuote = (value: string): string => `'${value.replace(/'/g, `'\\''`)}'`;

const workspaceRoot = (): string | null => {
  const folder = workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
};

const launcherPath = (root: string): string => path.join(root, "scripts", "agent-launch.sh");

async function pickValue<T extends string>(
  title: string,
  placeHolder: string,
  choices: QuickPickChoice<T>[],
): Promise<T | null> {
  const picked = await window.showQuickPick(
    choices.map((choice) => ({
      label: choice.label,
      description: choice.description,
      value: choice.value,
    })),
    { title, placeHolder, ignoreFocusOut: true },
  );
  return picked?.value ?? null;
}

type AgentLaunchMetadata = {
  tool: AgentTool;
  action: AgentAction;
  story: string;
  progress: AgentProgress;
  category: AgentCategory;
  tag: string;
  customVars: string;
  tmuxMode: AgentTmuxMode;
};

async function collectAgentLaunchMetadata(): Promise<AgentLaunchMetadata | null> {
  const tool = await pickValue(
    "Agent Terminal",
    "Select tool",
    AGENT_TOOL_CHOICES,
  );
  if (!tool) return null;

  const action = await pickValue(
    "Agent Terminal",
    "Select action",
    AGENT_ACTION_CHOICES,
  );
  if (!action) return null;

  const storyInput = await window.showInputBox({
    title: "Agent Terminal",
    prompt: "Story or workstream (used in terminal title)",
    value: DEFAULT_STORY,
    ignoreFocusOut: true,
  });
  if (storyInput === undefined) return null;
  const story = sanitizeSegment(storyInput) || DEFAULT_STORY;

  const progress = await pickValue(
    "Agent Terminal",
    "Select progress state",
    AGENT_PROGRESS_CHOICES,
  );
  if (!progress) return null;

  const category = await pickValue(
    "Agent Terminal",
    "Select category",
    AGENT_CATEGORY_CHOICES,
  );
  if (!category) return null;

  const tagInput = await window.showInputBox({
    title: "Agent Terminal",
    prompt: "Optional tag for terminal title",
    value: DEFAULT_TAG,
    ignoreFocusOut: true,
  });
  if (tagInput === undefined) return null;
  const tag = sanitizeSegment(tagInput);

  const customVarsInput = await window.showInputBox({
    title: "Agent Terminal",
    prompt: "Optional custom vars: KEY=VALUE,KEY2=VALUE2",
    value: DEFAULT_CUSTOM_VARS,
    ignoreFocusOut: true,
  });
  if (customVarsInput === undefined) return null;

  const tmuxMode = await pickValue(
    "Agent Terminal",
    "Select tmux mode",
    AGENT_TMUX_MODE_CHOICES,
  );
  if (!tmuxMode) return null;

  return {
    tool,
    action,
    story,
    progress,
    category,
    tag,
    customVars: customVarsInput.trim(),
    tmuxMode,
  };
}

export const createDevHandlers = ({
  context,
  storage,
  webviewServer,
  extensionInstaller,
  buildWatcher,
  showApp,
  refreshApp,
  closeApp,
}: DevDependencies) => {
  return {
    execCommand: (command: string, ...rest: unknown[]) => {
      const then = commands.executeCommand(command, ...rest);
      return toPromise(then);
    },

    reinstallExtension: async () => {
      const repoRoot = resolveWebviewRoot(context.extensionPath);
      if (!repoRoot) {
        window.showWarningMessage(
          "Open the Work extension repo to reinstall the extension.",
        );
        return;
      }
      extensionInstaller.start(repoRoot);
    },

    runDevWebview: async () => {
      await showApp();
      const cwd = resolveWebviewRoot(context.extensionPath);
      if (!cwd) {
        window.showWarningMessage(
          "No src/webview found. Open the repo workspace to run the dev server.",
        );
        return;
      }

      const configuredUrl = normalizeServerUrl(getWebviewServerUrl());
      const devUrl = configuredUrl || `http://localhost:${DEFAULT_WEBVIEW_PORT}/`;
      if (configuredUrl && !isLocalhostUrl(devUrl)) {
        window.showWarningMessage(
          `Webview dev server URL is set to ${configuredUrl}. Start it manually.`,
        );
        return;
      }

      const port = getServerPort(devUrl) || DEFAULT_WEBVIEW_PORT;
      const wsBridgeToken = getOrCreateWsBridgeToken(storage);
      const env: Record<string, string> = {};
      for (const key of WS_BRIDGE_TOKEN_VITE_KEYS) {
        env[key] = wsBridgeToken;
      }
      webviewServer.start(cwd, port, env);

      const ready = await waitForServer(devUrl, 10, 350);
      if (ready) {
        await refreshApp();
      } else {
        window.showWarningMessage("Webview dev server did not respond. Check the output.");
      }
    },

    restartExtensionHost: async () => {
      closeApp();
      await storage.setGlobalState(REOPEN_APP_AFTER_RESTART_KEY, true);
      await commands.executeCommand("workbench.action.restartExtensionHost");
    },

    reloadWebviews: async () => {
      try {
        await commands.executeCommand("workbench.action.webview.reloadWebviews");
      } catch {
        // ignore and fall back to manual refresh
      }
      await refreshApp();
    },

    openAgentTerminal: async (params?: {
      tool?: string;
      role?: string;
      story?: string;
      session?: string;
      windowIndex?: string;
    }) => {
      const root = workspaceRoot();
      if (!root) {
        window.showWarningMessage("Open a workspace folder before spawning agent terminals.");
        return { ok: false, error: "no_workspace" };
      }

      const tool = (params?.tool ?? "claude").toUpperCase();
      const role = params?.role ?? "worker";
      const story = params?.story ?? "work";
      const session = params?.session ?? "";
      const windowIndex = params?.windowIndex;

      const title = [tool, role, story].join(" | ");

      // Reuse existing terminal with same title
      const existing = window.terminals.find((t) => t.name === title);
      if (existing) {
        existing.show(true);
        return { ok: true, title, reused: true };
      }

      const terminal = window.createTerminal({
        name: title,
        cwd: root,
        env: {
          WORK_STORY: story,
          WORK_AGENT_ROLE: role,
          AGENT_TOOL: tool.toLowerCase(),
        },
      });
      terminal.show(true);

      // Attach to tmux session if provided
      if (session) {
        const target = windowIndex ? `${session}:${windowIndex}` : session;
        terminal.sendText(`tmux attach-session -t ${shellQuote(target)}`, true);
      }

      return { ok: true, title, reused: false };
    },

    startTaskTerminal: async () => {
      const root = workspaceRoot();
      if (!root) {
        window.showWarningMessage("Open a workspace folder before spawning agent terminals.");
        return;
      }

      const launcher = launcherPath(root);
      if (!existsSync(launcher)) {
        window.showWarningMessage(
          `Missing launcher script: ${path.relative(root, launcher)}. Run .claude/setup.sh --apply first.`,
        );
        return;
      }

      const metadata = await collectAgentLaunchMetadata();
      if (!metadata) {
        return;
      }

      const titleParts = [
        metadata.tool.toUpperCase(),
        metadata.category,
        metadata.story,
        metadata.progress,
      ];
      if (metadata.tag) {
        titleParts.push(metadata.tag);
      }
      const title = titleParts.join(" | ");

      const terminal = window.createTerminal({
        name: title,
        cwd: root,
        env: {
          AGENT_TOOL: metadata.tool,
          AGENT_ACTION: metadata.action,
          AGENT_STORY: metadata.story,
          AGENT_PROGRESS: metadata.progress,
          AGENT_CATEGORY: metadata.category,
          AGENT_TAG: metadata.tag,
          AGENT_TITLE: title,
          AGENT_TMUX_MODE: metadata.tmuxMode,
        },
      });

      const command = [
        shellQuote(launcher),
        shellQuote(metadata.tool),
        shellQuote(metadata.action),
        shellQuote(metadata.story),
        shellQuote(metadata.progress),
        shellQuote(metadata.category),
        shellQuote(metadata.tag),
        shellQuote(metadata.customVars),
        shellQuote(metadata.tmuxMode || DEFAULT_TMUX_MODE),
      ].join(" ");

      terminal.show(false);
      terminal.sendText(command, true);
    },

    buildExtension: () => {
      const cwd = resolveWebviewRoot(context.extensionPath) || context.extensionPath;
      return runBuild("build:ext", cwd, buildWatcher);
    },

    buildWebview: () => {
      const cwd = resolveWebviewRoot(context.extensionPath) || context.extensionPath;
      return runBuild("build:webview", cwd, buildWatcher);
    },
  };
};

const buildOutput = window.createOutputChannel("Work Build");

function runBuild(script: string, cwd: string, buildWatcher?: ExtensionBuildWatcher): Promise<void> {
  return new Promise((resolve) => {
    const cmd = `bun run ${script}`;
    buildOutput.appendLine(`[build] running: ${cmd} (cwd=${cwd})`);
    buildOutput.show(true);

    const shell = process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", cmd], { cwd, stdio: "pipe", windowsHide: true })
      : spawn(process.env.SHELL || "/bin/bash", ["-lc", cmd], { cwd, stdio: "pipe" });

    shell.stdout.on("data", (data: Buffer) => buildOutput.append(data.toString()));
    shell.stderr.on("data", (data: Buffer) => buildOutput.append(data.toString()));
    shell.on("exit", (code) => {
      buildOutput.appendLine(`[build] ${script} exited (code=${code})`);
      if (code === 0) {
        buildWatcher?.markBuild();
        window.showInformationMessage(`Build ${script} complete.`);
      } else {
        window.showWarningMessage(`Build ${script} failed (code=${code}). Check output.`);
      }
      resolve();
    });
    shell.on("error", (error: Error) => {
      buildOutput.appendLine(`[build] error: ${error.message}`);
      window.showWarningMessage(`Build ${script} failed: ${error.message}`);
      resolve();
    });
  });
}
