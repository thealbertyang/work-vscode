import { window, workspace } from "vscode";

export type AgentTerminalInput = {
  tool?: string;
  role?: string;
  story?: string;
  session?: string;
  windowIndex?: string;
};

export type AgentTerminalResult = {
  ok: boolean;
  title?: string;
  reused?: boolean;
  error?: string;
};

function workspaceRoot(): string | null {
  const folder = workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildTmuxAttachCommand(session: string, windowIndex?: string): string {
  const quotedSession = shellQuote(session);
  const missingMessage = shellQuote(`tmux session not found: ${session}`);
  if (!windowIndex) {
    return [
      `if tmux has-session -t ${quotedSession} 2>/dev/null; then`,
      `  exec tmux attach-session -t ${quotedSession};`,
      "else",
      `  printf '%s\\n' ${missingMessage};`,
      "  exec zsh -i;",
      "fi",
    ].join(" ");
  }

  const target = `${session}:${windowIndex}`;
  const quotedTarget = shellQuote(target);
  return [
    `if tmux has-session -t ${quotedSession} 2>/dev/null; then`,
    `  tmux attach-session -t ${quotedSession} \\; select-window -t ${quotedTarget};`,
    "else",
    `  printf '%s\\n' ${missingMessage};`,
    "  exec zsh -i;",
    "fi",
  ].join(" ");
}

export function buildAgentTerminalTitle(input: AgentTerminalInput): string {
  const tool = (input.tool ?? "claude").toUpperCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const parts = [tool, role, story];
  if (input.windowIndex) {
    parts.push(`w${input.windowIndex}`);
  }
  return parts.join(" | ");
}

/** Color map for terminal tab icons by tool. */
const TOOL_COLORS: Record<string, string> = {
  claude: "terminal.ansiYellow",
  codex: "terminal.ansiCyan",
};

export function openOrReuseAgentTerminal(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const title = buildAgentTerminalTitle(input);
  const existing = window.terminals.find(
    (terminal) => terminal.name === title || terminal.name.startsWith(`${title} |`),
  );
  if (existing) {
    existing.show(true);
    return { ok: true, title, reused: true };
  }

  const tool = (input.tool ?? "claude").toLowerCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const terminal = window.createTerminal({
    name: title,
    cwd: root,
    iconPath: undefined,
    color: TOOL_COLORS[tool] ? new (require("vscode").ThemeColor)(TOOL_COLORS[tool]) : undefined,
    env: {
      WORK_STORY: story,
      WORK_AGENT_ROLE: role,
      AGENT_TOOL: tool,
    },
  });
  terminal.show(true);

  if (input.session) {
    terminal.sendText(buildTmuxAttachCommand(input.session, input.windowIndex), true);
  }

  return { ok: true, title, reused: false };
}

/**
 * Fallback: launch agent directly in terminal when MCP spawn fails.
 * No tmux, no session — just runs the CLI tool.
 */
export function launchAgentDirectly(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const title = buildAgentTerminalTitle(input);
  const tool = (input.tool ?? "claude").toLowerCase();
  const story = input.story ?? "work";
  const terminal = window.createTerminal({
    name: title,
    cwd: root,
    color: TOOL_COLORS[tool] ? new (require("vscode").ThemeColor)(TOOL_COLORS[tool]) : undefined,
    env: {
      WORK_STORY: story,
      WORK_AGENT_ROLE: input.role ?? "worker",
      AGENT_TOOL: tool,
    },
  });
  terminal.show(true);
  terminal.sendText(tool, true);

  return { ok: true, title, reused: false };
}
