import { normalizeRoutePath } from "./routes";
import { ACTIONS, getActionByVscodeCommand, type ActionDefinition } from "./commands";

export const DEFAULT_UNIVERSAL_INTENT_SCHEME = "app";
export const LEGACY_UNIVERSAL_INTENT_SCHEMES = ["work"] as const;

const sanitizeScheme = (value?: string | null): string | null => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*$/.test(raw)) return null;
  return raw.toLowerCase();
};

export const normalizeUniversalIntentScheme = (value?: string | null): string => {
  return sanitizeScheme(value) ?? DEFAULT_UNIVERSAL_INTENT_SCHEME;
};

export type UniversalIntentKind =
  | "route"
  | "doc"
  | "runbook"
  | "plan"
  | "skill"
  | "automation"
  | "command"
  | "rpc"
  | "action";

export const UNIVERSAL_INTENT_KINDS = [
  "route",
  "doc",
  "runbook",
  "plan",
  "skill",
  "automation",
  "command",
  "rpc",
  "action",
] as const satisfies readonly UniversalIntentKind[];

const stripLeadingPrefix = (value: string, prefix: string): string => {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
};

// Convert stable internal IDs (typically "<namespace>.<a>.<b>") into URL-friendly
// path segments (e.g. "<a>/<b>"). This keeps the canonical URLs readable while
// preserving stable IDs inside the app.
const idToUrlPath = (id: string, namespace: string): string => {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return "";
  const withoutPrefix = stripLeadingPrefix(trimmed, `${namespace}.`);
  return withoutPrefix.split(".").filter(Boolean).join("/");
};

// Convert URL path segments back into stable internal IDs. We intentionally prefix
// with the appId/namespace for action/command kinds so "app://<app>/action/x/y"
// resolves to "<app>.x.y".
const urlPathToId = (path: string, namespace: string, { prefixNamespace }: { prefixNamespace: boolean }): string => {
  const trimmed = String(path ?? "").trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length === 0) return "";
  const withoutNamespace = parts[0] === namespace ? parts.slice(1) : parts;
  const joined = withoutNamespace.join(".");
  if (!joined) return "";
  if (!prefixNamespace) return joined;
  return joined.startsWith(`${namespace}.`) ? joined : `${namespace}.${joined}`;
};

export type UniversalIntent =
  | { kind: "route"; path: string; query?: Record<string, string> }
  | {
      kind: "doc" | "runbook" | "plan" | "skill" | "automation";
      id: string;
      query?: Record<string, string>;
    }
  | { kind: "command"; id: string; args?: unknown[]; query?: Record<string, string> }
  | { kind: "rpc"; method: string; args?: unknown[]; query?: Record<string, string> }
  | { kind: "action"; id: string; query?: Record<string, string> };

const parseArgs = (url: URL): unknown[] | undefined => {
  // Prefer args=[...] JSON payload (so you can pass structured args when needed).
  const fromJson = url.searchParams.get("args");
  if (fromJson && fromJson.trim()) {
    try {
      const parsed = JSON.parse(fromJson);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // ignore parse errors and fall through
    }
  }

  // Fall back to repeated arg=... values.
  const repeated = url.searchParams.getAll("arg");
  if (repeated.length > 0) {
    return repeated;
  }

  return undefined;
};

const toQueryObject = (url: URL): Record<string, string> | undefined => {
  const query: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    // These keys are reserved for non-route kinds.
    if (key === "args" || key === "arg") {
      continue;
    }
    query[key] = value;
  }
  return Object.keys(query).length > 0 ? query : undefined;
};

const normalizeAllowedSchemes = (input?: string | string[]): string[] | null => {
  if (!input) return null;
  const list = (Array.isArray(input) ? input : [input]).map(sanitizeScheme).filter(Boolean) as string[];
  const builtins = [DEFAULT_UNIVERSAL_INTENT_SCHEME, ...LEGACY_UNIVERSAL_INTENT_SCHEMES];
  const merged = [...list, ...builtins].map(sanitizeScheme).filter(Boolean) as string[];
  const unique = Array.from(new Set(merged));
  return unique.length > 0 ? unique : null;
};

/**
 * Parses a universal intent URL into a structured {@link UniversalIntent}.
 *
 * Supports two formats:
 * - **Canonical:** `app://{appId}/{kind}/{idOrPath}?...` (e.g., `app://work/route/plan`)
 * - **Legacy:** `{scheme}://{kind}/{idOrPath}?...` (e.g., `work://route/plan`)
 *
 * @param raw - The raw URL string to parse.
 * @param allowedSchemes - Optional scheme allowlist. Defaults to `["app", ...LEGACY_SCHEMES]`.
 * @returns Parsed intent, or `null` if the URL doesn't match any recognized format.
 */
export const parseUniversalIntentUrl = (
  raw: string,
  allowedSchemes?: string | string[],
): UniversalIntent | null => {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const allowed = normalizeAllowedSchemes(allowedSchemes);
  if (allowed) {
    const protocol = url.protocol.replace(/:$/, "");
    if (!allowed.includes(protocol)) {
      return null;
    }
  }

  const protocol = url.protocol.replace(/:$/, "");

  if (protocol === DEFAULT_UNIVERSAL_INTENT_SCHEME) {
    // Format: app://<appId>/<kind>/<idOrPath>?...
    // Example: app://work/route/plan
    const segments = (url.pathname || "/").split("/").filter(Boolean);
    const kind = segments[0] as UniversalIntentKind;
    const idOrPath = segments.slice(1).join("/");

    if (!(UNIVERSAL_INTENT_KINDS as readonly string[]).includes(kind)) {
      return null;
    }

    if (kind === "route") {
      return {
        kind,
        path: normalizeRoutePath(`/${idOrPath}`),
        query: toQueryObject(url),
      };
    }

    if (
      kind === "doc" ||
      kind === "runbook" ||
      kind === "plan" ||
      kind === "skill" ||
      kind === "automation"
    ) {
      return {
        kind,
        id: idOrPath,
        query: toQueryObject(url),
      };
    }

    if (kind === "command") {
      return {
        kind,
        id: urlPathToId(idOrPath, url.host, { prefixNamespace: true }),
        args: parseArgs(url),
        query: toQueryObject(url),
      };
    }

    if (kind === "rpc") {
      return {
        kind,
        method: urlPathToId(idOrPath, url.host, { prefixNamespace: false }),
        args: parseArgs(url),
        query: toQueryObject(url),
      };
    }

    if (kind === "action") {
      return {
        kind,
        id: urlPathToId(idOrPath, url.host, { prefixNamespace: true }),
        query: toQueryObject(url),
      };
    }

    return null;
  }

  // Legacy format: <scheme>://<kind>/<idOrPath>?...
  // Example: work://route/plan
  const kind = url.host as UniversalIntentKind;
  const pathname = url.pathname || "/";
  const idOrPath = pathname.replace(/^\/+/, "");

  if (kind === "route") {
    return {
      kind,
      path: normalizeRoutePath(pathname),
      query: toQueryObject(url),
    };
  }

  if (
    kind === "doc" ||
    kind === "runbook" ||
    kind === "plan" ||
    kind === "skill" ||
    kind === "automation"
  ) {
    return {
      kind,
      id: idOrPath,
      query: toQueryObject(url),
    };
  }

  if (kind === "command") {
    return {
      kind,
      id: urlPathToId(idOrPath, protocol, { prefixNamespace: true }),
      args: parseArgs(url),
      query: toQueryObject(url),
    };
  }

  if (kind === "rpc") {
    return {
      kind,
      method: urlPathToId(idOrPath, protocol, { prefixNamespace: false }),
      args: parseArgs(url),
      query: toQueryObject(url),
    };
  }

  if (kind === "action") {
    return {
      kind,
      id: urlPathToId(idOrPath, protocol, { prefixNamespace: true }),
      query: toQueryObject(url),
    };
  }

  return null;
};

/**
 * Builds a universal intent URL from a structured {@link UniversalIntent}.
 *
 * @param intent - The intent to serialize.
 * @param scheme - URL scheme (defaults to `"app"`). Use a legacy scheme for backward compat.
 * @param appId - Application identifier used as the URL hostname (defaults to `"app"`).
 * @returns A fully-formed intent URL (e.g., `app://work/route/plan`).
 */
export const buildUniversalIntentUrl = (intent: UniversalIntent, scheme?: string, appId?: string): string => {
  const normalizedScheme = normalizeUniversalIntentScheme(scheme);
  const normalizedAppId = sanitizeScheme(appId) ?? "app";

  // Prefer the universal app:// scheme where the hostname is the app id
  // and the first path segment is the intent kind.
  if (normalizedScheme === DEFAULT_UNIVERSAL_INTENT_SCHEME) {
    const url = new URL(`${normalizedScheme}://${normalizedAppId}`);

    if (intent.kind === "route") {
      url.pathname = `/${intent.kind}${normalizeRoutePath(intent.path)}`;
      if (intent.query) {
        for (const [k, v] of Object.entries(intent.query)) {
          url.searchParams.set(k, String(v));
        }
      }
      return url.toString();
    }

    if (intent.kind === "rpc") {
      url.pathname = `/${intent.kind}/${urlPathToId(intent.method, normalizedAppId, { prefixNamespace: false }).replace(/\./g, "/")}`;
      if (intent.args) {
        url.searchParams.set("args", JSON.stringify(intent.args));
      }
      if (intent.query) {
        for (const [k, v] of Object.entries(intent.query)) {
          url.searchParams.set(k, String(v));
        }
      }
      return url.toString();
    }

    if (intent.kind === "action") {
      url.pathname = `/${intent.kind}/${idToUrlPath(intent.id, normalizedAppId)}`;
    } else if (intent.kind === "command") {
      url.pathname = `/${intent.kind}/${idToUrlPath(intent.id, normalizedAppId)}`;
    } else {
      url.pathname = `/${intent.kind}/${intent.id}`;
    }
    if (intent.kind === "command" && intent.args) {
      url.searchParams.set("args", JSON.stringify(intent.args));
    }
    if (intent.query) {
      for (const [k, v] of Object.entries(intent.query)) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  // Legacy format (scheme is the app): <scheme>://<kind>/<idOrPath>?...
  const url = new URL(`${normalizedScheme}://${intent.kind}`);

  if (intent.kind === "route") {
    url.pathname = normalizeRoutePath(intent.path);
    if (intent.query) {
      for (const [k, v] of Object.entries(intent.query)) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  if (intent.kind === "rpc") {
    url.pathname = `/${urlPathToId(intent.method, normalizedScheme, { prefixNamespace: false }).replace(/\./g, "/")}`;
    if (intent.args) {
      url.searchParams.set("args", JSON.stringify(intent.args));
    }
    if (intent.query) {
      for (const [k, v] of Object.entries(intent.query)) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  if (intent.kind === "action") {
    url.pathname = `/${idToUrlPath(intent.id, normalizedScheme)}`;
  } else if (intent.kind === "command") {
    url.pathname = `/${idToUrlPath(intent.id, normalizedScheme)}`;
  } else {
    url.pathname = `/${intent.id}`;
  }
  if (intent.kind === "command" && intent.args) {
    url.searchParams.set("args", JSON.stringify(intent.args));
  }
  if (intent.query) {
    for (const [k, v] of Object.entries(intent.query)) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
};

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
      // Allow deep-linking directly to a VS Code command by id using the action kind.
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
