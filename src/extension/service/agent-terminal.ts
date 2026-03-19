import { window, workspace, commands, ThemeColor, ThemeIcon } from "vscode";
import type { Terminal } from "vscode";
import { parseAgentSessionName, type AgentSessionSource } from "./agent-session";
import { buildTmuxAttachCommand, shellQuote } from "./agent-terminal-command";

export type AgentTerminalInput = {
  tool?: string;
  role?: string;
  story?: string;
  phase?: string;
  session?: string;
  windowIndex?: string;
  reuseOnly?: boolean;
  forceNew?: boolean;
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

function slugifySession(tool: string, role: string, story: string): string {
  return `agents-${tool}-${role}-${story}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function buildAgentTerminalTitle(tool: string, role: string, story: string, phase?: string): string {
  const issueKey = story.match(/^[a-z]+-\d+/i)?.[0]?.toUpperCase() ?? story;
  const prefix = issueKey.toLowerCase();
  const existing = window.terminals.filter((t) => t.name.toLowerCase().includes(prefix)).length;
  const suffix = existing > 0 ? ` ${existing + 1}` : "";
  const phaseLabel = phase ? ` · ${phase}` : "";
  return `${tool} · ${role} · ${issueKey}${phaseLabel}${suffix}`;
}

/**
 * Send text to a terminal without executing it (no trailing newline).
 * Used to pipe raw escape sequences to the pty stdin for title updates.
 * The OSC 0 sequence sets the terminal tab title when read back from pty output.
 */
export function setTerminalTitle(terminal: Terminal, title: string): void {
  // OSC 0 sets both icon name and window title. shouldExecute=false avoids adding \n.
  terminal.sendText(`\x1b]0;${title}\x07`, false);
}

// ---------------------------------------------------------------------------
// Terminal tab styling
// ---------------------------------------------------------------------------

const TOOL_COLORS: Record<string, string> = {
  claude: "terminal.ansiYellow",
  codex: "terminal.ansiCyan",
};

function makeTerminalId(): string {
  return Math.random().toString(36).slice(2, 10);
}

async function createTerminalViaProfile(root: string, tool: string, role: string, story: string, phase?: string): Promise<Terminal> {
  const terminalId = makeTerminalId();
  const profileName = tool === "codex" ? "Codex" : "Claude";
  const title = buildAgentTerminalTitle(tool, role, story, phase);

  // Set env vars BEFORE creating the terminal so the profile inherits them.
  // Include phase so the process can use it for dynamic updates.
  const envOverrides: Record<string, string> = {
    WORK_STORY: story,
    WORK_AGENT_ROLE: role,
    AGENT_TOOL: tool,
    WORK_TERMINAL_ID: terminalId,
    WORK_TERMINAL_TITLE: title,
  };
  if (phase) {
    envOverrides.WORK_STORY_PHASE = phase;
  }

  // Snapshot current terminals to detect the new one.
  const before = new Set(window.terminals);

  // Launch via profile — this gives us overrideName: false,
  // so the process (claude/codex) can update the tab title dynamically via OSC sequences.
  await commands.executeCommand("workbench.action.terminal.newWithProfile", {
    profileName,
    location: { cwd: root },
    config: { env: envOverrides },
  });

  // Find the newly created terminal.
  const created = window.terminals.find((t) => !before.has(t));
  const terminal = created ?? window.terminals[window.terminals.length - 1];

  // Set initial tab title via OSC 0 sequence.
  // overrideName: false (from profile) lets the running process update it later
  // (e.g., claude can emit its own OSC title to show "DEV-012 · 3/8 done").
  setTerminalTitle(terminal, title);

  return terminal;
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
export async function openOrReuseAgentTerminal(input: AgentTerminalInput): Promise<AgentTerminalResult> {
  const root = workspaceRoot();
  if (!root) return { ok: false, error: "no_workspace" };

  const tool = (input.tool ?? "claude").toLowerCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const key = story.toLowerCase();

  if (!input.forceNew) {
    const keyPrefix = key.match(/^[a-z]+-\d+/)?.[0] ?? key;

    // Match by WORK_STORY env var (our terminals) or name fallback (legacy).
    // Sort by WORK_TERMINAL_ID for stable cycling order.
    const live = window.terminals
      .filter((t) => {
        const env = (t.creationOptions as { env?: Record<string, string> })?.env;
        if (env?.WORK_STORY?.toLowerCase().includes(keyPrefix)) return true;
        return t.name.toLowerCase().includes(keyPrefix);
      })
      .sort((a, b) => {
        const envA = (a.creationOptions as { env?: Record<string, string> })?.env;
        const envB = (b.creationOptions as { env?: Record<string, string> })?.env;
        const idA = envA?.WORK_TERMINAL_ID ?? "";
        const idB = envB?.WORK_TERMINAL_ID ?? "";
        return idA.localeCompare(idB);
      });

    if (live.length > 0) {
      // Update the registry with the fresh scan.
      storyTerminals.set(key, live);

      // Cycle to the next terminal for this story.
      const cursor = storyCursor.get(key) ?? 0;
      const idx = cursor % live.length;
      const target = live[idx];
      const nextIdx = (idx + 1) % live.length;
      storyCursor.set(key, nextIdx);

      console.log(`[agent-terminal] cycle story=${story} prefix=${keyPrefix} matched=${live.length} idx=${idx}→${nextIdx} name=${target.name}`);

      // Two-step focus: first ensure terminal panel is visible,
      // then show the target. show(false) alone silently fails
      // after 4-5 rapid calls due to VS Code debouncing.
      void commands.executeCommand("workbench.action.terminal.focus").then(() => {
        target.show(false);
      });
      return { ok: true, title: target.name, reused: true };
    }
  }

  // reuseOnly: don't create if no existing terminal found.
  if (input.reuseOnly) {
    return { ok: false, error: "no_terminal" };
  }

  // No existing terminal — create via profile so overrideName: false
  // lets the process (claude/codex) set the tab title dynamically.
  const terminal = await createTerminalViaProfile(root, tool, role, story, input.phase);

  const list = storyTerminals.get(key) ?? [];
  list.push(terminal);
  storyTerminals.set(key, list);

  terminal.show(false);

  return { ok: true, title: terminal.name, reused: false };
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
export async function launchAgentDirectly(input: AgentTerminalInput): Promise<AgentTerminalResult> {
  const root = workspaceRoot();
  if (!root) return { ok: false, error: "no_workspace" };

  const tool = (input.tool ?? "claude").toLowerCase();
  const role = input.role ?? "worker";
  const story = input.story ?? "work";
  const terminal = await createTerminalViaProfile(root, tool, role, story, input.phase);
  terminal.show(false);

  return { ok: true, title: terminal.name, reused: false };
}
