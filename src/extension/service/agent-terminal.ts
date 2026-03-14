import { window, workspace, ThemeColor, ThemeIcon } from "vscode";
import type { Terminal } from "vscode";
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

/**
 * Session-scoped terminal registry.
 *
 * Tracks terminals created for each story in creation order so cycling is
 * stable and independent of `window.activeTerminal` (which does not update
 * synchronously after `terminal.show(false)`).
 *
 * `storyTerminals`  — ordered list of live terminals per story key
 * `storyCursor`     — next index to show for a given story key
 *
 * Disposed terminals are pruned via `window.onDidCloseTerminal`.
 */
const storyTerminals = new Map<string, Terminal[]>();
const storyCursor = new Map<string, number>();

window.onDidCloseTerminal((closed) => {
  for (const [key, terminals] of storyTerminals) {
    const filtered = terminals.filter((t) => t !== closed);
    if (filtered.length !== terminals.length) {
      if (filtered.length === 0) {
        storyTerminals.delete(key);
        storyCursor.delete(key);
      } else {
        storyTerminals.set(key, filtered);
        // Clamp cursor so it stays in bounds after removal.
        const cursor = storyCursor.get(key) ?? 0;
        storyCursor.set(key, cursor % filtered.length);
      }
    }
  }
});

function storyKey(story: string): string {
  return story.toLowerCase();
}

function registerTerminalForStory(key: string, terminal: Terminal): void {
  const list = storyTerminals.get(key) ?? [];
  list.push(terminal);
  storyTerminals.set(key, list);
}

/**
 * Cycle to the next terminal for a story and show it.
 * Returns the terminal that was shown.
 */
function cycleToNextTerminal(key: string): Terminal {
  const list = storyTerminals.get(key)!;
  const cursor = storyCursor.get(key) ?? 0;
  const target = list[cursor % list.length];
  storyCursor.set(key, (cursor + 1) % list.length);
  target.show(false);
  return target;
}

export function openOrReuseAgentTerminal(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const story = input.story ?? "work";
  const key = storyKey(story);

  // Prune any terminals that were closed outside our listener (belt-and-suspenders).
  const knownLive = (storyTerminals.get(key) ?? []).filter((t) =>
    window.terminals.includes(t),
  );
  if (knownLive.length !== (storyTerminals.get(key) ?? []).length) {
    storyTerminals.set(key, knownLive);
    if (knownLive.length === 0) {
      storyCursor.delete(key);
    } else {
      storyCursor.set(key, (storyCursor.get(key) ?? 0) % knownLive.length);
    }
  }

  if (knownLive.length > 0) {
    const target = cycleToNextTerminal(key);
    return { ok: true, title: target.name, reused: true };
  }

  const title = buildAgentTerminalTitle(input);
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
  registerTerminalForStory(key, terminal);
  terminal.show(false);

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
    // For live terminal sessions, find by exact name and show it.
    const existing = window.terminals.find((terminal) => terminal.name === input.sessionName);
    if (existing) {
      existing.show(false);
      return { ok: true, title: existing.name, reused: true };
    }

    if (!parsed) {
      return { ok: false, error: "terminal_not_found" };
    }

    // Fall back to matching by built title (handles renamed/numbered terminals).
    const titleBase = buildAgentTerminalTitle(parsed);
    const fallback = window.terminals.find((terminal) =>
      terminal.name === titleBase
      || terminal.name.startsWith(`${titleBase} | `),
    );
    if (fallback) {
      fallback.show(false);
      return { ok: true, title: fallback.name, reused: true };
    }

    return { ok: false, error: "terminal_not_found" };
  }

  if (!parsed) {
    return { ok: false, error: "unrecognized_session" };
  }

  // For tmux sessions, find an existing terminal that is attached to this session.
  const titleBase = buildAgentTerminalTitle(parsed);
  const exact = window.terminals.find((terminal) =>
    terminal.name === titleBase
    || terminal.name.startsWith(`${titleBase} | `),
  );
  if (exact) {
    exact.show(false);
    return { ok: true, title: exact.name, reused: true };
  }

  // Fallback: match by story substring (handles tmux session names vs terminal titles)
  if (parsed.story) {
    const storyLower = parsed.story.toLowerCase();
    const storyMatch = window.terminals.find((t) => t.name.toLowerCase().includes(storyLower));
    if (storyMatch) {
      storyMatch.show(false);
      return { ok: true, title: storyMatch.name, reused: true };
    }
  }

  const root = workspaceRoot();
  if (!root) {
    return { ok: false, error: "no_workspace" };
  }

  const tool = parsed.tool.toLowerCase();
  const terminal = window.createTerminal({
    name: titleBase,
    cwd: root,
    iconPath: new ThemeIcon("hubot", TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined),
    color: TOOL_COLORS[tool] ? new ThemeColor(TOOL_COLORS[tool]) : undefined,
    env: {
      WORK_STORY: parsed.story,
      WORK_AGENT_ROLE: parsed.role,
      AGENT_TOOL: tool,
    },
  });
  terminal.show(false);
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
  terminal.show(false);
  terminal.sendText(tool, true);

  return { ok: true, title, reused: false };
}
