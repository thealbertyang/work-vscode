export type AgentSessionSource = "tmux" | "terminal";

export type ParsedAgentSession = {
  tool: string;
  role: string;
  story: string;
  windowIndex?: string;
};

const RUNNERS = new Set(["claude", "codex", "cursor", "aider", "agent"]);

function trim(value: string): string {
  return value.trim();
}

function parseWindowIndex(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = trim(raw).match(/^w(\d+)$/i);
  return match?.[1];
}

function parseDirectTerminalSessionName(sessionName: string): ParsedAgentSession | null {
  const parts = sessionName
    .split("|")
    .map(trim)
    .filter(Boolean);
  if (parts.length < 3) return null;

  const [toolRaw, roleRaw, storyRaw, maybeWindow] = parts;
  const tool = toolRaw.toLowerCase();
  if (!RUNNERS.has(tool)) return null;

  return {
    tool,
    role: roleRaw.toLowerCase() || "worker",
    story: storyRaw,
    windowIndex: parseWindowIndex(maybeWindow),
  };
}

function parseTmuxSessionName(sessionName: string): ParsedAgentSession | null {
  const trimmed = sessionName.replace(/^agents-/i, "");
  const [toolRaw, ...storyParts] = trimmed.split("-").filter(Boolean);
  const tool = toolRaw?.toLowerCase();
  if (!tool || !RUNNERS.has(tool) || storyParts.length === 0) return null;

  return {
    tool,
    role: "worker",
    story: storyParts.join("-"),
  };
}

export function parseAgentSessionName(sessionName: string): ParsedAgentSession | null {
  return parseDirectTerminalSessionName(sessionName) ?? parseTmuxSessionName(sessionName);
}
