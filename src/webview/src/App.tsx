import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { flushSync } from "react-dom";
import { useHandlers } from "./hooks/use-handlers";
import { useNavHistory } from "./hooks/use-nav-history";
import { getVsCodeApi, isWebview as isWebviewStatic, isBridgeConnected } from "./contexts/jsonrpc-rx-context";
import { AppContextProvider, type FormState } from "./contexts/app-context";
import type { JiraIssueDetails, WebviewState } from "./types/handlers";
import type { JiraIssueSummary } from "@shared/contracts";
import { ROUTE_HINT_WINDOW_KEYS } from "@shared/app-identity";
import type { UniversalConfig, UniversalStage } from "@shared/universal";
import { DEFAULT_UNIVERSAL_CONFIG } from "@shared/universal";
import { createWebviewIpc } from "./ipc";
import {
  IPC_COMMANDS,
  IPC_EVENTS,
  DEFAULT_ROUTE_PATH,
  extractIssueKey,
  normalizeRoutePath,
  routeHintToPath,
  stageFromPath,
  buildDeepLinkBase,
  buildDeepLinkUrl,
  buildAppDispatcherPath,
  isAppDispatcherPath,
  type RouteHint,
} from "@shared/contracts";
import { StageLayout } from "./components/StageLayout";
import { AppOverlay } from "./components/AppOverlay";
import { AppToast, type ToastData } from "./components/AppToast";
import { getSourceLabel } from "./lib/connection-labels";
import { MASKED_SECRET } from "./constants";
import { toSearchParams } from "./lib/to-search-params";
import { sanitizeSearchParams } from "./lib/sanitize-query";
import "./App.css";

type AppProps = {
  children: ReactNode;
};

const applyUniversalStyles = (config: UniversalConfig | null) => {
  if (!config?.styles?.cssVariables) {
    return;
  }
  const root = document.documentElement;
  Object.entries(config.styles.cssVariables).forEach(([key, value]) => {
    if (typeof value === "string") {
      root.style.setProperty(key, value);
    }
  });
};

type PersistedRouteState = {
  path?: string;
  pathname?: string;
  query?: Record<string, string>;
  search?: Record<string, string>;
  timestamp?: number;
};

type PersistedWebviewState = {
  lastRoute?: PersistedRouteState;
};

const EMPTY_STATE: WebviewState = {
  baseUrl: "",
  email: "",
  apiTokenConfigured: false,
  configSource: "none",
  authType: "none",
  hasStoredToken: false,
  devMode: false,
  extensionId: "",
  uriScheme: "",
};

const formatTimestamp = (value: number | null | undefined) => {
  if (!value) {
    return "Not set";
  }
  return new Date(value).toLocaleString();
};

const readPersistedRoute = (state: unknown) => {
  if (!state || typeof state !== "object") {
    return null;
  }
  const persisted = (state as PersistedWebviewState).lastRoute;
  if (!persisted || typeof persisted !== "object") {
    return null;
  }
  const rawPath = persisted.path ?? persisted.pathname;
  if (!rawPath) {
    return null;
  }
  const queryParams = sanitizeSearchParams(toSearchParams(persisted.query ?? persisted.search ?? {}));
  return {
    path: normalizeRoutePath(String(rawPath)),
    query: Object.fromEntries(queryParams.entries()) as Record<string, string>,
    search: queryParams.toString(),
  };
};

const getStagesArray = (config: UniversalConfig | null): UniversalStage[] => {
  const stages = config?.stages ?? DEFAULT_UNIVERSAL_CONFIG.stages ?? {};
  return Object.values(stages).sort((a, b) => a.order - b.order);
};

function App({ children }: AppProps) {
  const handlers = useHandlers();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location });
  const navHistory = useNavHistory();
  const ipcRef = useRef<ReturnType<typeof createWebviewIpc> | null>(null);
  const initialRouteApplied = useRef(false);
  const initialRouteTargetRef = useRef<{ path: string; search: string } | null>(null);

  // Unified transport: WS bridge is the primary transport for both VS Code
  // webview and browser. Start disconnected, become connected when WS opens.
  const [isWebview, setIsWebview] = useState(isBridgeConnected() || isWebviewStatic);
  const [wsAuthFailed, setWsAuthFailed] = useState(false);

  useEffect(() => {
    const onBridgeConnected = () => {
      setWsAuthFailed(false);
      setIsWebview(true);
    };
    const onBridgeAuthFailed = () => setWsAuthFailed(true);
    window.addEventListener("ws-bridge-connected", onBridgeConnected);
    window.addEventListener("ws-bridge-auth-failed", onBridgeAuthFailed);
    if (isBridgeConnected()) setIsWebview(true);
    return () => {
      window.removeEventListener("ws-bridge-connected", onBridgeConnected);
      window.removeEventListener("ws-bridge-auth-failed", onBridgeAuthFailed);
    };
  }, []);

  const [state, setState] = useState<WebviewState>(EMPTY_STATE);
  const [form, setForm] = useState<FormState>({
    baseUrl: "",
    email: "",
    apiToken: "",
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const [sprintIssues, setSprintIssues] = useState<JiraIssueSummary[]>([]);
  const [sprintIssuesLoading, setSprintIssuesLoading] = useState(false);
  const [issue, setIssue] = useState<JiraIssueDetails | null>(null);
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [universalConfig, setUniversalConfig] = useState<UniversalConfig | null>(null);

  const pathname = normalizeRoutePath(location.pathname || DEFAULT_ROUTE_PATH);
  const searchParams = useMemo(() => sanitizeSearchParams(toSearchParams(location.search)), [location.search]);
  const currentStage = stageFromPath(pathname);
  const pathSegments = pathname.split("/").filter(Boolean);
  const routeName = pathSegments[0] || "plan";
  const issueKey = extractIssueKey(pathname)?.toUpperCase();

  const status = useMemo(() => {
    const isConnected = state.apiTokenConfigured;
    const source = getSourceLabel(state.configSource);
    return { isConnected, source };
  }, [state]);

  const issueView = searchParams.get("view") === "compact" ? "compact" : "full";

  const stages = useMemo(() => getStagesArray(universalConfig), [universalConfig]);
  const currentStageConfig = stages.find((s) => s.id === currentStage);
  const stageLabel = currentStageConfig?.label ?? "Plan";

  const loadState = async () => {
    if (!isWebview) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextState = await handlers.getState();
      setState(nextState);
      const shouldMaskToken = Boolean(nextState.apiTokenConfigured);
      setForm((prev) => ({
        baseUrl: nextState.baseUrl || prev.baseUrl,
        email: nextState.email || prev.email,
        apiToken: shouldMaskToken ? MASKED_SECRET : "",
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load state.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, [isWebview]);

  useEffect(() => {
    if (!isWebview) {
      return;
    }
    let cancelled = false;
    const loadUniversalConfig = async () => {
      try {
        const config = await handlers.getUniversalConfig();
        if (cancelled) {
          return;
        }
        setUniversalConfig(config);
        applyUniversalStyles(config);
      } catch {
        // ignore config failures to avoid blocking UI
      }
    };
    void loadUniversalConfig();
    return () => {
      cancelled = true;
    };
  }, [handlers, isWebview]);

  useEffect(() => {
    if (!isWebview || initialRouteApplied.current) {
      return;
    }
    const hint = ROUTE_HINT_WINDOW_KEYS
      .map((key) => (window as any)[key] as RouteHint | undefined)
      .find(Boolean);
    if (hint) {
      initialRouteApplied.current = true;
      const target = normalizeRoutePath(routeHintToPath(hint));
      const queryParams = sanitizeSearchParams(toSearchParams(hint.query ?? {}));
      initialRouteTargetRef.current = {
        path: target,
        search: queryParams.toString(),
      };
      navigate({
        to: target,
        search: Object.fromEntries(queryParams.entries()),
        replace: true,
      });
      return;
    }
    const persistedRoute = readPersistedRoute(getVsCodeApi().getState());
    if (!persistedRoute) {
      initialRouteApplied.current = true;
      return;
    }
    initialRouteApplied.current = true;
    initialRouteTargetRef.current = {
      path: persistedRoute.path,
      search: persistedRoute.search,
    };
    navigate({
      to: persistedRoute.path,
      search: persistedRoute.query,
      replace: true,
    });
  }, [navigate]);

  useEffect(() => {
    if (!isWebview) {
      return;
    }
    const vscodeApi = getVsCodeApi();
    const ipc = createWebviewIpc(vscodeApi.postMessage.bind(vscodeApi));
    ipcRef.current = ipc;
    const disposeNavigate = ipc.onCommand(IPC_COMMANDS.NAVIGATE, (payload) => {
      const routePayload = payload as { route?: RouteHint | string } | undefined;
      const route = routePayload?.route ?? payload;
      if (typeof route === "string") {
        const trimmed = route.trim();
        const target = normalizeRoutePath(trimmed);
        navigate({ to: target });
        return;
      }
      if (route) {
        const hint = route as RouteHint;
        const target = normalizeRoutePath(routeHintToPath(hint));
        navigate({ to: target, search: hint.query ?? {} });
      }
    });
    const disposeStateUpdated = ipc.onCommand(IPC_COMMANDS.STATE_UPDATED, (payload) => {
      const patch = payload as { dev?: Partial<WebviewState["dev"]> } | undefined;
      if (patch?.dev) {
        setState((prev) => ({
          ...prev,
          dev: { ...prev.dev, ...patch.dev } as WebviewState["dev"],
        }));
      }
    });
    ipc.sendEvent(IPC_EVENTS.WEBVIEW_READY);
    return () => {
      disposeNavigate();
      disposeStateUpdated();
      ipc.dispose();
      ipcRef.current = null;
    };
  }, [navigate]);

  useEffect(() => {
    navHistory.push(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!isWebview || !ipcRef.current) {
      return;
    }
    ipcRef.current.sendEvent(IPC_EVENTS.ROUTE_CHANGED, {
      path: pathname,
      query: Object.fromEntries(searchParams.entries()),
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!isWebview) {
      return;
    }
    const target = initialRouteTargetRef.current;
    const currentSearch = searchParams.toString();
    if (target) {
      if (target.path !== pathname || target.search !== currentSearch) {
        return;
      }
      initialRouteTargetRef.current = null;
    }
    const vscodeApi = getVsCodeApi();
    const previousState = vscodeApi.getState();
    const baseState =
      previousState && typeof previousState === "object" ? previousState : {};
    vscodeApi.setState({
      ...(baseState as Record<string, unknown>),
      lastRoute: {
        path: pathname,
        query: Object.fromEntries(searchParams.entries()),
        timestamp: Date.now(),
      },
    });
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!isWebview) {
      return;
    }
    if (routeName !== "review" || !issueKey) {
      setIssue(null);
      setIssueError("");
      return;
    }
    let cancelled = false;
    setIssueLoading(true);
    setIssueError("");
    handlers
      .getIssue(issueKey)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setIssue(result);
        if (!result) {
          setIssueError("Issue not found or not authorized.");
        }
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load issue.";
        setIssueError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIssueLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handlers, issueKey, routeName]);

  // Load sprint issues list when on review route without a specific issue
  useEffect(() => {
    if (!isWebview || routeName !== "review" || issueKey) {
      return;
    }
    let cancelled = false;
    setSprintIssuesLoading(true);
    handlers
      .listIssues()
      .then((result) => {
        if (!cancelled) {
          setSprintIssues(result ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSprintIssues([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSprintIssuesLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handlers, issueKey, routeName, isWebview]);

  const updateForm = (key: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const saveToken = async () => {
    setError("");
    const baseUrl = form.baseUrl.trim();
    const email = form.email.trim();
    const rawToken = form.apiToken.trim();
    const hasExistingToken = Boolean(state.apiTokenConfigured);
    if (!baseUrl || !email || (!rawToken && !hasExistingToken)) {
      setError("All fields are required.");
      return;
    }
    const tokenToSave = rawToken || (hasExistingToken ? MASKED_SECRET : "");
    await handlers.saveApiToken(baseUrl, email, tokenToSave);
    await loadState();
  };

  const disconnect = async () => {
    setError("");
    await handlers.disconnect();
    await loadState();
  };

  const syncEnv = async () => {
    setError("");
    const result = await handlers.syncEnvToSettings();
    if (result?.items) {
      setToast({
        title: `Synced ${result.count} setting${result.count === 1 ? "" : "s"} from ${result.source}`,
        items: result.items,
      });
    }
    await loadState();
  };

  const runDevWebview = async () => {
    setError("");
    await handlers.runDevWebview();
  };

  const restartExtensionHost = async () => {
    setError("");
    await handlers.restartExtensionHost();
  };

  const reloadWebviews = async () => {
    setError("");
    await handlers.reloadWebviews();
  };

  const reinstallExtension = async () => {
    setError("");
    await handlers.reinstallExtension();
  };

  const startTaskTerminal = async () => {
    setError("");
    await handlers.startTaskTerminal();
  };

  const buildExtension = async () => {
    setError("");
    await handlers.buildExtension();
  };

  const buildWebview = async () => {
    setError("");
    await handlers.buildWebview();
  };

  const openSettings = async () => {
    setError("");
    await handlers.openSettings();
  };

  const handleGoBack = useCallback(() => {
    const path = navHistory.goBack();
    if (path) {
      navigate({ to: path, replace: true });
      navHistory.clearNavigating();
    }
  }, [navigate, navHistory]);

  const handleGoForward = useCallback(() => {
    const path = navHistory.goForward();
    if (path) {
      navigate({ to: path, replace: true });
      navHistory.clearNavigating();
    }
  }, [navigate, navHistory]);

  const navigateTo = useCallback(
    (nextPath: string) => {
      const raw = String(nextPath ?? "").trim();
      if (!raw) {
        return;
      }
      const [pathPart, queryPart] = raw.split("?");
      const to = normalizeRoutePath(pathPart);
      const doNavigate = () => {
        if (queryPart) {
          const search = Object.fromEntries(sanitizeSearchParams(new URLSearchParams(queryPart)).entries());
          navigate({ to, search });
          return;
        }
        navigate({ to });
      };
      const doc = document as unknown as { startViewTransition?: (cb: () => void) => unknown };
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(() => flushSync(doNavigate));
      } else {
        doNavigate();
      }
    },
    [navigate],
  );

  const refreshPage = useCallback(() => {
    const doc = document as unknown as { startViewTransition?: (cb: () => void) => unknown };
    const doRefresh = () => router.invalidate();
    if (typeof doc.startViewTransition === "function") {
      doc.startViewTransition(() => {
        flushSync(doRefresh);
      });
    } else {
      doRefresh();
    }
  }, [router]);

  const openPaletteFromUrlBar = useCallback(
    (query?: string) => {
      window.dispatchEvent(
        new CustomEvent("work:commandPalette", {
          detail: {
            source: "urlbar",
            query: typeof query === "string" ? query : "",
            returnFocus: true,
          },
        }),
      );
    },
    [],
  );

  const setIssueView = (view: "compact" | "full") => {
    if (routeName !== "review" || !issueKey) {
      return;
    }
    navigate({
      to: `/review/issues/${issueKey}`,
      search: (prev) => {
        const next = {
          ...(typeof prev === "object" && prev ? prev : {}),
        } as Record<string, string>;
        if (view === "full") {
          delete next.view;
        } else {
          next.view = "compact";
        }
        return next;
      },
      replace: true,
    });
  };

  const openIssueInBrowser = async () => {
    if (!issueKey) {
      return;
    }
    await handlers.openIssueInBrowser(issueKey);
  };

  const refreshIssue = useCallback(() => {
    if (!isWebview || !issueKey) {
      return;
    }
    setIssueLoading(true);
    setIssueError("");
    handlers
      .getIssue(issueKey)
      .then((result) => {
        setIssue(result);
        if (!result) {
          setIssueError("Issue not found or not authorized.");
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load issue.";
        setIssueError(message);
      })
      .finally(() => {
        setIssueLoading(false);
      });
  }, [handlers, issueKey]);

  const appId = universalConfig?.app.id ?? DEFAULT_UNIVERSAL_CONFIG.app.id ?? "work";
  // Show a link that's "native" to the current *surface*:
  // - VS Code webview surface: `${uriScheme}://${extensionId}/app/...`
  // - Browser surface (even if WS bridge is connected): `http://localhost:5173/#/app/...`
  //
  // Note: WS bridge connectivity should enable actions, but should not change the preferred
  // shareable URL shape (otherwise browser links flip to vscode:// unexpectedly).
  const deepLinkBase = useMemo(() => {
    if (isWebviewStatic) {
      return buildDeepLinkBase(state.uriScheme, state.extensionId);
    }
    try {
      // Keep the hash router stable across servers and paths.
      return `${window.location.origin}${window.location.pathname}#`;
    } catch {
      return buildDeepLinkBase(state.uriScheme, state.extensionId);
    }
  }, [state.extensionId, state.uriScheme]);
  // Build the deep link path: wrap the current route in the dispatcher format unless
  // already wrapped (e.g., when on the /app/$appId/... dispatcher page itself).
  const deepLinkPath = isAppDispatcherPath(pathname)
    ? pathname
    : buildAppDispatcherPath(appId, pathname);
  const deepLinkUrl = buildDeepLinkUrl(deepLinkBase, deepLinkPath, Object.fromEntries(searchParams.entries()));

  const copyDeepLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(deepLinkUrl);
        handlers.showInformation("Link copied.");
        return;
      }
    } catch {
      // fall back to execCommand
    }
    const textArea = document.createElement("textarea");
    textArea.value = deepLinkUrl;
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      handlers.showInformation("Link copied.");
    } catch {
      // ignore
    }
    document.body.removeChild(textArea);
  };

  return (
    <AppContextProvider
      value={{
        state,
        status,
        form,
        loading,
        error,
        isWebview,
        deepLinkBase,
        deepLinkUrl,
        copyDeepLink,
        updateForm,
        saveToken,
        disconnect,
        openSettings,
        syncEnv,
        runDevWebview,
        reloadWebviews,
        reinstallExtension,
        restartExtensionHost,
        startTaskTerminal,
        buildExtension,
        buildWebview,
        formatTimestamp,
        sprintIssues,
        sprintIssuesLoading,
        issue,
        issueLoading,
        issueError,
        issueKey,
        issueView,
        setIssueView,
        openIssueInBrowser,
        refreshIssue,
        navigate: navigateTo,
        routeName,
        currentStage,
        universalConfig,
      }}
    >
      <StageLayout
        stages={stages}
        activeStage={currentStage}
        currentPath={pathname}
        deepLinkUrl={deepLinkUrl}
        onNavigate={navigateTo}
        onCopy={copyDeepLink}
        onRefresh={refreshPage}
        onOpenPalette={openPaletteFromUrlBar}
        canGoBack={navHistory.canGoBack}
        canGoForward={navHistory.canGoForward}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        headerActions={
          !status.isConnected ? (
            <button className="secondary" onClick={() => navigateTo("/system/settings")} disabled={loading}>
              Configure
            </button>
          ) : currentStage === "review" && issueKey ? (
            <>
              <button type="button" className="secondary" onClick={openIssueInBrowser} disabled={!isWebview}>
                Open in Jira
              </button>
              <button type="button" className="secondary" onClick={refreshIssue} disabled={!isWebview || issueLoading}>
                Refresh
              </button>
            </>
          ) : null
        }
      >
        {error ? <div className="error">{error}</div> : null}
        {!isWebview ? (
          <div className="section">
            <h2>Webview Unavailable</h2>
            <p className="note">
              This UI is running outside VS Code. Open the extension webview panel to connect to
              Jira and use the dev controls.
            </p>
            {wsAuthFailed ? (
              <p className="note">
                WS bridge auth failed. Open the extension in VS Code and copy the WS bridge token
                from System {">"} Registry (or Settings {">"} Internals), then reload this page with{" "}
                <code>?wsToken=...</code>.
              </p>
            ) : null}
          </div>
        ) : null}

        {children}
      </StageLayout>

      <AppOverlay
        isConnected={status.isConnected}
        stageLabel={stageLabel}
        currentStage={currentStage}
        devMode={state.devMode}
        lastExtensionBuildAt={state.dev?.lastExtensionBuildAt}
        isWebview={isWebview}
        onNavigate={navigateTo}
        onCopyDeepLink={copyDeepLink}
        onOpenSettings={openSettings}
        onSyncEnv={syncEnv}
        onRefreshIssue={issueKey ? refreshIssue : undefined}
        onOpenIssueInBrowser={issueKey ? openIssueInBrowser : undefined}
        onRunDevWebview={runDevWebview}
        onReloadWebviews={reloadWebviews}
        onReinstallExtension={reinstallExtension}
        onRestartExtensionHost={restartExtensionHost}
        onStartTaskTerminal={startTaskTerminal}
        onSaveToken={saveToken}
      />

      <AppToast toast={toast} onDismiss={() => setToast(null)} />
    </AppContextProvider>
  );
}

export default App;
