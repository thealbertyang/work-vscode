import { describe, expect, test } from "bun:test";
import { parseAgentSessionName } from "./agent-session";

describe("parseAgentSessionName", () => {
  test("parses direct story terminal titles", () => {
    expect(parseAgentSessionName("CLAUDE | worker | dev-0001-personal-dev-workspace-bo")).toEqual({
      tool: "claude",
      role: "worker",
      story: "dev-0001-personal-dev-workspace-bo",
      windowIndex: undefined,
    });
  });

  test("parses direct story terminal titles with window suffix", () => {
    expect(parseAgentSessionName("CLAUDE | worker | cso-7320-upgrade-spinnaker | w2")).toEqual({
      tool: "claude",
      role: "worker",
      story: "cso-7320-upgrade-spinnaker",
      windowIndex: "2",
    });
  });

  test("parses tmux agent session names into the shared terminal identity", () => {
    expect(parseAgentSessionName("agents-claude-dev-0001-personal-dev-workspace-bo")).toEqual({
      tool: "claude",
      role: "worker",
      story: "dev-0001-personal-dev-workspace-bo",
    });
  });
});
