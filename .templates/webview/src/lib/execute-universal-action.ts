import type { HandlersType } from "../types/handlers";
import type { UniversalAction, UniversalConfig, UniversalRoute } from "@shared/universal";

const routeIsNavigable = (route: UniversalRoute): boolean =>
  typeof route.path === "string" &&
  route.path.length > 0 &&
  !route.path.includes(":") &&
  !route.path.includes("$");

const resolveRoutePath = (config: UniversalConfig, value: string): string => {
  if (!value) return "";
  if (value.startsWith("/")) return value;
  const fromConfig = config.routes?.[value]?.path;
  if (typeof fromConfig === "string" && fromConfig) return fromConfig;
  // Allow route IDs that look like path segments (legacy behavior).
  return `/${value}`;
};

export type ExecuteUniversalActionDeps = {
  config: UniversalConfig;
  handlers: HandlersType;
  onNavigate: (path: string) => void;
};

export type ExecuteUniversalActionResult =
  | { kind: "navigated"; path: string }
  | { kind: "rpc"; method: string }
  | { kind: "command"; id: string }
  | { kind: "noop"; reason: string };

export const executeUniversalAction = async (
  actionId: string,
  deps: ExecuteUniversalActionDeps,
): Promise<ExecuteUniversalActionResult> => {
  const action: UniversalAction | undefined = deps.config.actions?.[actionId];
  if (!action) {
    return { kind: "noop", reason: `Unknown action id: ${actionId}` };
  }

  // Certain domains are primarily “control surfaces” (settings/dev/auth) where an RPC or command
  // side-effect is usually more correct than simply navigating.
  const preferRpc =
    actionId.startsWith("work.settings.") ||
    actionId.startsWith("work.dev.") ||
    actionId.startsWith("work.auth.") ||
    actionId.startsWith("work.universal.");

  if (preferRpc && action.rpc) {
    const fn = (deps.handlers as any)[action.rpc] as unknown;
    if (typeof fn === "function") {
      await fn();
      return { kind: "rpc", method: action.rpc };
    }
  }

  const routeRef = action.route ? String(action.route) : "";
  const routePath = routeRef ? resolveRoutePath(deps.config, routeRef) : "";
  if (routePath && routeIsNavigable({ id: routeRef, path: routePath })) {
    deps.onNavigate(routePath);
    return { kind: "navigated", path: routePath };
  }

  if (action.rpc) {
    const fn = (deps.handlers as any)[action.rpc] as unknown;
    if (typeof fn === "function") {
      await fn();
      return { kind: "rpc", method: action.rpc };
    }
  }

  if (action.command) {
    await deps.handlers.execCommand(action.command);
    return { kind: "command", id: action.command };
  }

  return { kind: "noop", reason: `Action has no route/rpc/command: ${actionId}` };
};
