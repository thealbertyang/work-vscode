import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_UNIVERSAL_CONFIG } from "@shared/universal";
import type { UniversalAction, UniversalCommand, UniversalConfig, UniversalRoute } from "@shared/universal";
import { DEFAULT_UNIVERSAL_INTENT_SCHEME, buildUniversalIntentUrl, normalizeRoutePath } from "@shared/contracts";
import type { DocEntry } from "@shared/docs-contract";
import { useAppContext } from "../contexts/app-context";
import { useHandlers } from "../hooks/use-handlers";
import { parseNavTarget } from "../lib/parse-nav-target";

type SearchItem = {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
  stayOpen?: boolean;
  hasChildren?: boolean;
};

type ScopeCategory = "all" | "routes" | "actions" | "commands" | "docs" | "recents";

const SCOPES: { id: ScopeCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "routes", label: "Routes" },
  { id: "actions", label: "Actions" },
  { id: "commands", label: "Commands" },
  { id: "docs", label: "Docs" },
  { id: "recents", label: "Recents" },
];

const SCOPE_STORAGE_KEY = "work.commandPalette.scope.v1";

type AppOverlaySearchProps = {
  isOpen: boolean;
  onClose: () => void;
  onExecute: (actionId: string) => void;
  onNavigate: (path: string) => void;
  extraItems?: SearchItem[];
  initialQuery?: string;
};

const routeIsNavigable = (route: UniversalRoute): boolean =>
  typeof route.path === "string" &&
  route.path.length > 0 &&
  !route.path.includes(":") &&
  !route.path.includes("$");

const IconSearch = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M8.5 2a6.5 6.5 0 104.03 11.6l3.43 3.44a1 1 0 001.42-1.42l-3.44-3.43A6.5 6.5 0 008.5 2zm0 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"
    />
  </svg>
);

const IconArrow = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M10.25 4.3a1 1 0 011.41 0l5 5a1 1 0 010 1.41l-5 5a1 1 0 01-1.41-1.41l3.3-3.3H4a1 1 0 110-2h9.55l-3.3-3.3a1 1 0 010-1.4z"
    />
  </svg>
);

const IconBolt = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M11.4 1.5a1 1 0 01.83 1.12l-.62 4.28h4.05a1 1 0 01.83 1.56l-7.9 10.96a1 1 0 01-1.82-.72l.87-5.14H4.2a1 1 0 01-.83-1.56L10.6 1.94a1 1 0 01.8-.44z"
    />
  </svg>
);

const IconDoc = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.83a2 2 0 00-.59-1.41l-2.83-2.83A2 2 0 0011.17 3H6zm6 1.5V6a1 1 0 001 1h2.5L12 3.5zM6 9a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z"
    />
  </svg>
);

const IconTerminal = () => (
  <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M3 4a2 2 0 012-2h10a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm3.7 2.3a1 1 0 00-1.4 1.4L7.58 10l-2.3 2.3a1 1 0 001.42 1.4l3-3a1 1 0 000-1.4l-3-3zM10 13a1 1 0 100 2h4a1 1 0 100-2h-4z"
    />
  </svg>
);

const itemIcon = (id: string) => {
  if (id.startsWith("action:")) return <IconBolt />;
  if (id.startsWith("command:")) return <IconTerminal />;
  if (id.startsWith("route:")) return <IconArrow />;
  if (id.startsWith("go:")) return <IconArrow />;
  if (id.startsWith("doc:")) return <IconDoc />;
  if (id.startsWith("nav:")) return <IconArrow />;
  return <IconArrow />;
};

type RecentEntry = {
  kind: "route" | "action" | "nav";
  value: string;
  ts: number;
};

const RECENTS_STORAGE_KEY = "work.commandPalette.recents.v1";
const MAX_RECENTS = 14;

const readRecents = (): RecentEntry[] => {
  try {
    const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentEntry => {
        if (!entry || typeof entry !== "object") return false;
        const kind = (entry as any).kind;
        const value = (entry as any).value;
        const ts = (entry as any).ts;
        return (
          (kind === "route" || kind === "action" || kind === "nav") &&
          typeof value === "string" &&
          value.trim().length > 0 &&
          typeof ts === "number" &&
          Number.isFinite(ts)
        );
      })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
};

const writeRecents = (entries: RecentEntry[]) => {
  try {
    window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_RECENTS)));
  } catch {
    // ignore
  }
};

type SegmentKind = "route" | "action" | "command" | "rpc";

type SegmentContext =
  | {
      kind: SegmentKind;
      dispatcher: true;
      appId: string;
      segments: string[];
      queryString: string;
    }
  | {
      kind: "route";
      dispatcher: false;
      appId: null;
      segments: string[];
      queryString: string;
    };

const splitQuery = (value: string): { pathPart: string; queryString: string } => {
  const [pathPart, queryPart] = String(value ?? "").split("?");
  return {
    pathPart,
    queryString: queryPart ? `?${queryPart}` : "",
  };
};

const parseSegmentContextFromTarget = (target: string): SegmentContext | null => {
  const { pathPart, queryString } = splitQuery(target);

  if (pathPart.startsWith("/app/")) {
    const segments = pathPart.split("/").filter(Boolean);
    const appId = segments[1] ?? "";
    const kind = segments[2] ?? "";
    if (!appId || kind !== "route") {
      if (kind !== "action" && kind !== "command" && kind !== "rpc") {
        return null;
      }
      const rawIdSegments = segments.slice(3).filter(Boolean);
      // Accept legacy dot-form ids under the dispatcher by splitting them into path segments.
      const idSegments =
        rawIdSegments.length === 1 && rawIdSegments[0]?.includes(".")
          ? rawIdSegments[0].replace(new RegExp(`^${appId}\\\\.`), "").split(".").filter(Boolean)
          : rawIdSegments;
      return {
        kind: kind as SegmentKind,
        dispatcher: true,
        appId,
        segments: idSegments,
        queryString,
      };
    }
    const routePath = normalizeRoutePath(`/${segments.slice(3).join("/")}`);
    const routeSegments = routePath.split("/").filter(Boolean);
    return {
      kind: "route",
      dispatcher: true,
      appId,
      segments: routeSegments,
      queryString,
    };
  }

  const routePath = normalizeRoutePath(pathPart);
  const routeSegments = routePath.split("/").filter(Boolean);
  return {
    kind: "route",
    dispatcher: false,
    appId: null,
    segments: routeSegments,
    queryString,
  };
};

const looksLikeLinkOrPath = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("#") || trimmed.startsWith("/")) return true;
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
};

export function AppOverlaySearch({
  isOpen,
  onClose,
  onExecute,
  onNavigate,
  extraItems,
  initialQuery,
}: AppOverlaySearchProps) {
  const { universalConfig, isWebview } = useAppContext();
  const handlers = useHandlers();
  const config: UniversalConfig = universalConfig ?? DEFAULT_UNIVERSAL_CONFIG;
  const appId = config.app.id ?? DEFAULT_UNIVERSAL_CONFIG.app.id ?? "work";
  const intentScheme =
    config.app.intentScheme ?? DEFAULT_UNIVERSAL_CONFIG.app.intentScheme ?? DEFAULT_UNIVERSAL_INTENT_SCHEME;
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const [scopeFocused, setScopeFocused] = useState(false);
  const [previewRoute, setPreviewRoute] = useState<string | null>(null);
  const [routeBeforePreview, setRouteBeforePreview] = useState<string | null>(null);
  const [activeScope, setActiveScope] = useState<ScopeCategory>(() => {
    try {
      const stored = window.localStorage.getItem(SCOPE_STORAGE_KEY);
      if (stored && SCOPES.some((s) => s.id === stored)) return stored as ScopeCategory;
    } catch { /* ignore */ }
    return "all";
  });
  const [docEntries, setDocEntries] = useState<DocEntry[]>([]);

  const recordRecent = useCallback((entry: Omit<RecentEntry, "ts">) => {
    const next: RecentEntry = { ...entry, ts: Date.now() };
    setRecents((prev) => {
      const deduped = prev.filter((e) => !(e.kind === next.kind && e.value === next.value));
      const merged = [next, ...deduped].slice(0, MAX_RECENTS);
      writeRecents(merged);
      return merged;
    });
  }, []);

  const directTarget = useMemo(() => {
    if (!looksLikeLinkOrPath(query)) return null;
    return parseNavTarget(query);
  }, [query]);
  const directItem: SearchItem | null = useMemo(() => {
    if (!query.trim() || !directTarget) {
      return null;
    }
    const isDispatch = directTarget.startsWith("/app/") || directTarget.startsWith("/intent?") || directTarget.startsWith("/u/");
    return {
      id: `go:${directTarget}`,
      label: isDispatch ? "Open" : "Go to",
      hint: query.trim(),
      action: () => {
        recordRecent({ kind: "nav", value: directTarget });
        onNavigate(directTarget);
      },
    };
  }, [directTarget, onNavigate, query, recordRecent]);

  const segmentContext = useMemo(() => {
    if (!directTarget) return null;
    // Only treat as "segment-editable" when it's link-like (no spaces).
    const trimmed = query.trim();
    if (/\s/.test(trimmed)) return null;
    return parseSegmentContextFromTarget(directTarget);
  }, [directTarget, query]);

  useEffect(() => {
    if (!segmentContext) {
      setSegmentIndex(0);
      return;
    }
    setSegmentIndex((prev) => Math.min(prev, Math.max(0, segmentContext.segments.length - 1)));
  }, [segmentContext?.segments.join("/")]);

  useEffect(() => {
    if (!segmentContext) return;
    if (segmentContext.segments.length === 0) return;
    const input = inputRef.current;
    if (!input) return;
    if (document.activeElement !== input) return;

    const raw = input.value;
    const { pathPart } = splitQuery(raw);
    const focus = Math.min(segmentIndex, Math.max(0, segmentContext.segments.length - 1));

    let cursor = 0;
    if (segmentContext.dispatcher) {
      const marker = `/app/${segmentContext.appId}/${segmentContext.kind}/`;
      const idx = pathPart.indexOf(marker);
      if (idx === -1) return;
      cursor = idx + marker.length;
    } else {
      cursor = pathPart.startsWith("/") ? 1 : 0;
    }

    for (let i = 0; i < segmentContext.segments.length; i++) {
      const segment = segmentContext.segments[i] ?? "";
      const start = cursor;
      const end = start + segment.length;
      if (i === focus) {
        try {
          input.setSelectionRange(start, end);
        } catch {
          // ignore selection errors
        }
        return;
      }
      cursor = end + 1;
    }
  }, [segmentContext, segmentIndex, query]);

  const routePathLists = useMemo(() => {
    const routes = Object.values(config.routes ?? {}) as UniversalRoute[];
    return routes
      .filter(routeIsNavigable)
      .map((route) => normalizeRoutePath(route.path).split("/").filter(Boolean));
  }, [config.routes]);

  const namespace = config.app.namespace ?? DEFAULT_UNIVERSAL_CONFIG.app.namespace ?? appId;

  const actionPathLists = useMemo(() => {
    const actions = Object.values(config.actions ?? {}) as UniversalAction[];
    return actions
      .filter((action) => typeof action?.id === "string" && action.id.trim().length > 0)
      .map((action) =>
        action.id
          .replace(new RegExp(`^${namespace}\\\\.`), "")
          .split(".")
          .filter(Boolean),
      );
  }, [config.actions, namespace]);

  const commandPathLists = useMemo(() => {
    const commands = Object.values(config.commands ?? {}) as UniversalCommand[];
    return commands
      .filter((cmd) => typeof cmd?.id === "string" && cmd.id.trim().length > 0)
      .filter((cmd) => cmd.id.startsWith(`${namespace}.`))
      .map((cmd) => cmd.id.replace(new RegExp(`^${namespace}\\\\.`), "").split(".").filter(Boolean));
  }, [config.commands, namespace]);

  const rpcPathLists = useMemo(() => {
    const commands = Object.values(config.commands ?? {}) as UniversalCommand[];
    return commands
      .filter((cmd) => cmd.kind === "rpc")
      .filter((cmd) => typeof cmd?.id === "string" && cmd.id.trim().length > 0)
      .map((cmd) => String(cmd.id).split(".").filter(Boolean));
  }, [config.commands]);

  const defaultRouteByHead = useMemo(() => {
    const map: Record<string, string> = {};
    const stages = Object.values(config.stages ?? {});
    stages.forEach((stage) => {
      const raw = typeof stage?.defaultRoute === "string" ? stage.defaultRoute : "";
      if (!raw) return;
      const normalized = normalizeRoutePath(raw);
      const head = normalized.split("/").filter(Boolean)[0];
      if (head && !map[head]) {
        map[head] = normalized;
      }
    });
    return map;
  }, [config.stages]);

  // Persist scope to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem(SCOPE_STORAGE_KEY, activeScope);
    } catch { /* ignore */ }
  }, [activeScope]);

  useEffect(() => {
    if (!isOpen) return;
    setRecents(readRecents());
    // Fetch docs index for the docs scope
    if (isWebview) {
      handlers.getDocsIndex().then((result) => {
        setDocEntries(result.entries ?? []);
      }).catch(() => {
        setDocEntries([]);
      });
    }
  }, [isOpen, isWebview, handlers]);

  const findBestRoutePath = useCallback(
    (prefix: string[]): string => {
      if (prefix.length === 0) return "/plan";

      const matches = routePathLists.filter((segments) =>
        prefix.every((value, idx) => segments[idx] === value),
      );

      const hasExact = matches.find((segments) => segments.length === prefix.length);
      if (hasExact) {
        return `/${hasExact.join("/")}`;
      }

      if (prefix.length === 1) {
        const head = prefix[0];
        const stageDefault = defaultRouteByHead[head];
        if (stageDefault) {
          return stageDefault;
        }
      }

      if (matches.length === 0) {
        return normalizeRoutePath(`/${prefix.join("/")}`);
      }

      const best = [...matches].sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length;
        return `/${a.join("/")}`.localeCompare(`/${b.join("/")}`);
      })[0];

      return `/${best.join("/")}`;
    },
    [defaultRouteByHead, routePathLists],
  );

  const segmentOptions = useMemo(() => {
    if (!segmentContext) return [];

    const lists =
      segmentContext.kind === "route"
        ? routePathLists
        : segmentContext.kind === "action"
          ? actionPathLists
          : segmentContext.kind === "command"
            ? commandPathLists
            : rpcPathLists;

    // Show CHILDREN of the typed path, not siblings at the cursor position.
    // e.g. typed "/plan" → prefix=["plan"], childLevel=1 → shows weekly, monthly, ...
    const prefix = segmentContext.segments;
    const childLevel = prefix.length;
    const options = new Set<string>();
    for (const segments of lists) {
      if (segments.length <= childLevel) continue;
      let matches = true;
      for (let i = 0; i < prefix.length; i++) {
        if (segments[i] !== prefix[i]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      const candidate = segments[childLevel];
      if (candidate) options.add(candidate);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [
    actionPathLists,
    commandPathLists,
    rpcPathLists,
    routePathLists,
    segmentContext,
  ]);

  const segmentItems: SearchItem[] = useMemo(() => {
    if (!segmentContext) return [];
    if (segmentOptions.length === 0) return [];
    const prefix = segmentContext.segments;
    const childLevel = prefix.length;

    const buildPreview = (value: string) => {
      if (segmentContext.kind === "route") {
        const bestPath = findBestRoutePath([...prefix, value]);
        return segmentContext.dispatcher ? `/app/${segmentContext.appId}/route${bestPath}` : bestPath;
      }

      const lists =
        segmentContext.kind === "action"
          ? actionPathLists
          : segmentContext.kind === "command"
            ? commandPathLists
            : rpcPathLists;

      const nextPrefix = [...prefix, value];
      const matches = lists.filter((segments) => nextPrefix.every((v, idx) => segments[idx] === v));
      const exact = matches.find((segments) => segments.length === nextPrefix.length);
      const best = exact
        ? exact
        : matches.length === 0
          ? nextPrefix
          : [...matches].sort((a, b) => a.length - b.length || a.join("/").localeCompare(b.join("/")))[0];
      const bestPath = best.join("/");
      return `/app/${segmentContext.appId}/${segmentContext.kind}/${bestPath}`;
    };

    const lists =
      segmentContext.kind === "route"
        ? routePathLists
        : segmentContext.kind === "action"
          ? actionPathLists
          : segmentContext.kind === "command"
            ? commandPathLists
            : rpcPathLists;

    return segmentOptions.map((value) => {
      // Check if this child has its own children (grandchildren of current prefix)
      const nextPrefix = [...prefix, value];
      const grandchildLevel = nextPrefix.length;
      const hasGrandchildren = lists.some(
        (segs) => segs.length > grandchildLevel && nextPrefix.every((v, i) => segs[i] === v),
      );

      return {
      id: `seg:${childLevel}:${value}`,
      label: value,
      hint: buildPreview(value),
      hasChildren: hasGrandchildren,
      action: () => {
        if (segmentContext.kind === "route") {
          const bestPath = findBestRoutePath([...prefix, value]);
          recordRecent({ kind: "route", value: bestPath });
          onNavigate(`${bestPath}${segmentContext.queryString}`);
          return;
        }

        const preview = buildPreview(value);
        if (segmentContext.kind === "action") {
          const marker = `/app/${segmentContext.appId}/action/`;
          const tail = preview.startsWith(marker) ? preview.slice(marker.length) : "";
          const actionIdTail = tail.split("/").filter(Boolean).join(".");
          const actionId = actionIdTail ? `${namespace}.${actionIdTail}` : `${namespace}.${[...prefix, value].join(".")}`;
          recordRecent({ kind: "action", value: actionId });
        }
        onNavigate(`${preview}${segmentContext.queryString}`);
      },
    };
    });
  }, [
    actionPathLists,
    commandPathLists,
    findBestRoutePath,
    namespace,
    onNavigate,
    recordRecent,
    routePathLists,
    rpcPathLists,
    segmentContext,
    segmentOptions,
  ]);

  const routeItems: SearchItem[] = useMemo(() => {
    const routes = Object.values(config.routes ?? {}) as UniversalRoute[];
    return routes
      .filter(routeIsNavigable)
      .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""))
      .map((route) => ({
        id: `route:${route.id}`,
        label: `Go: ${route.path}`,
        hint: buildUniversalIntentUrl({ kind: "route", path: route.path }, intentScheme, appId),
        action: () => {
          recordRecent({ kind: "route", value: route.path });
          onNavigate(route.path);
        },
      }));
  }, [appId, config.routes, intentScheme, onNavigate, recordRecent]);

  const actionItems: SearchItem[] = useMemo(() => {
    const actions = Object.values(config.actions ?? {}) as UniversalAction[];
    return actions
      .filter((action) => Boolean(action?.id))
      .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
      .map((action) => ({
        id: `action:${action.id}`,
        label: `Run: ${action.id.replace(/^work\\./, "").replace(/\\./g, " ")}`,
        hint: buildUniversalIntentUrl({ kind: "action", id: action.id }, intentScheme, appId),
        action: () => {
          recordRecent({ kind: "action", value: action.id });
          onExecute(action.id);
        },
      }));
  }, [appId, config.actions, intentScheme, onExecute, recordRecent]);

  const commonItems: SearchItem[] = useMemo(() => {
    const items: SearchItem[] = [];
    const stages = Object.values(config.stages ?? {}).filter(Boolean);
    stages
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach((stage) => {
        const defaultRoute = typeof stage.defaultRoute === "string" ? stage.defaultRoute : "";
        if (!defaultRoute) return;
        const normalized = normalizeRoutePath(defaultRoute);
        items.push({
          id: `go:stage:${stage.id}`,
          label: `Go: ${stage.label}`,
          hint: buildUniversalIntentUrl({ kind: "route", path: normalized }, intentScheme, appId),
          action: () => {
            recordRecent({ kind: "route", value: normalized });
            onNavigate(normalized);
          },
        });

        if (stage.id === "system" && stage.subnav) {
          Object.values(stage.subnav)
            .filter(Boolean)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .forEach((entry) => {
              const path = typeof entry.path === "string" ? entry.path : "";
              if (!path) return;
              const normalizedSub = normalizeRoutePath(path);
              items.push({
                id: `go:subnav:${stage.id}:${entry.label}:${normalizedSub}`,
                label: `Go: ${stage.label} / ${entry.label}`,
                hint: buildUniversalIntentUrl({ kind: "route", path: normalizedSub }, intentScheme, appId),
                action: () => {
                  recordRecent({ kind: "route", value: normalizedSub });
                  onNavigate(normalizedSub);
                },
              });
            });
        }
      });

    return items;
  }, [appId, config.stages, intentScheme, onNavigate, recordRecent]);

  const removeRecent = useCallback((kind: string, value: string) => {
    setRecents((prev) => {
      const next = prev.filter((e) => !(e.kind === kind && e.value === value));
      writeRecents(next);
      return next;
    });
  }, []);

  const clearAllRecents = useCallback(() => {
    setRecents([]);
    writeRecents([]);
  }, []);

  // Validate recents: prune entries that no longer exist in the config
  const validRecents = useMemo(() => {
    const routePaths = new Set(
      (Object.values(config.routes ?? {}) as UniversalRoute[])
        .filter((r) => typeof r.path === "string")
        .map((r) => normalizeRoutePath(r.path)),
    );
    const actionIds = new Set(
      (Object.values(config.actions ?? {}) as UniversalAction[])
        .filter((a) => typeof a.id === "string")
        .map((a) => a.id),
    );
    return recents.filter((entry) => {
      if (entry.kind === "route") return routePaths.has(normalizeRoutePath(entry.value));
      if (entry.kind === "action") return actionIds.has(entry.value);
      return true; // keep "nav" entries (arbitrary URLs)
    });
  }, [config.actions, config.routes, recents]);

  const recentItems: SearchItem[] = useMemo(() => {
    if (validRecents.length === 0) return [];
    const items: SearchItem[] = [];
    for (const entry of validRecents) {
      if (entry.kind === "route") {
        const path = normalizeRoutePath(entry.value);
        items.push({
          id: `recent:route:${path}`,
          label: `Recent: ${path}`,
          hint: buildUniversalIntentUrl({ kind: "route", path }, intentScheme, appId),
          action: () => onNavigate(path),
        });
      } else if (entry.kind === "action") {
        const id = entry.value;
        items.push({
          id: `recent:action:${id}`,
          label: `Recent: ${id.replace(/^work\\./, "").replace(/\\./g, " ")}`,
          hint: buildUniversalIntentUrl({ kind: "action", id }, intentScheme, appId),
          action: () => onExecute(id),
        });
      } else if (entry.kind === "nav") {
        const target = entry.value;
        items.push({
          id: `recent:nav:${target}`,
          label: `Recent: ${target}`,
          hint: target,
          action: () => onNavigate(target),
        });
      }
    }
    if (items.length > 0) {
      items.push({
        id: "recent:clear-all",
        label: "Clear all recents",
        action: () => clearAllRecents(),
        stayOpen: true,
      });
    }
    return items;
  }, [appId, clearAllRecents, intentScheme, onExecute, onNavigate, validRecents]);

  const docItems: SearchItem[] = useMemo(() => {
    if (docEntries.length === 0) return [];
    return docEntries.map((entry) => ({
      id: `doc:${entry.id}`,
      label: `Doc: ${entry.title}`,
      hint: `/system/docs?doc=${encodeURIComponent(entry.id)}`,
      action: () => {
        onNavigate(`/system/docs?doc=${encodeURIComponent(entry.id)}`);
      },
    }));
  }, [docEntries, onNavigate]);

  const commandSearchItems: SearchItem[] = useMemo(() => {
    const commands = Object.values(config.commands ?? {}) as UniversalCommand[];
    return commands
      .filter((cmd) => typeof cmd?.id === "string" && cmd.id.trim().length > 0)
      .filter((cmd) => cmd.id.startsWith(`${namespace}.`))
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((cmd) => ({
        id: `command:${cmd.id}`,
        label: `Cmd: ${cmd.id.replace(new RegExp(`^${namespace}\\.`), "").replace(/\./g, " ")}`,
        hint: `/app/${appId}/command/${cmd.id.replace(new RegExp(`^${namespace}\\.`), "").replace(/\./g, "/")}`,
        action: () => {
          onNavigate(`/app/${appId}/command/${cmd.id.replace(new RegExp(`^${namespace}\\.`), "").replace(/\./g, "/")}`);
        },
      }));
  }, [appId, config.commands, namespace, onNavigate]);

  const rpcSearchItems: SearchItem[] = useMemo(() => {
    const commands = Object.values(config.commands ?? {}) as UniversalCommand[];
    return commands
      .filter((cmd) => cmd.kind === "rpc")
      .filter((cmd) => typeof cmd?.id === "string" && cmd.id.trim().length > 0)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((cmd) => ({
        id: `command:rpc:${cmd.id}`,
        label: `RPC: ${cmd.id.replace(/\./g, " ")}`,
        hint: `/app/${appId}/rpc/${cmd.id.replace(/\./g, "/")}`,
        action: () => {
          onNavigate(`/app/${appId}/rpc/${cmd.id.replace(/\./g, "/")}`);
        },
      }));
  }, [appId, config.commands, onNavigate]);

  const normalizedQuery = query.trim().toLowerCase();
  const linkMode = useMemo(() => {
    if (!segmentContext) return false;
    if (!query.trim()) return false;
    return !/\s/.test(query.trim());
  }, [query, segmentContext]);

  const scopedItems = useCallback(
    (items: {
      recentItems: SearchItem[];
      commonItems: SearchItem[];
      routeItems: SearchItem[];
      actionItems: SearchItem[];
      commandSearchItems: SearchItem[];
      rpcSearchItems: SearchItem[];
      docItems: SearchItem[];
      extraItems?: SearchItem[];
    }) => {
      const extra = items.extraItems ?? [];
      switch (activeScope) {
        case "routes":
          return [...items.routeItems, ...items.commonItems, ...extra];
        case "actions":
          return [...items.actionItems, ...extra];
        case "commands":
          return [...items.commandSearchItems, ...items.rpcSearchItems, ...extra];
        case "docs":
          return [...items.docItems, ...extra];
        case "recents":
          return [...items.recentItems, ...extra];
        case "all":
        default:
          return [
            ...items.commonItems,
            ...extra,
            ...items.routeItems,
            ...items.actionItems,
            ...items.commandSearchItems,
            ...items.rpcSearchItems,
            ...items.recentItems,
            ...items.docItems,
          ];
      }
    },
    [activeScope],
  );

  // Top 3 recents that match the current query or segment path
  const relevantRecents = useMemo(() => {
    if (recentItems.length === 0) return [];
    // Exclude the "clear all" item from contextual recents
    const actual = recentItems.filter((r) => r.id !== "recent:clear-all");
    if (!query.trim()) return actual.slice(0, 3);
    const q = query.trim().toLowerCase();
    return actual
      .filter((item) => `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(q))
      .slice(0, 3);
  }, [query, recentItems]);

  const allItems = useMemo(() => {
    const sources = { recentItems, commonItems, routeItems, actionItems, commandSearchItems, rpcSearchItems, docItems, extraItems };
    if (!query.trim()) {
      if (activeScope === "recents") {
        return [...recentItems, ...(extraItems ?? [])];
      }
      // Cap recents to 3 outside the dedicated recents scope
      const topRecents = recentItems.filter((r) => r.id !== "recent:clear-all").slice(0, 3);
      if (activeScope === "all") {
        return [...commonItems, ...(extraItems ?? []), ...routeItems, ...actionItems, ...commandSearchItems, ...rpcSearchItems, ...topRecents, ...docItems];
      }
      const scoped = scopedItems({ ...sources, recentItems: topRecents });
      return scoped;
    }
    if (linkMode) {
      // Include matching recents alongside segment tree items
      return [...(directItem ? [directItem] : []), ...segmentItems, ...relevantRecents, ...(extraItems ?? [])];
    }
    const cappedSources = activeScope === "recents" ? sources : { ...sources, recentItems: relevantRecents };
    const scoped = scopedItems(cappedSources);
    return [...(directItem ? [directItem] : []), ...scoped];
  }, [activeScope, actionItems, commandSearchItems, commonItems, directItem, docItems, extraItems, linkMode, query, recentItems, relevantRecents, routeItems, rpcSearchItems, scopedItems, segmentItems]);

  const filtered = linkMode
    ? allItems
    : normalizedQuery
      ? allItems.filter((item) =>
          `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(normalizedQuery),
        )
      : allItems.slice(0, 12);

  useEffect(() => {
    if (isOpen) {
      const seed = typeof initialQuery === "string" ? initialQuery : "";
      const normalizedSeed = seed && looksLikeLinkOrPath(seed) ? parseNavTarget(seed) ?? seed : seed;
      setQuery(normalizedSeed);
      setActiveIndex(0);
      setSegmentIndex(0);
      // Reset scope to 'all' when opening fresh (no initialQuery)
      if (!seed) {
        setActiveScope("all");
      }
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (normalizedSeed) {
          inputRef.current?.select();
        }
      });
    }
  }, [isOpen, initialQuery]);

  // Clear state when palette closes
  useEffect(() => {
    if (!isOpen) {
      setPreviewRoute(null);
      setRouteBeforePreview(null);
      setScopeFocused(false);
    }
  }, [isOpen]);

  // Unlock results height when leaving preview
  useEffect(() => {
    if (!previewRoute) {
      const el = resultsRef.current;
      if (el) el.style.minHeight = "";
    }
  }, [previewRoute]);

  useEffect(() => {
    const active = itemRefs.current[activeIndex];
    if (!active) return;
    active.scrollIntoView({ block: "nearest" });
  }, [activeIndex, filtered.length]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        // Revert preview route before closing
        if (previewRoute && routeBeforePreview) {
          onNavigate(routeBeforePreview);
        }
        setPreviewRoute(null);
        setRouteBeforePreview(null);
        onClose();
        return;
      }
      // ── Scope-bar focused: handle all keys here before anything else ──
      if (scopeFocused) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const scopeIds = SCOPES.map((s) => s.id);
          const currentIdx = scopeIds.indexOf(activeScope);
          const delta = e.key === "ArrowRight" ? 1 : -1;
          const nextIdx = (currentIdx + delta + scopeIds.length) % scopeIds.length;
          setActiveScope(scopeIds[nextIdx]);
          setActiveIndex(0);
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setScopeFocused(false);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          // Already at top, no-op
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          // Confirm scope selection, return to results
          setScopeFocused(false);
          return;
        }
        // Any other key (typing): exit scope focus, let input handle it
        setScopeFocused(false);
      }

      // Tab / Shift+Tab cycles scopes when not in segment context
      if (e.key === "Tab" && !segmentContext) {
        e.preventDefault();
        const scopeIds = SCOPES.map((s) => s.id);
        const currentIdx = scopeIds.indexOf(activeScope);
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = (currentIdx + delta + scopeIds.length) % scopeIds.length;
        setActiveScope(scopeIds[nextIdx]);
        setActiveIndex(0);
        return;
      }
      // ArrowLeft while previewing: revert and return to palette (works in any mode)
      if (e.key === "ArrowLeft" && previewRoute && routeBeforePreview) {
        e.preventDefault();
        onNavigate(routeBeforePreview);
        setPreviewRoute(null);
        setRouteBeforePreview(null);
        return;
      }

      // ArrowRight while previewing: no-op (← reverts, Enter confirms)
      if (e.key === "ArrowRight" && previewRoute) {
        e.preventDefault();
        return;
      }

      // ArrowRight in keyword mode (no segmentContext): enter tree navigation
      // by injecting the highlighted item's path into the query field.
      if (e.key === "ArrowRight" && !segmentContext) {
        const item = filtered[activeIndex];
        if (!item) return;
        e.preventDefault();

        // Extract a navigable path from the item id
        let pathToInject: string | null = null;
        if (item.id.startsWith("route:")) {
          // route:plan → find the route path from config
          const routeId = item.id.slice("route:".length);
          const route = Object.values(config.routes ?? {}).find((r: any) => r.id === routeId) as UniversalRoute | undefined;
          if (route?.path) pathToInject = route.path;
        } else if (item.id.startsWith("go:stage:")) {
          // go:stage:plan → extract from hint (intent URL) or label
          const match = item.label.match(/Go:\s*(.+)/);
          if (match) {
            // Find the stage's default route
            const stages = Object.values(config.stages ?? {});
            const stage = stages.find((s: any) => s.label === match[1].trim());
            if (stage && typeof stage.defaultRoute === "string") {
              pathToInject = normalizeRoutePath(stage.defaultRoute);
            }
          }
        } else if (item.id.startsWith("recent:route:")) {
          pathToInject = item.id.slice("recent:route:".length);
        } else if (item.id.startsWith("action:")) {
          const actionId = item.id.slice("action:".length);
          pathToInject = `/app/${appId}/action/${actionId.replace(new RegExp(`^${namespace}\\.`), "").replace(/\./g, "/")}`;
        } else if (item.id.startsWith("recent:nav:")) {
          pathToInject = item.id.slice("recent:nav:".length);
        }

        if (pathToInject) {
          const normalized = normalizeRoutePath(pathToInject);
          setQuery(normalized);
          setSegmentIndex(0);
          setActiveIndex(0);
        }
        return;
      }

      // ArrowLeft in keyword mode: no-op (let native cursor behavior work)
      // ArrowLeft/Right in segment mode: hierarchical tree navigation
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && segmentContext) {
        e.preventDefault();

        if (e.key === "ArrowRight") {
          // No children → leaf node → enter preview mode
          if (segmentOptions.length === 0) {
            const item = filtered[activeIndex];
            if (item) {
              const el = resultsRef.current;
              if (el) el.style.minHeight = `${el.offsetHeight}px`;

              const currentPath = window.location.hash.replace(/^#/, "") || "/plan";
              setRouteBeforePreview(currentPath);
              const targetPath = item.hint ?? "";
              onNavigate(targetPath);
              setPreviewRoute(targetPath);
            }
            return;
          }

          // Drill into highlighted child: append it to the query path
          const item = filtered[activeIndex];
          if (item) {
            const childValue = segmentOptions[activeIndex] ?? segmentOptions[0];
            if (childValue) {
              const newSegments = [...segmentContext.segments, childValue];
              if (segmentContext.kind === "route") {
                setQuery(normalizeRoutePath(`/${newSegments.join("/")}`));
              } else {
                setQuery(`/app/${segmentContext.appId}/${segmentContext.kind}/${newSegments.join("/")}`);
              }
              setSegmentIndex(newSegments.length - 1);
              setActiveIndex(0);
            }
          }
          return;
        }

        if (e.key === "ArrowLeft") {
          // Go to parent: remove last segment
          const parentSegments = segmentContext.segments.slice(0, -1);
          if (parentSegments.length === 0) {
            // At root level, exit segment mode
            setQuery("");
            setSegmentIndex(0);
          } else {
            if (segmentContext.kind === "route") {
              setQuery(normalizeRoutePath(`/${parentSegments.join("/")}`));
            } else {
              setQuery(`/app/${segmentContext.appId}/${segmentContext.kind}/${parentSegments.join("/")}`);
            }
            setSegmentIndex(parentSegments.length - 1);
          }
          setActiveIndex(0);
          return;
        }
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (activeIndex <= 0) {
          // At top of results, move focus to scope bar
          setScopeFocused(true);
          return;
        }
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      // Delete/Backspace removes the highlighted recent item (when input is empty)
      if ((e.key === "Delete" || (e.key === "Backspace" && !query.trim())) && filtered[activeIndex]) {
        const item = filtered[activeIndex];
        if (item.id.startsWith("recent:route:")) {
          e.preventDefault();
          removeRecent("route", item.id.slice("recent:route:".length));
          return;
        }
        if (item.id.startsWith("recent:action:")) {
          e.preventDefault();
          removeRecent("action", item.id.slice("recent:action:".length));
          return;
        }
        if (item.id.startsWith("recent:nav:")) {
          e.preventDefault();
          removeRecent("nav", item.id.slice("recent:nav:".length));
          return;
        }
      }
      if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        // If previewing, confirm the preview route
        if (previewRoute) {
          recordRecent({ kind: "route", value: previewRoute });
          setPreviewRoute(null);
          setRouteBeforePreview(null);
          onClose();
          return;
        }
        const item = filtered[activeIndex];
        item.action();
        if (!item.stayOpen) {
          onClose();
        }
      }
    },
    [activeScope, filtered, activeIndex, onClose, onNavigate, previewRoute, recordRecent, removeRecent, routeBeforePreview, scopeFocused, segmentContext, segmentIndex, segmentOptions],
  );

  const footerHints = useMemo(() => {
    if (previewRoute) {
      return [
        { key: "Enter", label: "Confirm" },
        { key: "\u2190", label: "Back" },
        { key: "Esc", label: "Cancel" },
      ];
    }
    if (segmentContext) {
      return [
        { key: "\u2190", label: "Back" },
        { key: "\u2192", label: "Deeper" },
        { key: "\u2191\u2193", label: "Options" },
        { key: "Enter", label: "Open" },
        { key: "Esc", label: "Close" },
      ];
    }
    if (scopeFocused) {
      return [
        { key: "\u2190\u2192", label: "Scopes" },
        { key: "\u2193", label: "Results" },
        { key: "Esc", label: "Close" },
      ];
    }
    const isRecent = filtered[activeIndex]?.id.startsWith("recent:");
    const hints = [
      { key: "\u2191\u2193", label: "Navigate" },
      { key: "\u2192", label: "Drill in" },
      { key: "Enter", label: "Open" },
      { key: "Tab", label: "Scope" },
      { key: "Esc", label: "Close" },
    ];
    if (isRecent) hints.splice(3, 0, { key: "Del", label: "Remove" });
    return hints;
  }, [filtered, activeIndex, previewRoute, scopeFocused, segmentContext]);

  const activeItemId = filtered[activeIndex] ? `palette-item-${activeIndex}` : undefined;

  const statusText = useMemo(() => {
    if (previewRoute) return `Previewing ${previewRoute}`;
    const scopeLabel = activeScope === "all" ? "All" : activeScope;
    const pathLabel = segmentContext ? ` in ${segmentContext.segments.join("/")}` : "";
    return `${scopeLabel}${pathLabel}, ${filtered.length} result${filtered.length === 1 ? "" : "s"}`;
  }, [activeScope, filtered.length, previewRoute, segmentContext]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="command-palette-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (previewRoute && routeBeforePreview) {
          onNavigate(routeBeforePreview);
        }
        setPreviewRoute(null);
        setRouteBeforePreview(null);
        onClose();
      }}
    >
      <div
        className={`command-palette-panel${previewRoute ? " palette-previewing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="command-palette-header">
          <span className="command-palette-search-icon" aria-hidden="true">
            <IconSearch />
          </span>
          <input
            ref={inputRef}
            role="combobox"
            aria-haspopup="tree"
            aria-expanded={filtered.length > 0}
            aria-controls="palette-tree"
            aria-activedescendant={activeItemId}
            aria-autocomplete="list"
            type="text"
            className="command-palette-input"
            placeholder="Search actions or paste a link..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              setScopeFocused(false);
            }}
            onKeyDown={handleKeyDown}
            spellCheck={false}
          />
          <button type="button" className="command-palette-close" aria-label="Close" onClick={onClose}>
            Esc
          </button>
        </div>

        <div className="command-palette-breadcrumb" aria-label="Navigation path" role="navigation">
          <button
            type="button"
            className={`command-palette-token${!segmentContext ? ' token-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setActiveIndex(0);
            }}
          >
            {activeScope === 'all' ? 'All' : activeScope.charAt(0).toUpperCase() + activeScope.slice(1)}
          </button>
          {segmentContext && segmentContext.segments.map((segment, idx) => (
            <Fragment key={`${segment}-${idx}`}>
              <span className="command-palette-chevron">{'\u25B8'}</span>
              <button
                type="button"
                className={`command-palette-token${idx === segmentContext.segments.length - 1 ? ' token-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  // Truncate path to this level to browse its children
                  const truncated = segmentContext.segments.slice(0, idx + 1);
                  if (segmentContext.kind === "route") {
                    setQuery(normalizeRoutePath(`/${truncated.join("/")}`));
                  } else {
                    setQuery(`/app/${segmentContext.appId}/${segmentContext.kind}/${truncated.join("/")}`);
                  }
                  setSegmentIndex(idx);
                  setActiveIndex(0);
                }}
              >
                {segment}
              </button>
            </Fragment>
          ))}
        </div>

        <div className="command-palette-scopes" role="radiogroup" aria-label="Search scope">
          {SCOPES.map((scope) => (
            <button
              key={scope.id}
              type="button"
              role="radio"
              aria-checked={activeScope === scope.id}
              className={`command-palette-scope-pill${activeScope === scope.id ? " scope-active" : ""}${scopeFocused && activeScope === scope.id ? " scope-focused" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setActiveScope(scope.id);
                setActiveIndex(0);
              }}
            >
              {scope.label}
            </button>
          ))}
        </div>

        {filtered.length > 0 ? (
          <div ref={resultsRef} id="palette-tree" role="tree" aria-label={statusText} className="command-palette-results">
            {filtered.map((item, i) => (
              <div
                key={item.id}
                id={`palette-item-${i}`}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="treeitem"
                aria-selected={i === activeIndex}
                aria-expanded={item.hasChildren ? false : undefined}
                tabIndex={-1}
                className={`command-palette-item${i === activeIndex ? " palette-active" : ""}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  item.action();
                  if (!item.stayOpen) {
                    onClose();
                  }
                }}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="command-palette-item-icon" aria-hidden="true">
                  {itemIcon(item.id)}
                </span>
                <span className="command-palette-item-label">{item.label}</span>
                {item.hint ? <span className="command-palette-item-hint" aria-hidden="true">{item.hint}</span> : null}
                {item.id.startsWith("recent:") && (
                  <button
                    type="button"
                    className="command-palette-item-dismiss"
                    aria-label={`Remove ${item.label}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (item.id.startsWith("recent:route:")) removeRecent("route", item.id.slice("recent:route:".length));
                      else if (item.id.startsWith("recent:action:")) removeRecent("action", item.id.slice("recent:action:".length));
                      else if (item.id.startsWith("recent:nav:")) removeRecent("nav", item.id.slice("recent:nav:".length));
                    }}
                  >
                    {'\u00d7'}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div id="palette-tree" role="tree" className="command-palette-empty">
            <div role="treeitem" aria-selected="false">No matches.</div>
          </div>
        )}

        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {statusText}
        </div>

        <div className="command-palette-footer" aria-hidden="true">
          {footerHints.map((hint) => (
            <span key={hint.key} className="command-palette-hint">
              <kbd className="command-palette-kbd">{hint.key}</kbd> {hint.label}
            </span>
          ))}
        </div>
      </div>
    </div>,
    document.getElementById("root") ?? document.body,
  );
}
