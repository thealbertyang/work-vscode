// Re-export platform-agnostic intent contracts from work-shared
export {
  DEFAULT_UNIVERSAL_INTENT_SCHEME,
  LEGACY_UNIVERSAL_INTENT_SCHEMES,
  UNIVERSAL_INTENT_KINDS,
  normalizeUniversalIntentScheme,
  parseUniversalIntentUrl,
  buildUniversalIntentUrl,
  type UniversalIntentKind,
  type UniversalIntent,
} from "work-shared/contracts/intent";

// VS Code-specific: resolveIntentToAction depends on commands.ts (ACTIONS, getActionByVscodeCommand)
import type { UniversalIntent } from "work-shared/contracts/intent";
import { ACTIONS, getActionByVscodeCommand, type ActionDefinition } from "./commands";

const getActionById = (id: string): ActionDefinition | null => {
  const match = (Object.values(ACTIONS) as ActionDefinition[]).find((action) => action.id === id);
  return match ?? null;
};

/**
 * Resolves an intent to an executable action for the webview.
 *
 * Converts structured intents into one of:
 * - `{ route }` — navigate to a path (safest, preferred)
 * - `{ command }` — execute a VS Code command
 * - `{ rpc }` — call an RPC method
 *
 * Intentionally prefers route navigation over arbitrary command execution.
 */
export const resolveIntentToAction = (
  intent: UniversalIntent,
): { route?: string; command?: string; rpc?: string; args?: unknown[] } | null => {
  if (intent.kind === "route") {
    return { route: intent.path };
  }

  if (intent.kind === "command") {
    return { command: intent.id, args: intent.args };
  }

  if (intent.kind === "rpc") {
    return { rpc: intent.method, args: intent.args };
  }

  if (intent.kind === "action") {
    const def = getActionById(intent.id);
    if (!def) {
      const maybeCommand = intent.id.startsWith("work.") ? intent.id : "";
      if (maybeCommand) {
        const resolved = getActionByVscodeCommand(maybeCommand);
        return resolved.vscode ? { command: resolved.vscode } : null;
      }
      return null;
    }
    if (def.route) return { route: `/${def.route}` };
    if (def.vscode) return { command: def.vscode };
    if (def.rpc) return { rpc: def.rpc };
    return null;
  }

  return null;
};
