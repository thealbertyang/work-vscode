import * as vscode from "vscode";
import type { Identity } from "./identities";
import { SCOPE_LABELS, SCOPE_SETTING_KEY, WRITE_SCOPES } from "./scopes";
import type { Scope } from "./scopes";

export interface PolicyResult {
  allowed: boolean;
  scope: Scope;
  identity: Identity;
  reason: string;
}

/**
 * PermissionPolicy gates all write operations by scope + identity.
 *
 * ALL write scopes are DENIED by default. Each scope has a corresponding
 * VS Code setting flag (work.policy.allow*) that must be explicitly
 * set to `true` to unlock it.
 *
 * Read scopes are always allowed.
 */
export class PermissionPolicy {
  /**
   * Evaluate whether an identity may perform an operation.
   * Does NOT show a warning — use assertAllowed() for that.
   */
  check(identity: Identity, scope: Scope): PolicyResult {
    // All reads are allowed unconditionally.
    if (!WRITE_SCOPES.has(scope)) {
      return { allowed: true, scope, identity, reason: "Read operations are always allowed." };
    }

    // Check the unlock setting for this scope.
    const settingKey = SCOPE_SETTING_KEY[scope];
    if (settingKey) {
      const unlocked = vscode.workspace.getConfiguration().get<boolean>(settingKey, false);
      if (unlocked) {
        return {
          allowed: true,
          scope,
          identity,
          reason: `Allowed: ${settingKey} = true`,
        };
      }
    }

    const label = SCOPE_LABELS[scope];
    const settingHint = settingKey ? ` Enable via: \`${settingKey}\` = true` : "";
    return {
      allowed: false,
      scope,
      identity,
      reason:
        `[Policy] "${label}" is BLOCKED for ${identity.displayName} (${identity.kind}).` +
        settingHint,
    };
  }

  /**
   * Assert an operation is allowed. If denied, shows a VS Code warning
   * notification and throws a PolicyViolationError.
   *
   * Use this at every call site that would perform a write.
   */
  assertAllowed(identity: Identity, scope: Scope): void {
    const result = this.check(identity, scope);
    if (!result.allowed) {
      vscode.window.showWarningMessage(`⚠️ Permission Denied — ${result.reason}`);
      throw new PolicyViolationError(result.reason, scope, identity);
    }
  }

  /**
   * Returns a human-readable summary of the current policy state for all
   * write scopes — useful for status/debug views.
   */
  summary(identity: Identity): Record<Scope, { allowed: boolean; reason: string }> {
    const allScopes = Object.keys(SCOPE_LABELS) as Scope[];
    return Object.fromEntries(
      allScopes.map((scope) => {
        const { allowed, reason } = this.check(identity, scope);
        return [scope, { allowed, reason }];
      }),
    ) as Record<Scope, { allowed: boolean; reason: string }>;
  }
}

export class PolicyViolationError extends Error {
  constructor(
    message: string,
    public readonly scope: Scope,
    public readonly identity: Identity,
  ) {
    super(message);
    this.name = "PolicyViolationError";
  }
}
