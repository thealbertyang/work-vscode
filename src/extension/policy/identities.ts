export type IdentityKind = "human" | "ai-agent" | "system";

export type Role =
  | "owner"       // full trust, can unlock write scopes
  | "developer"   // read + local writes when permitted
  | "reviewer"    // read-only + comments when permitted
  | "observer"    // read-only, no writes ever
  | "ai-worker";  // agent: reads + dispatches when permitted

export interface Identity {
  kind: IdentityKind;
  id: string;
  displayName: string;
  roles: Role[];
}

/** Well-known identities used throughout the extension. */
export const IDENTITIES = {
  HUMAN_OWNER: {
    kind: "human" as const,
    id: "owner",
    displayName: "Human Owner",
    roles: ["owner", "developer"] as Role[],
  },
  CLAUDE_CODE: {
    kind: "ai-agent" as const,
    id: "claude-code",
    displayName: "Claude Code",
    roles: ["ai-worker"] as Role[],
  },
  CODEX: {
    kind: "ai-agent" as const,
    id: "codex",
    displayName: "Codex",
    roles: ["ai-worker"] as Role[],
  },
  XCODE_AGENT: {
    kind: "ai-agent" as const,
    id: "xcode-agent",
    displayName: "Xcode Agent",
    roles: ["ai-worker"] as Role[],
  },
  SYSTEM: {
    kind: "system" as const,
    id: "system",
    displayName: "System",
    roles: [] as Role[],
  },
} satisfies Record<string, Identity>;

export type WellKnownIdentityKey = keyof typeof IDENTITIES;
