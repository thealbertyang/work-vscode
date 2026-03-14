import { window, workspace, commands, ThemeColor, ThemeIcon, Uri } from "vscode";
import { parseAgentSessionName, type AgentSessionSource } from "./agent-session";

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

export type AgentSessionRevealInput = {
  sessionName: string;
  source?: AgentSessionSource;
};

function workspaceRoot(): string | null {
  const folder = workspace.workspaceFolders?.[0];
  return folder?.uri.fsPath ?? null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildTmuxAttachCommand(sessionName: string, windowIndex?: string): string {
  const quotedSession = shellQuote(sessionName);
  const quotedWindow = windowIndex ? shellQuote(`${sessionName}:${windowIndex}`) : null;
  const missingMessage = shellQuote(`tmux session not found: ${sessionName}`);
  return [
    `if tmux has-session -t ${quotedSession} 2>/dev/null; then`,
    quotedWindow
      ? `  exec tmux attach-session -t ${quotedSession} \\; select-window -t ${quotedWindow};`
      : `  exec tmux attach-session -t ${quotedSession};`,
    "else",
    `  printf '%s\\n' ${missingMessage};`,
    "  exec zsh -i;",
    "fi",
  ].join(" ");
}

function slugifySession(tool: string, role: string, story: string): string {
  return `agents-${tool}-${role}-${story}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}


/** Running counter per story for unique terminal names. */
const terminalCounter = new Map<string, number>();

export function buildAgentTerminalTitle(input: AgentTerminalInput): string {
  const tool = (input.tool ?? "claude").toUpperCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const parts = [tool, role, story];
  if (input.windowIndex) {
    parts.push(`#${input.windowIndex}`);
  } else {
    // Auto-number to distinguish multiple terminals for same story
    const key = `${tool}:${role}:${story}`;
    const n = (terminalCounter.get(key) ?? 0) + 1;
    terminalCounter.set(key, n);
    if (n > 1) parts.push(`#${n}`);
  }
  return parts.join(" | ");
}

/** Terminal tab styling — matches sidebar agent session icons. */
const TOOL_COLORS: Record<string, string> = {
  claude: "charts.green",
  codex: "charts.blue",
};

/** Track cycling counter per story — stable across terminal reordering. */
const cycleCounter = new Map<string, number>();

export function openOrReuseAgentTerminal(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const title = buildAgentTerminalTitle(input);
  const story = input.story ?? "work";
  const storyLower = story.toLowerCase();

  // Collect all terminals for this story, sorted by name for stable order
  const storyTerminals = window.terminals
    .filter((t) => t.name.toLowerCase().includes(storyLower))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (storyTerminals.length > 0) {
    // First call: show the first terminal. Subsequent calls: cycle forward.
    const active = window.activeTerminal;
    const isStoryActive = active && storyTerminals.some((t) => t === active);

    if (isStoryActive && storyTerminals.length > 1) {
      // Already on a story terminal — cycle to next
      commands.executeCommand("workbench.action.terminal.focusNext");
      return { ok: true, title: "next", reused: true };
    }

    // Not on a story terminal — jump to the first one
    storyTerminals[0].show(true);
    return { ok: true, title: storyTerminals[0].name, reused: true };
  }

  const tool = (input.tool ?? "claude").toLowerCase();
  const role = input.role ?? "worker";
  const terminal = window.createTerminal({
    name: title,
    cwd: root,
    iconPath: new ThemeIcon("hubot", TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined),
    color: TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined,
    env: {
      WORK_STORY: story,
      WORK_AGENT_ROLE: role,
      AGENT_TOOL: tool,
    },
  });
  terminal.show(true);

  // Idempotent: attach if session exists, create if not
  const sessionName = input.session ?? slugifySession(tool, input.role ?? "worker", input.story ?? "work");
  const s = shellQuote(sessionName);
  const selectWindow = input.windowIndex ? ` \\; select-window -t ${shellQuote(sessionName + ":" + input.windowIndex)}` : "";
  const cmd = `tmux new-session -A -s ${s} -c ${shellQuote(root)}${selectWindow}`;
  terminal.sendText(cmd, true);

  return { ok: true, title, reused: false };
}

export function revealAgentSession(input: AgentSessionRevealInput): AgentTerminalResult {
  const source = input.source ?? "tmux";
  const parsed = parseAgentSessionName(input.sessionName);

  if (source === "terminal") {
    const existing = window.terminals.find((terminal) => terminal.name === input.sessionName);
    if (existing) {
      existing.show(true);
      return { ok: true, title: existing.name, reused: true };
    }

    if (!parsed) {
      return { ok: false, error: "terminal_not_found" };
    }

    const fallback = window.terminals.find((terminal) =>
      terminal.name === buildAgentTerminalTitle(parsed)
      || terminal.name.startsWith(`${buildAgentTerminalTitle(parsed)} | `),
    );
    if (fallback) {
      fallback.show(true);
      return { ok: true, title: fallback.name, reused: true };
    }

    return { ok: false, error: "terminal_not_found" };
  }

  if (!parsed) {
    return { ok: false, error: "unrecognized_session" };
  }

  const exact = window.terminals.find((terminal) =>
    terminal.name === buildAgentTerminalTitle(parsed)
    || terminal.name.startsWith(`${buildAgentTerminalTitle(parsed)} | `),
  );
  if (exact) {
    exact.show(true);
    return { ok: true, title: exact.name, reused: true };
  }

  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const tool = parsed.tool.toLowerCase();
  const terminal = window.createTerminal({
    name: buildAgentTerminalTitle(parsed),
    cwd: root,
    iconPath: new ThemeIcon("hubot", TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined),
    color: TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined,
    env: {
      WORK_STORY: parsed.story,
      WORK_AGENT_ROLE: parsed.role,
      AGENT_TOOL: tool,
    },
  });
  terminal.show(true);
  terminal.sendText(buildTmuxAttachCommand(input.sessionName, parsed.windowIndex), true);
  return { ok: true, title: terminal.name, reused: false };
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
    iconPath: new ThemeIcon("hubot", TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined),
    color: TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined,
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
