import { spawn } from "child_process";
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
import {
  type WorkMcpAgentTool,
  type WorkMcpSpawnAction,
  spawnAgentViaWorkMcp,
} from "../service/work-mcp-client";
import { openOrReuseAgentTerminal, launchAgentDirectly } from "../service/agent-terminal";
import { openWorkBrowser, refreshWorkBrowser } from "../service/integrated-browser";

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

type AgentRole = "worker" | "reviewer" | "verifier" | "orchestrator";

type QuickPickChoice<T extends string> = {
  label: string;
  description: string;
  value: T;
};

const AGENT_TOOL_CHOICES: QuickPickChoice<WorkMcpAgentTool>[] = [
  { label: "Codex", description: "OpenAI Codex CLI", value: "codex" },
  { label: "Claude", description: "Claude Code CLI", value: "claude" },
];

const AGENT_ACTION_CHOICES: QuickPickChoice<WorkMcpSpawnAction>[] = [
  { label: "Continue", description: "Continue the latest session in a new tmux window", value: "continue" },
  { label: "Resume", description: "Choose from session history", value: "resume" },
  { label: "New", description: "Start a brand-new session", value: "new" },
];

const AGENT_ROLE_CHOICES: QuickPickChoice<AgentRole>[] = [
  { label: "Worker", description: "General implementation agent", value: "worker" },
  { label: "Reviewer", description: "Review and critique changes", value: "reviewer" },
  { label: "Verifier", description: "Validate behavior and acceptance", value: "verifier" },
  { label: "Orchestrator", description: "Coordinate multi-agent work", value: "orchestrator" },
];

const WS_BRIDGE_TOKEN_VITE_KEYS = buildViteEnvKeys("WS_BRIDGE_TOKEN");

const DEFAULT_STORY = "work";
const DEFAULT_PROMPT = "";

const sanitizeSegment = (value: string): string => {
  return value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._:/-]/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_.:/]+|[-_.:/]+$/g, "");
};

const workspaceRoot = (): string | null => {
  const folder = workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
};

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
  tool: WorkMcpAgentTool;
  action: WorkMcpSpawnAction;
  story: string;
  role: AgentRole;
  prompt: string;
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

  const role = await pickValue(
    "Agent Terminal",
    "Select agent role",
    AGENT_ROLE_CHOICES,
  );
  if (!role) return null;

  const promptInput = await window.showInputBox({
    title: "Agent Terminal",
    prompt: "Optional launch prompt",
    value: DEFAULT_PROMPT,
    ignoreFocusOut: true,
  });
  if (promptInput === undefined) return null;

  return {
    tool,
    action,
    story,
    role,
    prompt: promptInput.trim(),
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

    // Template-only webview helpers remain available for future app work, but they are
    // not part of the active explorer/command surface.
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

    openBrowser: async (target?: { url?: string; path?: string; section?: string } | string) => {
      return openWorkBrowser(context, target);
    },

    refreshBrowser: async () => {
      return refreshWorkBrowser(context);
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
      const result = await openOrReuseAgentTerminal({
        tool: params?.tool,
        role: params?.role,
        story: params?.story,
        session: params?.session,
        windowIndex: params?.windowIndex,
      });
      if (!result.ok) {
        window.showWarningMessage("Open a workspace folder before spawning agent terminals.");
        return { ok: false, error: result.error ?? "no_workspace" };
      }
      return result;
    },

    startTaskTerminal: async () => {
      if (!workspaceRoot()) {
        window.showWarningMessage("Open a workspace folder before spawning agent terminals.");
        return;
      }

      const metadata = await collectAgentLaunchMetadata();
      if (!metadata) {
        return;
      }

      try {
        const spawned = await spawnAgentViaWorkMcp({
          tool: metadata.tool,
          action: metadata.action,
          story: metadata.story,
          role: metadata.role,
          prompt: metadata.prompt,
        });
        openOrReuseAgentTerminal({
          tool: spawned.tool,
          role: spawned.role,
          story: spawned.story,
          session: spawned.tmuxSession,
          windowIndex: spawned.tmuxWindowIndex,
        });
      } catch {
        // MCP spawn failed — fall back to direct terminal launch
        launchAgentDirectly({
          tool: metadata.tool,
          role: metadata.role,
          story: metadata.story,
        });
      }
    },

    buildExtension: () => {
      const cwd = resolveWebviewRoot(context.extensionPath) || context.extensionPath;
      return runBuild("build:ext", cwd, buildWatcher);
    },

    buildWebview: () => {
      const cwd = resolveWebviewRoot(context.extensionPath) || context.extensionPath;
      return runBuild("build:webview:template", cwd, buildWatcher);
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
