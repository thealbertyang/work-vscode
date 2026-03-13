import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import {
  DEFAULT_UNIVERSAL_INTENT_SCHEME,
  ROUTE_META,
  SETTINGS_REGISTRY,
  UNIVERSAL_INTENT_KINDS,
  buildDeepLinkUrl,
  buildUniversalIntentUrl,
} from "@shared/contracts";
import { buildEnvKeys } from "@shared/app-identity";
import type { DocsIndex, DocGroup } from "@shared/docs-contract";
import type {
  TopologyConfig,
  UniversalAction,
  UniversalCommand,
  UniversalConfig,
  UniversalEnvironment,
  UniversalEvent,
  UniversalPlatform,
  UniversalRoute,
  UniversalStage,
  UniversalStorageTarget,
} from "@shared/universal";
import {
  DEFAULT_UNIVERSAL_CONFIG,
  deriveDomain,
  deriveStorageDomains,
  getDomainIds,
} from "@shared/universal";
import { KvGrid } from "../../components/KvGrid";
import { useAppContext } from "../../contexts/app-context";
import { useHandlers } from "../../hooks/use-handlers";
import { executeUniversalAction } from "../../lib/execute-universal-action";
import { useUrlParam, parseAsSectionList } from "../../lib/use-url-state";

export const Route = createFileRoute("/system/registry")({
  component: RegistryPage,
  staticData: ROUTE_META.systemRegistry,
});

const safeString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
};

const sortById = <T extends { id: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => a.id.localeCompare(b.id));

const routeIsNavigable = (route: UniversalRoute): boolean =>
  typeof route.path === "string" &&
  route.path.length > 0 &&
  !route.path.includes(":") &&
  !route.path.includes("$");

const WEBVIEW_SERVER_URL_ENV_KEYS = buildEnvKeys("WEBVIEW_SERVER_URL");

// ── Domain derivation (from shared topology engine) ─────────────────

const domainOf = (id: string, topology: TopologyConfig, stage?: string): string =>
  deriveDomain(id, topology, { stage }).domain;

function DomainBadge({ domain }: { domain: string }) {
  return <span className="domain-badge" data-domain={domain}>{domain}</span>;
}

// ── Component ──────────────────────────────────────────────

function RegistryPage() {
  const handlers = useHandlers();
  const navigate = useNavigate();
  const { universalConfig, deepLinkBase, isWebview, state } = useAppContext();

  const config: UniversalConfig = universalConfig ?? DEFAULT_UNIVERSAL_CONFIG;
  const topology = config.topology ?? DEFAULT_UNIVERSAL_CONFIG.topology!;
  const domainIds = useMemo(() => getDomainIds(topology), [topology]);
  const appId = config.app.id ?? DEFAULT_UNIVERSAL_CONFIG.app.id ?? "work";
  const intentScheme =
    config.app.intentScheme ?? DEFAULT_UNIVERSAL_CONFIG.app.intentScheme ?? DEFAULT_UNIVERSAL_INTENT_SCHEME;
  const hasVsCodeApi = typeof (window as any).acquireVsCodeApi === "function";

  const [fullConfig, setFullConfig] = useState<Record<string, unknown> | null>(null);
  const [fullConfigError, setFullConfigError] = useState("");
  const [docsIndex, setDocsIndex] = useState<DocsIndex | null>(null);

  const urlStateConfig = config.urlState;

  const [filter, setFilter] = useUrlParam("q", urlStateConfig);
  const [openSections, setOpenSections] = useQueryState(
    "open",
    parseAsSectionList.withDefault(["matrix", "entrypoints"]).withOptions({ history: "replace" }),
  );
  const [focus, setFocus] = useUrlParam("focus", urlStateConfig);

  const matrixOpen = openSections.includes("matrix");
  const entryPointsOpen = openSections.includes("entrypoints");
  const runtimeOpen = openSections.includes("runtime");
  const navigationOpen = openSections.includes("navigation");
  const actionsOpen = openSections.includes("actions");
  const operationsOpen = openSections.includes("operations");
  const signalsOpen = openSections.includes("signals");
  const preferencesOpen = openSections.includes("preferences");
  const storageOpen = openSections.includes("storage");

  useEffect(() => {
    if (!isWebview) return;
    let cancelled = false;
    setFullConfigError("");
    handlers
      .getFullConfig()
      .then((result) => {
        if (!cancelled) setFullConfig(result as unknown as Record<string, unknown>);
      })
      .catch((err) => {
        if (!cancelled) {
          setFullConfigError(err instanceof Error ? err.message : "Failed to load config.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handlers, isWebview]);

  useEffect(() => {
    if (!isWebview) return;
    let cancelled = false;
    handlers
      .getDocsIndex()
      .then((result) => {
        if (!cancelled) setDocsIndex(result);
      })
      .catch(() => {
        if (!cancelled) setDocsIndex(null);
      });
    return () => {
      cancelled = true;
    };
  }, [handlers, isWebview]);

  const wsBridgePort = useMemo(() => {
    const dev = (fullConfig?.dev ?? null) as Record<string, unknown> | null;
    const port = dev ? dev.wsBridgePort : undefined;
    return typeof port === "number" && Number.isFinite(port) ? port : 5174;
  }, [fullConfig]);

  const wsBridgeHost = useMemo(() => {
    const dev = (fullConfig?.dev ?? null) as Record<string, unknown> | null;
    const host = dev ? dev.wsBridgeHost : undefined;
    return typeof host === "string" && host.trim() ? host.trim() : "127.0.0.1";
  }, [fullConfig]);

  const wsBridgeToken = useMemo(() => {
    const dev = (fullConfig?.dev ?? null) as Record<string, unknown> | null;
    const token = dev ? dev.wsBridgeToken : undefined;
    return typeof token === "string" && token.trim() ? token.trim() : "";
  }, [fullConfig]);

  const preferredWebOrigin = useMemo(() => {
    const settings = (fullConfig?.settings ?? null) as Record<string, unknown> | null;
    const env = (fullConfig?.env ?? null) as Record<string, unknown> | null;
    const fromSettings = settings ? safeString(settings.webviewServerUrl) : "";
    const fromEnv = env
      ? WEBVIEW_SERVER_URL_ENV_KEYS.map((key) => safeString(env[key])).find(Boolean) ?? ""
      : "";
    const raw = (fromSettings || fromEnv || "http://localhost:5173").trim();
    try {
      const url = new URL(raw.includes("://") ? raw : `http://${raw}`);
      return url.origin;
    } catch {
      return "http://localhost:5173";
    }
  }, [fullConfig]);

  const copyText = useCallback(async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall back
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand("copy");
    } finally {
      document.body.removeChild(ta);
    }
  }, []);

  const scrollToSection = useCallback((id: string) => {
    if (!id) return;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event("work:commandPalette"));
  }, []);

  const setSectionOpen = useCallback(
    (sectionId: string, open: boolean) => {
      void setOpenSections((prev) => {
        const next = Array.from(new Set(prev ?? []));
        const idx = next.indexOf(sectionId);
        if (open && idx === -1) {
          next.push(sectionId);
        } else if (!open && idx !== -1) {
          next.splice(idx, 1);
        }
        next.sort((a, b) => a.localeCompare(b));
        return next;
      });
    },
    [setOpenSections],
  );

  const toggleSectionOpen = useCallback(
    (sectionId: string) => {
      setSectionOpen(sectionId, !openSections.includes(sectionId));
    },
    [openSections, setSectionOpen],
  );

  const openAndFocus = useCallback(
    (sectionId: string, focusId: string) => {
      setSectionOpen(sectionId, true);
      void setFocus(focusId);
      scrollToSection(focusId);
    },
    [scrollToSection, setFocus, setSectionOpen],
  );

  useEffect(() => {
    const id = focus.trim();
    if (!id) return;
    // Convention: focus targets like "registry-navigation" map to "navigation" section IDs.
    if (id.startsWith("registry-")) {
      const sectionId = id.slice("registry-".length);
      if (sectionId) {
        setSectionOpen(sectionId, true);
      }
    }
    scrollToSection(id);
  }, [focus, scrollToSection, setSectionOpen]);

  const routes: UniversalRoute[] = useMemo(
    () => Object.values(config.routes ?? {}) as UniversalRoute[],
    [config.routes],
  );
  const actions: UniversalAction[] = useMemo(
    () => Object.values(config.actions ?? {}) as UniversalAction[],
    [config.actions],
  );
  const commands: UniversalCommand[] = useMemo(
    () => Object.values(config.commands ?? {}) as UniversalCommand[],
    [config.commands],
  );
  const events: UniversalEvent[] = useMemo(
    () => Object.values(config.events ?? {}) as UniversalEvent[],
    [config.events],
  );
  const platforms: UniversalPlatform[] = useMemo(
    () => Object.values(config.platforms ?? {}) as UniversalPlatform[],
    [config.platforms],
  );
  const environments: UniversalEnvironment[] = useMemo(
    () => Object.values(config.environments ?? {}) as UniversalEnvironment[],
    [config.environments],
  );

  const stages: UniversalStage[] = useMemo(
    () =>
      Object.values(config.stages ?? {})
        .filter((s): s is UniversalStage => Boolean(s?.id))
        .sort((a, b) => a.order - b.order),
    [config.stages],
  );

  const routeMetaMap = ROUTE_META as Record<string, { stage?: string }>;

  const [activeDomain, setActiveDomain] = useState<string | null>(null);

  const domainCounts = useMemo(() => {
    const counts: Record<string, { commands: number; actions: number; events: number; routes: number; storage: string[] }> = {};
    for (const d of domainIds) counts[d] = { commands: 0, actions: 0, events: 0, routes: 0, storage: [] };
    for (const cmd of commands) counts[domainOf(cmd.id, topology)]!.commands++;
    for (const action of actions) counts[domainOf(action.id, topology)]!.actions++;
    for (const evt of events) counts[domainOf(evt.id, topology)]!.events++;
    for (const route of routes) {
      counts[domainOf(route.id, topology, routeMetaMap[route.id]?.stage)]!.routes++;
    }
    for (const target of Object.values(config.storage?.targets ?? {}) as UniversalStorageTarget[]) {
      for (const d of deriveStorageDomains(target.id, topology)) counts[d]?.storage.push(target.id);
    }
    return counts;
  }, [commands, actions, events, routes, config.storage?.targets, topology, domainIds]);

  const storageTargets: UniversalStorageTarget[] = useMemo(
    () => Object.values(config.storage?.targets ?? {}) as UniversalStorageTarget[],
    [config.storage?.targets],
  );

  const filterText = filter.trim().toLowerCase();
  const filterEnabled = Boolean(filterText);
  const formatCount = (filtered: number, total: number): string =>
    filterEnabled ? `${filtered}/${total}` : `${total}`;

  const filteredRoutes: UniversalRoute[] = useMemo(() => {
    let result = routes;
    if (activeDomain) result = result.filter((r) => domainOf(r.id, topology, routeMetaMap[r.id]?.stage) === activeDomain);
    if (filterEnabled) result = result.filter((route) => `${route.id} ${route.path}`.toLowerCase().includes(filterText));
    return result;
  }, [activeDomain, filterEnabled, filterText, routes, routeMetaMap, topology]);

  const filteredActions: UniversalAction[] = useMemo(() => {
    let result = actions;
    if (activeDomain) result = result.filter((a) => domainOf(a.id, topology) === activeDomain);
    if (filterEnabled) result = result.filter((action) =>
      `${action.id} ${safeString(action.route)} ${safeString(action.rpc)} ${safeString(action.command)}`
        .toLowerCase().includes(filterText));
    return result;
  }, [actions, activeDomain, filterEnabled, filterText, topology]);

  const filteredCommands: UniversalCommand[] = useMemo(() => {
    let result = commands;
    if (activeDomain) result = result.filter((c) => domainOf(c.id, topology) === activeDomain);
    if (filterEnabled) result = result.filter((cmd) =>
      `${cmd.id} ${cmd.kind} ${safeString(cmd.payloadSchema)}`.toLowerCase().includes(filterText));
    return result;
  }, [commands, activeDomain, filterEnabled, filterText, topology]);

  const filteredEvents: UniversalEvent[] = useMemo(() => {
    let result = events;
    if (activeDomain) result = result.filter((e) => domainOf(e.id, topology) === activeDomain);
    if (filterEnabled) result = result.filter((evt) =>
      `${evt.id} ${evt.kind} ${safeString(evt.payloadSchema)}`.toLowerCase().includes(filterText));
    return result;
  }, [events, activeDomain, filterEnabled, filterText, topology]);

  const filteredSettings = useMemo(() => {
    const all = Object.values(SETTINGS_REGISTRY).sort((a, b) => a.id.localeCompare(b.id));
    let result = all;
    if (filterEnabled) result = result.filter((setting) =>
      `${setting.id} ${setting.key} ${setting.type} ${(setting.envKeys ?? []).join(" ")} ${setting.description ?? ""}`
        .toLowerCase().includes(filterText));
    return result;
  }, [filterEnabled, filterText]);

  const filteredStorageTargets: UniversalStorageTarget[] = useMemo(() => {
    let result = storageTargets;
    if (activeDomain) result = result.filter((t) => deriveStorageDomains(t.id, topology).includes(activeDomain));
    if (filterEnabled) result = result.filter((target) =>
      `${target.id} ${target.kind} ${safeString(target.scope)} ${safeString(target.location)} ${target.description ?? ""}`
        .toLowerCase().includes(filterText));
    return result;
  }, [activeDomain, filterEnabled, filterText, storageTargets, topology]);

  const filteredPlatforms: UniversalPlatform[] = useMemo(() => {
    if (!filterEnabled) return platforms;
    return platforms.filter((platform) =>
      `${platform.id} ${safeString(platform.kind)} ${platform.description ?? ""}`
        .toLowerCase()
        .includes(filterText),
    );
  }, [filterEnabled, filterText, platforms]);

  const filteredEnvironments: UniversalEnvironment[] = useMemo(() => {
    if (!filterEnabled) return environments;
    return environments.filter((env) =>
      `${env.id} ${safeString(env.kind)} ${env.description ?? ""}`.toLowerCase().includes(filterText),
    );
  }, [environments, filterEnabled, filterText]);

  const deepLinkExamples = useMemo(() => {
    const route = "/plan";
    const intent = buildUniversalIntentUrl({ kind: "route", path: route }, intentScheme, appId);
    const appPath = `/app/${appId}/route${route}`;
    const appUrl = buildDeepLinkUrl(deepLinkBase, appPath);
    const webAppUrl = `${preferredWebOrigin}/#${appPath}`;

    return { appUrl, webAppUrl, intent };
  }, [appId, deepLinkBase, intentScheme, preferredWebOrigin]);

  const wsBridgeProxyUrl = useMemo(() => {
    // Clients now connect via the Vite proxy at /ws-bridge on the webview origin,
    // which forwards to the direct bridge port and injects the token server-side.
    try {
      const url = new URL(preferredWebOrigin);
      const wsScheme = url.protocol === "https:" ? "wss:" : "ws:";
      return `${wsScheme}//${url.host}/ws-bridge`;
    } catch {
      return "ws://localhost:5173/ws-bridge";
    }
  }, [preferredWebOrigin]);

  const browserAuthUrl = useMemo(() => {
    if (!wsBridgeToken) return "";
    // NOTE: `wsToken` must be BEFORE the hash. The browser client reads it from `window.location.search`.
    // Example: http://localhost:5173/?wsToken=...#/app/work/route/plan
    const appPath = `/app/${appId}/route/plan`;
    return `${preferredWebOrigin}/?wsToken=${encodeURIComponent(wsBridgeToken)}#${appPath}`;
  }, [appId, preferredWebOrigin, wsBridgeToken]);

  const docsCounts = useMemo(() => {
    const empty: Record<DocGroup, number> = { docs: 0, runbooks: 0, plans: 0, skills: 0 };
    const entries = docsIndex?.entries ?? [];
    for (const entry of entries) {
      empty[entry.group] = (empty[entry.group] ?? 0) + 1;
    }
    return empty;
  }, [docsIndex]);

  const storageTargetsCount = useMemo(
    () => Object.keys(config.storage?.targets ?? {}).length,
    [config.storage?.targets],
  );

  const actionsByCommandOrRpc = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const action of actions) {
      const add = (key: string) => {
        if (!key) return;
        if (!map[key]) map[key] = [];
        map[key].push(action.id);
      };
      if (action.command) add(String(action.command));
      if (action.rpc) add(String(action.rpc));
    }
    Object.values(map).forEach((list) => list.sort((a, b) => a.localeCompare(b)));
    return map;
  }, [actions]);

  const actionsByRouteRef = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const action of actions) {
      if (!action.route) continue;
      const key = String(action.route);
      if (!map[key]) map[key] = [];
      map[key].push(action.id);
    }
    Object.values(map).forEach((list) => list.sort((a, b) => a.localeCompare(b)));
    return map;
  }, [actions]);

  return (
    <section className="settings-unified">
      <div className="section">
        <div className="registry-toolbar">
          <input
            type="text"
            className="registry-filter"
            value={filter}
            onChange={(e) => void setFilter(e.target.value)}
            placeholder="Filter, or paste app://... vscode://... #/..."
            spellCheck={false}
            aria-label="Filter registry"
          />
          {filterEnabled ? (
            <button type="button" className="secondary" onClick={() => void setFilter(null)}>
              Clear
            </button>
          ) : null}
          <span className="registry-toolbar-sep" aria-hidden="true" />
          <button type="button" className="secondary" onClick={openCommandPalette}>
            Palette
          </button>
          <button type="button" className="secondary" onClick={() => navigate({ to: "/system/dev" })}>
            Dev
          </button>
        </div>
      </div>

      {activeDomain && (
        <div className="domain-filter-bar">
          Showing <DomainBadge domain={activeDomain} /> domain
          <button type="button" className="domain-filter-clear" onClick={() => setActiveDomain(null)} aria-label="Clear domain filter">
            Clear
          </button>
        </div>
      )}

      <div className="section">
        <button type="button" className="section-toggle" onClick={() => toggleSectionOpen("matrix")}>
          <span className="section-toggle-icon">{matrixOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Overview</span>
        </button>
        {matrixOpen && (
          <div className="section-body">
            {/* Layer × Domain grid */}
            <div className="topology-grid-scroll">
              <div className="topology-grid" role="grid" aria-label="Layer by Domain matrix">
                {/* Header row */}
                <div className="topology-cell topology-corner" />
                {domainIds.map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={`topology-cell topology-col-header topology-interactive${activeDomain === d ? " active" : ""}`}
                    style={{ color: topology.domains[d]?.color }}
                    onClick={() => setActiveDomain(activeDomain === d ? null : d)}
                    aria-label={`Filter to ${d} domain`}
                  >
                    {d}
                  </button>
                ))}

                {/* Interface row */}
                <div className="topology-cell topology-row-header">Interface</div>
                {domainIds.map((d) => (
                  <div key={d} className="topology-cell">
                    <div>{domainCounts[d].commands} ops</div>
                    <div>{domainCounts[d].actions} actions</div>
                    <div className="topology-detail">{domainCounts[d].routes} routes</div>
                  </div>
                ))}

                {/* Protocol row */}
                <div className="topology-cell topology-row-header">Protocol</div>
                {domainIds.map((d) => (
                  <div key={d} className="topology-cell">
                    <div><code>IpcEnvelope</code></div>
                    <div><code>JSON-RPC</code></div>
                    {d === "view" ? <div className="topology-detail">+ hash history</div> : null}
                  </div>
                ))}

                {/* Transport row */}
                <div className="topology-cell topology-row-header">Transport</div>
                {domainIds.map((d) => (
                  <div key={d} className="topology-cell">
                    <div><code>WS</code> via Vite proxy</div>
                    {d === "view" ? <div className="topology-detail">+ TanStack Router</div> : null}
                    {d === "app" ? <div className="topology-detail">:5173{"\u2192"}:5174</div> : null}
                  </div>
                ))}

                {/* Store row */}
                <div className="topology-cell topology-row-header">Store</div>
                {domainIds.map((d) => (
                  <div key={d} className="topology-cell">
                    {domainCounts[d].storage.map((s) => (
                      <div key={s}><code>{s}</code></div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Section index */}
            <div className="topology-index">
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("navigation", "registry-navigation")}>
                Navigation<span className="topology-index-count">{routes.length}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("actions", "registry-actions")}>
                Actions<span className="topology-index-count">{actions.length}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("operations", "registry-operations")}>
                Operations<span className="topology-index-count">{commands.length}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("signals", "registry-signals")}>
                Signals<span className="topology-index-count">{events.length}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("preferences", "registry-preferences")}>
                Preferences<span className="topology-index-count">{Object.keys(SETTINGS_REGISTRY).length}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("storage", "registry-storage")}>
                Persistence<span className="topology-index-count">{storageTargetsCount}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => openAndFocus("runtime", "registry-runtime")}>
                Runtime<span className="topology-index-count">{platforms.length + environments.length}</span>
              </button>
              <button type="button" className="topology-index-btn" onClick={() => navigate({ to: "/system/docs" })}>
                .claude<span className="topology-index-count">{docsIndex?.entries?.length ?? 0}</span>
              </button>
            </div>

            {(() => {
              const tok = (text: string, type: "publisher" | "domain" | "noun" | "verb" | "sep" | "literal") => {
                const colors: Record<string, string> = {
                  publisher: "var(--vscode-charts-gray, #888)",
                  domain: "var(--vscode-charts-blue, #4fc1ff)",
                  noun: "var(--vscode-charts-green, #89d185)",
                  verb: "var(--vscode-charts-orange, #cca700)",
                  sep: "var(--vscode-descriptionForeground, #888)",
                  literal: "var(--vscode-foreground)",
                };
                return <span style={{ color: colors[type], fontFamily: "var(--vscode-editor-font-family, monospace)" }}>{text}</span>;
              };

              const labelStyle: React.CSSProperties = { color: "var(--vscode-descriptionForeground)", whiteSpace: "nowrap" };

              return (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: "12px 0 8px", fontSize: 13, fontWeight: 600 }}>Naming Conventions</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 1fr", gap: "4px 16px", fontFamily: "var(--vscode-editor-font-family)", fontSize: 13, alignItems: "baseline" }}>
                    <span style={labelStyle}>Interface</span>
                    <span>{tok("domain", "domain")}{tok(".", "sep")}{tok("noun", "noun")}{tok(".", "sep")}{tok("verb", "verb")}</span>
                    <span>{tok("content", "domain")}{tok(".", "sep")}{tok("issue", "noun")}{tok(".", "sep")}{tok("get", "verb")}</span>

                    <span style={labelStyle}></span>
                    <span>{tok("domain", "domain")}{tok(".", "sep")}{tok("verb", "verb")}</span>
                    <span>{tok("identity", "domain")}{tok(".", "sep")}{tok("login", "verb")}</span>

                    <span style={labelStyle}>VS Code cmd</span>
                    <span>{tok("work", "publisher")}{tok(".", "sep")}{tok("domain", "domain")}{tok(".", "sep")}{tok("noun", "noun")}{tok(".", "sep")}{tok("verb", "verb")}</span>
                    <span>{tok("work", "publisher")}{tok(".", "sep")}{tok("content", "domain")}{tok(".", "sep")}{tok("issue", "noun")}{tok(".", "sep")}{tok("open", "verb")}</span>

                    <span style={labelStyle}>Events</span>
                    <span>{tok("domain", "domain")}{tok(".", "sep")}{tok("noun", "noun")}{tok(".", "sep")}{tok("event", "verb")}</span>
                    <span>{tok("view", "domain")}{tok(".", "sep")}{tok("webview", "noun")}{tok(".", "sep")}{tok("ready", "verb")}</span>

                    <span style={labelStyle}>Settings</span>
                    <span>{tok("work", "publisher")}{tok(".", "sep")}{tok("key", "literal")}</span>
                    <span>{tok("work", "publisher")}{tok(".", "sep")}{tok("baseUrl", "literal")}</span>

                    <span style={labelStyle}>Routes</span>
                    <span>{tok("/", "sep")}{tok("stage", "domain")}{tok("/", "sep")}{tok("sub", "noun")}</span>
                    <span>{tok("/", "sep")}{tok("plan", "domain")}{tok("/", "sep")}{tok("weekly", "noun")}</span>

                    <span style={labelStyle}>Intents</span>
                    <span>{tok("app://", "sep")}{tok("work", "publisher")}{tok("/", "sep")}{tok("kind", "noun")}{tok("/", "sep")}{tok("path", "domain")}</span>
                    <span>{tok("app://", "sep")}{tok("work", "publisher")}{tok("/", "sep")}{tok("route", "noun")}{tok("/", "sep")}{tok("plan", "domain")}</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      <div className="section" id="registry-lifecycle">
        <button type="button" className="section-toggle" onClick={() => toggleSectionOpen("lifecycle")}>
          <span className="section-toggle-icon">{openSections.includes("lifecycle") ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Lifecycle</span>
          <span className="section-count">{stages.length} stages</span>
        </button>
        {openSections.includes("lifecycle") && (
          <div className="section-body">
            <div className="lifecycle-track">
              {stages
                .filter((s) => s.id !== "system")
                .map((stage, i) => {
                  const routeCount = routes.filter((r) => routeMetaMap[r.id]?.stage === stage.id).length;
                  return (
                    <React.Fragment key={stage.id}>
                      {i > 0 ? <span className="lifecycle-arrow" aria-hidden="true">{"\u2192"}</span> : null}
                      <button
                        type="button"
                        className="lifecycle-stage"
                        onClick={() => navigate({ to: stage.defaultRoute })}
                        aria-label={`Go to ${stage.label}`}
                      >
                        {stage.label}
                        <span className="stage-count">{routeCount}</span>
                      </button>
                    </React.Fragment>
                  );
                })}
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              Stages define the sprint lifecycle. Each stage maps to routes in the <strong>view</strong> domain.
            </p>
          </div>
        )}
      </div>

      <div className="section" id="registry-entrypoints">
        <button
          type="button"
          className="section-toggle"
          onClick={() => toggleSectionOpen("entrypoints")}
        >
          <span className="section-toggle-icon">{entryPointsOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Entry points</span>
        </button>
        {entryPointsOpen && (
          <div className="section-body">
            {fullConfigError ? <div className="error">{fullConfigError}</div> : null}
            <KvGrid
              variant="list"
              items={[
                { label: "Wrapper base", value: deepLinkBase || "\u2014", onCopy: deepLinkBase ? () => copyText(deepLinkBase) : undefined },
                { label: "Preferred wrapper (/app)", value: deepLinkExamples.appUrl || "\u2014", onCopy: deepLinkExamples.appUrl ? () => copyText(deepLinkExamples.appUrl) : undefined },
                { label: "Preferred web URL (hash + /app)", value: deepLinkExamples.webAppUrl, onCopy: () => copyText(deepLinkExamples.webAppUrl) },
                { label: "Intent scheme", value: intentScheme || "\u2014", muted: true },
                { label: "Canonical intent URL", value: deepLinkExamples.intent, muted: true, onCopy: () => copyText(deepLinkExamples.intent) },
                { label: "IPC transport", value: "WS via Vite proxy (IpcEnvelope + JSON-RPC 2.0)" },
                {
                  label: "WS bridge (browser dev)",
                  value: `${wsBridgeProxyUrl} (via Vite proxy)`,
                },
                { label: "Extension", value: state.extensionId || "\u2014", muted: true, onCopy: state.extensionId ? () => copyText(state.extensionId) : undefined },
                { label: "URI scheme", value: state.uriScheme || "\u2014", muted: true },
              ]}
            />

            <div className="actions" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => copyText(wsBridgeToken)}
                disabled={!wsBridgeToken}
              >
                Copy WS token
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => copyText(browserAuthUrl)}
                disabled={!browserAuthUrl}
                title="Opens localhost with ?wsToken=... once; token persists in localStorage"
              >
                Copy browser auth URL
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  navigate({ to: "/system/docs", search: { doc: "docs/universal-matrix.md" } })
                }
              >
                Open matrix doc
              </button>
            </div>

            <p className="note" style={{ marginTop: 10 }}>
              Browser dev auth: open the copied <code>browser auth URL</code> once. It stores{" "}
              <code>wsToken</code> in <code>localStorage</code> and removes it from the URL.
            </p>
          </div>
        )}
      </div>

      <div className="section" id="registry-runtime">
        <button type="button" className="section-toggle" onClick={() => toggleSectionOpen("runtime")}>
          <span className="section-toggle-icon">{runtimeOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Runtime</span>
          <span className="section-count">
            platforms {formatCount(filteredPlatforms.length, platforms.length)} {"\u00b7"} env{" "}
            {formatCount(filteredEnvironments.length, environments.length)}
          </span>
        </button>
        {runtimeOpen && (
          <div className="section-body">
            <div className="registry-split">
              <div className="registry-split-panel">
                <div className="registry-subhead">
                  <span>Platforms</span>
                  <span className="section-count">
                    {formatCount(filteredPlatforms.length, platforms.length)}
                  </span>
                </div>
                <ul className="list">
                  {sortById(filteredPlatforms)
                    .filter((platform) => Boolean(platform?.id))
                    .map((platform) => (
                      <li key={platform.id}>
                        <code>{platform.id}</code>{" "}
                        {platform.kind ? <span className="note">({platform.kind})</span> : null}{" "}
                        {platform.description ? <span className="note">{platform.description}</span> : null}
                      </li>
                    ))}
                </ul>
              </div>

              <div className="registry-split-panel">
                <div className="registry-subhead">
                  <span>Environments</span>
                  <span className="section-count">
                    {formatCount(filteredEnvironments.length, environments.length)}
                  </span>
                </div>
                <ul className="list">
                  {sortById(filteredEnvironments)
                    .filter((env) => Boolean(env?.id))
                    .map((env) => (
                      <li key={env.id}>
                        <code>{env.id}</code> {env.kind ? <span className="note">({env.kind})</span> : null}{" "}
                        {env.description ? <span className="note">{env.description}</span> : null}
                      </li>
                    ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="section" id="registry-navigation">
        <button
          type="button"
          className="section-toggle"
          onClick={() => toggleSectionOpen("navigation")}
        >
          <span className="section-toggle-icon">{navigationOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Navigation</span>
          <span className="section-count">{formatCount(filteredRoutes.length, routes.length)}</span>
        </button>
        {navigationOpen && (
          <div className="section-body">
            <ul className="list">
              {filteredRoutes
                .filter((route) => Boolean(route?.id && route?.path))
                .sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""))
                .map((route) => {
                  const canNav = routeIsNavigable(route);
                  const intent = buildUniversalIntentUrl(
                    { kind: "route", path: route.path },
                    intentScheme,
                    appId,
                  );
                  const preferredDeepLink =
                    deepLinkBase && canNav
                      ? buildDeepLinkUrl(deepLinkBase, `/app/${appId}/route${route.path}`)
                      : "";
                  const linkedActions = actionsByRouteRef[route.id] ?? [];
                  return (
                    <li key={route.id}>
                      <code>{route.path}</code> <DomainBadge domain={domainOf(route.id, topology, routeMetaMap[route.id]?.stage)} /> <span className="note">({route.id})</span>{" "}
                      {canNav ? (
                        <a
                          href="#"
                          className="inline-route-link"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate({ to: route.path });
                          }}
                        >
                          open
                        </a>
                      ) : null}{" "}
                      <a
                        href="#"
                        className="inline-route-link"
                        onClick={(e) => {
                          e.preventDefault();
                          void copyText(intent);
                        }}
                      >
                        copy intent
                      </a>
                      {preferredDeepLink ? (
                        <>
                          {" "}
                          <a
                            href="#"
                            className="inline-route-link"
                            onClick={(e) => {
                              e.preventDefault();
                              void copyText(preferredDeepLink);
                            }}
                          >
                            copy deep link
                          </a>
                        </>
                      ) : null}{" "}
                      {linkedActions.length > 0 ? (
                        <a
                          href="#"
                          className="inline-route-link"
                          onClick={(e) => {
                            e.preventDefault();
                            void setFilter(route.id);
                            openAndFocus("actions", "registry-actions");
                          }}
                        >
                          actions {linkedActions.length}
                        </a>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>

      <div className="section" id="registry-actions">
        <button type="button" className="section-toggle" onClick={() => toggleSectionOpen("actions")}>
          <span className="section-toggle-icon">{actionsOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Actions</span>
          <span className="section-count">{formatCount(filteredActions.length, actions.length)}</span>
        </button>
        {actionsOpen && (
          <div className="section-body">
            <ul className="list">
              {sortById(filteredActions)
                .filter((action) => Boolean(action?.id))
                .map((action) => {
                  const routeRef = safeString(action.route);
                  const routePath = routeRef ? safeString(config.routes?.[routeRef]?.path) : "";
                  const intent = buildUniversalIntentUrl({ kind: "action", id: action.id }, intentScheme, appId);
                  return (
                    <li key={action.id}>
                      <code>{action.id}</code> <DomainBadge domain={domainOf(action.id, topology)} />{" "}
                      <a
                        href="#"
                        className="inline-route-link"
                        onClick={(e) => {
                          e.preventDefault();
                          void copyText(intent);
                        }}
                      >
                        copy intent
                      </a>{" "}
                      <a
                        href="#"
                        className="inline-route-link"
                        onClick={(e) => {
                          e.preventDefault();
                          void executeUniversalAction(action.id, {
                            config,
                            handlers,
                            onNavigate: (path) => navigate({ to: path }),
                          });
                        }}
                      >
                        run
                      </a>
                      {action.description ? <span className="note"> {action.description}</span> : null}
                      {routeRef ? (
                        <>
                          {" "}
                          <span className="note">route</span> <code>{routeRef}</code>
                          {routePath ? (
                            <>
                              {" "}
                              <a
                                href="#"
                                className="inline-route-link"
                                onClick={(e) => {
                                  e.preventDefault();
                                  navigate({ to: routePath });
                                }}
                              >
                                open
                              </a>
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {action.rpc ? (
                        <>
                          {" "}
                          <span className="note">rpc</span> <code>{safeString(action.rpc)}</code>
                        </>
                      ) : null}
                      {action.command ? (
                        <>
                          {" "}
                          <span className="note">cmd</span> <code>{safeString(action.command)}</code>
                        </>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>

      <div className="section" id="registry-operations">
        <button
          type="button"
          className="section-toggle"
          onClick={() => toggleSectionOpen("operations")}
        >
          <span className="section-toggle-icon">{operationsOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Operations</span>
          <span className="section-count">{formatCount(filteredCommands.length, commands.length)}</span>
        </button>
        {operationsOpen && (
          <div className="section-body">
            <ul className="list">
              {sortById(filteredCommands)
                .filter((cmd) => Boolean(cmd?.id))
                .map((cmd) => {
                  const linkedActions = actionsByCommandOrRpc[cmd.id] ?? [];
                  return (
                    <li key={cmd.id}>
                      <code>{cmd.id}</code> <DomainBadge domain={domainOf(cmd.id, topology)} /> <span className="note">({cmd.kind})</span>
                      {cmd.payloadSchema ? (
                        <>
                          {" "}
                          <span className="note">payload</span> <code>{cmd.payloadSchema}</code>
                        </>
                      ) : null}{" "}
                      {linkedActions.length > 0 ? (
                        <a
                          href="#"
                          className="inline-route-link"
                          onClick={(e) => {
                            e.preventDefault();
                            void setFilter(cmd.id);
                            openAndFocus("actions", "registry-actions");
                          }}
                        >
                          actions {linkedActions.length}
                        </a>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          </div>
        )}
      </div>

      <div className="section" id="registry-signals">
        <button type="button" className="section-toggle" onClick={() => toggleSectionOpen("signals")}>
          <span className="section-toggle-icon">{signalsOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Signals</span>
          <span className="section-count">{formatCount(filteredEvents.length, events.length)}</span>
        </button>
        {signalsOpen && (
          <div className="section-body">
            <ul className="list">
              {sortById(filteredEvents)
                .filter((evt) => Boolean(evt?.id))
                .map((evt) => (
                  <li key={evt.id}>
                    <code>{evt.id}</code> <DomainBadge domain={domainOf(evt.id, topology)} /> <span className="note">({evt.kind})</span>
                    {evt.payloadSchema ? (
                      <>
                        {" "}
                        <span className="note">payload</span> <code>{evt.payloadSchema}</code>
                      </>
                    ) : null}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      <div className="section" id="registry-preferences">
        <button
          type="button"
          className="section-toggle"
          onClick={() => toggleSectionOpen("preferences")}
        >
          <span className="section-toggle-icon">{preferencesOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Preferences</span>
          <span className="section-count">
            {formatCount(filteredSettings.length, Object.keys(SETTINGS_REGISTRY).length)}
          </span>
        </button>
        {preferencesOpen && (
          <div className="section-body">
            <ul className="list">
              {filteredSettings.map((setting) => (
                <li key={setting.id}>
                  <code>{setting.id}</code> <span className="note">({setting.type})</span>{" "}
                  {setting.sensitive ? <span className="note">sensitive</span> : null}{" "}
                  {setting.envKeys && setting.envKeys.length > 0 ? (
                    <span className="note">env: {setting.envKeys.join(", ")}</span>
                  ) : null}{" "}
                  {setting.description ? <span className="note">{setting.description}</span> : null}
                </li>
              ))}
            </ul>

            <div className="actions" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => navigate({ to: "/system/settings" })}
              >
                Open app settings
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => void handlers.execCommand("workbench.action.openSettings")}
                disabled={!isWebview}
              >
                Open VS Code settings
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="section" id="registry-storage">
        <button type="button" className="section-toggle" onClick={() => toggleSectionOpen("storage")}>
          <span className="section-toggle-icon">{storageOpen ? "\u25BE" : "\u25B8"}</span>
          <span className="section-heading">Persistence</span>
          <span className="section-count">
            {formatCount(filteredStorageTargets.length, storageTargets.length)}
          </span>
        </button>
        {storageOpen && (
          <div className="section-body">
            <p className="note">
              Storage targets describe where data is allowed to live. The transport should not affect
              storage semantics.
            </p>
            <ul className="list">
              {sortById(filteredStorageTargets).map((target) => (
                <li key={target.id}>
                  <code>{target.id}</code>{" "}
                  {deriveStorageDomains(target.id, topology).map((d) => (
                    <DomainBadge key={d} domain={d} />
                  ))}{" "}
                  <span className="note">
                    ({target.kind}
                    {target.scope ? `, ${target.scope}` : ""})
                  </span>{" "}
                  {target.description ? <span className="note">{target.description}</span> : null}
                </li>
              ))}
            </ul>

            <div className="actions" style={{ marginTop: 10 }}>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  navigate({
                    to: "/system/docs",
                    search: { doc: "docs/configuration-matrix.md" },
                  })
                }
              >
                Open storage doc
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
