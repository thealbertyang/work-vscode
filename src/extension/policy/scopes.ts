/** All operation scopes that the policy engine can gate. */
export type Scope =
  | "jira:read"
  | "jira:write"
  | "jira:comment"
  | "jira:transition"
  | "local:read"
  | "local:write"
  | "agent:dispatch"
  | "agent:terminate";

export const SCOPE_LABELS: Record<Scope, string> = {
  "jira:read": "Read Jira data",
  "jira:write": "Create or update Jira issues",
  "jira:comment": "Post comments on Jira issues",
  "jira:transition": "Transition Jira issue status",
  "local:read": "Read local .claude work files",
  "local:write": "Write local .claude work files",
  "agent:dispatch": "Dispatch tasks to AI agents",
  "agent:terminate": "Terminate AI agent sessions",
};

/** Scopes that mutate external or shared state — blocked by default. */
export const WRITE_SCOPES = new Set<Scope>([
  "jira:write",
  "jira:comment",
  "jira:transition",
  "local:write",
  "agent:dispatch",
  "agent:terminate",
]);

/** VS Code setting key that unlocks each write scope. */
export const SCOPE_SETTING_KEY: Partial<Record<Scope, string>> = {
  "jira:write": "work.policy.allowJiraWrite",
  "jira:comment": "work.policy.allowJiraComment",
  "jira:transition": "work.policy.allowJiraTransition",
  "local:write": "work.policy.allowLocalWrite",
  "agent:dispatch": "work.policy.allowAgentDispatch",
  "agent:terminate": "work.policy.allowAgentTerminate",
};
