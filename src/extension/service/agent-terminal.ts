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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

export function buildAgentTerminalTitle(tool: string, role: string, story: string): string {
  return [tool.toUpperCase(), role, story].join(" | ");
}

// ---------------------------------------------------------------------------
// Terminal tab styling
// ---------------------------------------------------------------------------

const TOOL_COLORS: Record<string, string> = {
  claude: "charts.green",
  codex: "charts.blue",
};

function createTerminal(name: string, root: string, tool: string, role: string, story: string): Terminal {
  const colorKey = TOOL_COLORS[tool];
  const color = colorKey ? new ThemeColor(colorKey) : undefined;
  return window.createTerminal({
    name,
    cwd: root,
    iconPath: new ThemeIcon("hubot", color),
    color,
    env: {
      WORK_STORY: story,
      WORK_AGENT_ROLE: role,
      AGENT_TOOL: tool,
    },
  });
}

// ---------------------------------------------------------------------------
// Terminal registry
//
// storyTerminals — ordered list of live terminals per story slug (lowercase)
// storyCursor    — next index to show when cycling through a story's terminals
// ---------------------------------------------------------------------------

const storyTerminals = new Map<string, Terminal[]>();
const storyCursor = new Map<string, number>();

window.onDidCloseTerminal((closed) => {
  for (const [key, terminals] of storyTerminals) {
    const filtered = terminals.filter((t) => t !== closed);
    if (filtered.length === terminals.length) continue;

    if (filtered.length === 0) {
      storyTerminals.delete(key);
      storyCursor.delete(key);
    } else {
      storyTerminals.set(key, filtered);
      const cursor = storyCursor.get(key) ?? 0;
      storyCursor.set(key, cursor % filtered.length);
    }
  }
});

function liveTerminalsForStory(story: string): Terminal[] {
  const key = story.toLowerCase();
  const known = storyTerminals.get(key) ?? [];
  // Belt-and-suspenders: prune any that VS Code closed without firing the event.
  const live = known.filter((t) => window.terminals.includes(t));
  if (live.length !== known.length) {
    if (live.length === 0) {
      storyTerminals.delete(key);
      storyCursor.delete(key);
    } else {
      storyTerminals.set(key, live);
      const cursor = storyCursor.get(key) ?? 0;
      storyCursor.set(key, cursor % live.length);
    }
  }
  return live;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Find any terminal whose name contains the story slug and show it.
 * On repeated calls with multiple terminals for the same story, cycles through them.
 * Creates exactly one new terminal when none exist for the story.
 */
export function openOrReuseAgentTerminal(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) return { ok: false, error: "no_workspace" };

  const tool = (input.tool ?? "claude").toLowerCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const key = story.toLowerCase();

  const live = liveTerminalsForStory(story);

  if (live.length > 0) {
    // Cycle to the next terminal for this story.
    const cursor = storyCursor.get(key) ?? 0;
    const target = live[cursor % live.length];
    storyCursor.set(key, (cursor + 1) % live.length);
    target.show(false);
    return { ok: true, title: target.name, reused: true };
  }

  // No existing terminal — create one.
  const title = buildAgentTerminalTitle(tool, role, story);
  const terminal = createTerminal(title, root, tool, role, story);

  const list = storyTerminals.get(key) ?? [];
  list.push(terminal);
  storyTerminals.set(key, list);

  terminal.show(false);

  const sessionName = input.session ?? slugifySession(tool, role, story);
  const s = shellQuote(sessionName);
  const selectWindow = input.windowIndex
    ? ` \\; select-window -t ${shellQuote(`${sessionName}:${input.windowIndex}`)}`
    : "";
  terminal.sendText(`tmux new-session -A -s ${s} -c ${shellQuote(root)}${selectWindow}`, true);

  return { ok: true, title, reused: false };
}

/**
 * Find and focus an existing terminal by session name. Never creates a terminal.
 *
 * Search order: exact name match → story substring match.
 */
export function revealAgentSession(input: AgentSessionRevealInput): AgentTerminalResult {
  // Exact name match.
  const exact = window.terminals.find((t) => t.name === input.sessionName);
  if (exact) {
    exact.show(false);
    return { ok: true, title: exact.name, reused: true };
  }

  // Story substring match — derive story from the session name if possible.
  const parsed = parseAgentSessionName(input.sessionName);
  if (parsed?.story) {
    const storyLower = parsed.story.toLowerCase();
    const storyMatch = window.terminals.find((t) => t.name.toLowerCase().includes(storyLower));
    if (storyMatch) {
      storyMatch.show(false);
      return { ok: true, title: storyMatch.name, reused: true };
    }
  }

  return { ok: false, error: "terminal_not_found" };
}

/**
 * Fallback: launch the agent CLI directly in a new terminal (no tmux).
 * Always creates a new terminal — this is intentional.
 */
export function launchAgentDirectly(input: AgentTerminalInput): AgentTerminalResult {
  const root = workspaceRoot();
  if (!root) return { ok: false, error: "no_workspace" };

  const tool = (input.tool ?? "claude").toLowerCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const title = buildAgentTerminalTitle(tool, role, story);
  const terminal = createTerminal(title, root, tool, role, story);
  terminal.show(false);
  terminal.sendText(tool, true);

  return { ok: true, title, reused: false };
}
