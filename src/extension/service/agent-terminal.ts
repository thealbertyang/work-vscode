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

export function openOrReuseAgentTerminal(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const title = buildAgentTerminalTitle(input);
  const existing = window.terminals.find((terminal) => terminal.name === title);
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
    env: {
      WORK_STORY: story,
      WORK_AGENT_ROLE: role,
      AGENT_TOOL: tool,
    },
  });
  terminal.show(true);

  if (input.session) {
    const target = input.windowIndex ? `${input.session}:${input.windowIndex}` : input.session;
    terminal.sendText(`tmux attach-session -t ${shellQuote(target)}`, true);
  }

  return { ok: true, title, reused: false };
}
