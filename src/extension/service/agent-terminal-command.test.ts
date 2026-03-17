import { describe, expect, it } from "bun:test";
import { buildTmuxAttachCommand } from "./agent-terminal-command";

describe("buildTmuxAttachCommand", () => {
  it("waits for the target tmux session and attaches to the requested window", () => {
    const command = buildTmuxAttachCommand("agents-claude-dev-0001", "1");

    expect(command).toContain("while [ \"$attempts\" -lt 20 ]; do");
    expect(command).toContain("tmux has-session -t 'agents-claude-dev-0001' 2>/dev/null");
    expect(command).toContain(
      "exec tmux attach-session -t 'agents-claude-dev-0001' \\; select-window -t 'agents-claude-dev-0001:1';",
    );
    expect(command).not.toContain("tmux new-session -A");
  });

  it("falls back to an interactive shell when the session never appears", () => {
    const command = buildTmuxAttachCommand("agents-claude-dev-0001");

    expect(command).toContain("printf '%s\\n' 'tmux session not found: agents-claude-dev-0001';");
    expect(command).toContain("exec zsh -i;");
  });
});
