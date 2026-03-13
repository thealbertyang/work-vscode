import {
  parseUniversalIntentUrl,
  buildUniversalIntentUrl,
  DEFAULT_UNIVERSAL_INTENT_SCHEME,
  UNIVERSAL_INTENT_KINDS,
} from "../contracts/intent";
import {
  normalizeRoutePath,
  parseRouteHash,
  resolveRouteFromDeepLink,
} from "../contracts/routes";
import { isInternalWrapperQueryKey } from "./wrapper-keys";

export interface ParsedLink {
  /** Resolved app route path (e.g., "/plan", "/review/issues/ABC-123"). */
  to: string;
  /** App-owned query params only (wrapper params stripped). */
  search: Record<string, string>;
  /** Human-readable display string for omnibox. */
  display: string;
  /** Canonical intent URL (`app://work/route/plan`) when the input was an intent URL. */
  canonicalIntent?: string;
  /** Wrapper params preserved for reconstruction. */
  passthrough?: URLSearchParams;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const stripWrapperParams = (
  params: URLSearchParams,
): { app: Record<string, string>; wrapper: URLSearchParams } => {
  const app: Record<string, string> = {};
  const wrapper = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (isInternalWrapperQueryKey(k)) {
      wrapper.append(k, v);
    } else {
      app[k] = v;
    }
  }
  return { app, wrapper };
};

const isUniversalIntentKind = (value: string): boolean => {
  return (UNIVERSAL_INTENT_KINDS as readonly string[]).includes(value);
};

const queryString = (query: Record<string, string>): string => {
  const entries = Object.entries(query);
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(query).toString()}`;
};

const buildDisplay = (path: string, search: Record<string, string>): string => {
  return `${path}${queryString(search)}`;
};

const normalizeDispatcherIdOrPath = (appId: string, kind: string, idOrPath: string): string => {
  const raw = String(idOrPath ?? "").replace(/^\/+/, "");
  if (!raw) return "";
  if (kind === "action" || kind === "command") {
    const withoutNamespace = raw.startsWith(`${appId}.`) ? raw.slice(appId.length + 1) : raw;
    return withoutNamespace.split(".").filter(Boolean).join("/");
  }
  return raw;
};

// ---------------------------------------------------------------------------
// parseAnyLink
// ---------------------------------------------------------------------------

/**
 * Unified "paste anything" link parser.
 *
 * Handles:
 * - `app://work/route/plan` (canonical intent)
 * - `work://route/plan` (legacy intent)
 * - `vscode://publisher.work/app/work/route/plan` (VS Code deep link)
 * - `http://localhost:5173/#/app/work/route/plan` (dev browser)
 * - `#/plan?view=compact` (hash route)
 * - `/plan` (raw path)
 * - `/app/work/route/plan` (dispatcher wrapper)
 */
export const parseAnyLink = (input: string): ParsedLink | null => {
  const value = String(input ?? "").trim();
  if (!value) return null;

  // 1) Try universal intent URL (app:// and legacy scheme://)
  const intent = parseUniversalIntentUrl(value);
  if (intent && intent.kind === "route") {
    const path = intent.path;
    const search = intent.query ?? {};
    const canonical = buildUniversalIntentUrl(intent);
    return {
      to: path,
      search,
      display: buildDisplay(path, search),
      canonicalIntent: canonical,
    };
  }

  // 2) Hash routes: "#/plan?view=compact"
  if (value.startsWith("#")) {
    const parsed = parseRouteHash(value);
    const { app, wrapper } = stripWrapperParams(parsed.query);
    return {
      to: parsed.path,
      search: app,
      display: buildDisplay(parsed.path, app),
      passthrough: wrapper.size > 0 ? wrapper : undefined,
    };
  }

  // 3) Full URLs: vscode://, vscode-insiders://, http://, https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    try {
      const url = new URL(value);
      const protocol = url.protocol.replace(/:$/, "");

      // Try as universal intent (app:// or legacy scheme://)
      if (protocol === DEFAULT_UNIVERSAL_INTENT_SCHEME) {
        // Already handled above, but only for route kind. Handle non-route intents
        // by falling through since parseAnyLink only produces route-level ParsedLink.
        const appId = url.host;
        const segments = (url.pathname || "/").split("/").filter(Boolean);
        const kind = segments[0] ?? "";
        const idOrPath = normalizeDispatcherIdOrPath(appId, kind, segments.slice(1).join("/"));
        if (appId && kind && isUniversalIntentKind(kind)) {
          const dispatchPath = `/app/${appId}/${kind}${idOrPath ? `/${idOrPath}` : ""}`;
          const { app, wrapper } = stripWrapperParams(url.searchParams);
          return {
            to: dispatchPath,
            search: app,
            display: buildDisplay(dispatchPath, app),
            canonicalIntent: value,
            passthrough: wrapper.size > 0 ? wrapper : undefined,
          };
        }
      }

      // Legacy intent scheme (e.g. work://route/plan)
      if (protocol !== "http" && protocol !== "https") {
        const kind = url.host;
        if (kind && isUniversalIntentKind(kind)) {
          const appId = protocol;
          const idOrPath = normalizeDispatcherIdOrPath(appId, kind, (url.pathname || "/").replace(/^\/+/, ""));
          const dispatchPath = `/app/${appId}/${kind}${idOrPath ? `/${idOrPath}` : ""}`;
          const { app, wrapper } = stripWrapperParams(url.searchParams);
          return {
            to: dispatchPath,
            search: app,
            display: buildDisplay(dispatchPath, app),
            canonicalIntent: buildUniversalIntentUrl(
              { kind: "route", path: `/${idOrPath}`, query: Object.keys(app).length > 0 ? app : undefined },
            ),
            passthrough: wrapper.size > 0 ? wrapper : undefined,
          };
        }

        // VS Code deep links: vscode://publisher.work/open/plan
        if (url.hash) {
          const parsed = parseRouteHash(url.hash);
          const { app, wrapper } = stripWrapperParams(parsed.query);
          return {
            to: parsed.path,
            search: app,
            display: buildDisplay(parsed.path, app),
            passthrough: wrapper.size > 0 ? wrapper : undefined,
          };
        }

        const hint = resolveRouteFromDeepLink({
          path: url.pathname,
          query: url.search ? url.search.slice(1) : "",
        });
        if (hint?.path) {
          const { app, wrapper } = stripWrapperParams(url.searchParams);
          const search = hint.query ? { ...hint.query, ...app } : app;
          return {
            to: hint.path,
            search,
            display: buildDisplay(hint.path, search),
            passthrough: wrapper.size > 0 ? wrapper : undefined,
          };
        }

        // Fallback: treat pathname as route
        const { app, wrapper } = stripWrapperParams(url.searchParams);
        const path = normalizeRoutePath(url.pathname);
        return {
          to: path,
          search: app,
          display: buildDisplay(path, app),
          passthrough: wrapper.size > 0 ? wrapper : undefined,
        };
      }

      // HTTP/HTTPS: extract from hash or pathname
      if (url.hash) {
        const parsed = parseRouteHash(url.hash);
        const { app, wrapper } = stripWrapperParams(parsed.query);
        return {
          to: parsed.path,
          search: app,
          display: buildDisplay(parsed.path, app),
          passthrough: wrapper.size > 0 ? wrapper : undefined,
        };
      }

      const hint = resolveRouteFromDeepLink({
        path: url.pathname,
        query: url.search ? url.search.slice(1) : "",
      });
      if (hint?.path) {
        const { app, wrapper } = stripWrapperParams(url.searchParams);
        const search = hint.query ? { ...hint.query, ...app } : app;
        return {
          to: hint.path,
          search,
          display: buildDisplay(hint.path, search),
          passthrough: wrapper.size > 0 ? wrapper : undefined,
        };
      }

      const { app, wrapper } = stripWrapperParams(url.searchParams);
      const path = normalizeRoutePath(url.pathname);
      return {
        to: path,
        search: app,
        display: buildDisplay(path, app),
        passthrough: wrapper.size > 0 ? wrapper : undefined,
      };
    } catch {
      // fall through to raw-path parsing
    }
  }

  // 4) Raw paths: "/plan", "/open/plan", "/app/work/route/plan", "/jira/ABC-123"
  const [pathPart, queryPart] = value.split("?");
  const hint = resolveRouteFromDeepLink({ path: pathPart, query: queryPart });
  if (hint?.path) {
    const rawParams = new URLSearchParams(queryPart ?? "");
    const { app, wrapper } = stripWrapperParams(rawParams);
    const search = hint.query ? { ...hint.query, ...app } : app;
    return {
      to: hint.path,
      search,
      display: buildDisplay(hint.path, search),
      passthrough: wrapper.size > 0 ? wrapper : undefined,
    };
  }

  const rawParams = new URLSearchParams(queryPart ?? "");
  const { app, wrapper } = stripWrapperParams(rawParams);
  const path = normalizeRoutePath(pathPart);
  return {
    to: path,
    search: app,
    display: buildDisplay(path, app),
    passthrough: wrapper.size > 0 ? wrapper : undefined,
  };
};
