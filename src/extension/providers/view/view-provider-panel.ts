import { ExtensionContext, Uri, Webview, WebviewPanel } from "vscode";
import { readFileSync } from "fs";
import { join } from "path";
import { HandlerConfig } from "@jsonrpc-rx/server";
import { AbstractViewProvider } from "./view-provider-abstract";
import { DEFAULT_WEBVIEW_PORT, DEFAULT_WS_BRIDGE_PORT } from "../../constants";
import { WebviewRenderTracker } from "../../service/webview-render-tracker";
import type { WebviewRoute } from "../../service/webview-route";
import { IPC_COMMANDS, IPC_EVENTS } from "../../../shared/contracts";
import type { RouteChangedPayload } from "../../../shared/contracts";
import { buildRouteHash, routeHintToPath } from "../../../shared/contracts";
import { WebviewIpcHost } from "../../service/webview-ipc";
import { logIpcMessage } from "../../service/ui-logger";
import { getWebviewServerUrl } from "../data/jira/jiraConfig";
import { log } from "../data/jira/logger";
import { resolveWebviewPath, resolveWebviewRoot } from "../../webview/paths";
import {
  getServerPort,
  isLocalhostUrl,
  normalizeServerUrl,
} from "../../webview/reachability";
import { APP_NAME, ROUTE_HINT_PRIMARY_KEY, WEBVIEW_MARKERS } from "../../../shared/app-identity";

export class ViewProviderPanel extends AbstractViewProvider {
  static readonly viewType = "workspaceAppWebviewPanel";
  static readonly title = `${APP_NAME} Sprint`;

  // Optional fan-out for browser dev mode (WS bridge) so VS Code-initiated
  // navigation/state commands can reach external clients as well.
  private ipcBroadcast?: {
    sendCommand: (name: string, payload?: unknown) => void;
    sendEvent: (name: string, payload?: unknown) => void;
  };

  private readonly exposedWebviews = new WeakSet<Webview>();
  private readonly renderTracker?: WebviewRenderTracker;
  private pendingRoute?: WebviewRoute;
  private initialRoute?: WebviewRoute;
  private webviewReady = false;
  private ipc?: WebviewIpcHost;
  private currentRoute?: RouteChangedPayload;

  constructor(
    context: ExtensionContext,
    handlers: HandlerConfig,
    renderTracker?: WebviewRenderTracker,
  ) {
    super(context, handlers, {
      distDir: "out/webview",
      indexPath: "out/webview/index.html",
      logContextProvider: () => this.getLogContext(),
    });
    this.renderTracker = renderTracker;
  }

  setIpcBroadcast(
    broadcast?: {
      sendCommand: (name: string, payload?: unknown) => void;
      sendEvent: (name: string, payload?: unknown) => void;
    } | null,
  ) {
    this.ipcBroadcast = broadcast ?? undefined;
  }

  async resolveWebviewView(webviewView: WebviewPanel) {
    const { webview } = webviewView;
    this.webviewReady = false;
    const serverInfo = this.getServerInfo();
    const hasServerUrl = Boolean(serverInfo.url);
    webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this.context.extensionUri, Uri.joinPath(this.context.extensionUri, "out")],
      portMapping:
        hasServerUrl && serverInfo.isLocal
          ? [
              { webviewPort: serverInfo.port, extensionHostPort: serverInfo.port },
              { webviewPort: DEFAULT_WS_BRIDGE_PORT, extensionHostPort: DEFAULT_WS_BRIDGE_PORT },
            ]
          : undefined,
    };

    this.exposeHandlersOnce(webview);
    this.ipc?.dispose();
    this.ipc = new WebviewIpcHost(webview, (direction, kind, name, payload) => {
      if (direction === "recv" && kind === "event" && name === IPC_EVENTS.ROUTE_CHANGED) {
        this.currentRoute = payload as RouteChangedPayload;
      }
      logIpcMessage(direction, kind, name, payload, this.getLogContext());
    });
    this.ipc.listen();
    this.ipc.onCommand(IPC_COMMANDS.REFRESH_WEBVIEW, () => {
      void this.updateWebview(webviewView);
    });
    this.ipc.onEvent(IPC_EVENTS.WEBVIEW_READY, () => {
      this.webviewReady = true;
      this.postPendingRoute();
    });
    webviewView.onDidDispose(() => {
      this.ipc?.dispose();
      this.ipc = undefined;
      this.webviewReady = false;
    });
    webview.html = await this.getWebviewHtmlSafe(webview);
    this.renderTracker?.markRendered();
  }

  private getLogContext(): string | undefined {
    const parts: string[] = [`view=${ViewProviderPanel.viewType}`];
    const route = this.formatRoute(this.currentRoute);
    if (route) {
      parts.push(`route=${route}`);
    }
    return parts.join(" ");
  }

  private formatRoute(route?: RouteChangedPayload): string | undefined {
    if (!route?.path) {
      return undefined;
    }
    if (!route.query || Object.keys(route.query).length === 0) {
      return route.path;
    }
    const params = new URLSearchParams(route.query).toString();
    return params ? `${route.path}?${params}` : route.path;
  }

  private getServerInfo(): { url: string; port: number; isLocal: boolean } {
    const configured = normalizeServerUrl(getWebviewServerUrl());
    const url = configured || (resolveWebviewRoot(this.context.extensionPath) ? `http://localhost:${DEFAULT_WEBVIEW_PORT}/` : "");
    if (!url) {
      return { url: "", port: DEFAULT_WEBVIEW_PORT, isLocal: true };
    }
    const port = getServerPort(url) || DEFAULT_WEBVIEW_PORT;
    return { url, port, isLocal: isLocalhostUrl(url) };
  }

  async updateWebview(webviewView: WebviewPanel) {
    this.webviewReady = false;
    webviewView.webview.html = await this.getWebviewHtmlSafe(webviewView.webview);
    this.renderTracker?.markRendered();
  }

  /**
   * Requests navigation to a route. Sets both the pending IPC command and the
   * initial-route injection so the route is applied regardless of webview lifecycle state:
   *
   * 1. If the webview is ready → sends IPC NAVIGATE immediately.
   * 2. If the webview is loading → `pendingRoute` is sent when WEBVIEW_READY fires.
   * 3. If HTML hasn't been built yet → `initialRoute` is embedded via {@link injectInitialRoute}.
   *
   * **Call this BEFORE `showApp()`** so that `injectInitialRoute` can embed the route
   * in the HTML when the panel is first created.
   */
  requestNavigate(route: WebviewRoute) {
    this.pendingRoute = route;
    this.initialRoute = route;
    // External browser clients shouldn't wait for the VS Code webview lifecycle.
    this.ipcBroadcast?.sendCommand(IPC_COMMANDS.NAVIGATE, { route });
    this.postPendingRoute();
  }

  private exposeHandlersOnce(webview: Webview) {
    if (this.exposedWebviews.has(webview)) {
      return;
    }
    this.exposedWebviews.add(webview);
    this.exposeHandlers(webview);
  }

  sendCommand(name: string, payload?: unknown) {
    this.ipcBroadcast?.sendCommand(name, payload);
    if (this.webviewReady && this.ipc) this.ipc.sendCommand(name, payload);
  }

  private postPendingRoute() {
    if (!this.webviewReady || !this.pendingRoute || !this.ipc) {
      return;
    }
    this.ipc.sendCommand(IPC_COMMANDS.NAVIGATE, { route: this.pendingRoute });
    this.pendingRoute = undefined;
  }

  private async getWebviewHtmlSafe(webview: Webview) {
    try {
      const serverHtml = await this.tryGetServerHtml(webview);
      if (serverHtml) {
        return this.injectInitialRoute(serverHtml);
      }
      return this.injectInitialRoute(await this.getWebviewHtml(webview));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load webview UI.";
      return this.getFallbackHtml(webview, message);
    }
  }

  private getServerUrl(): string {
    return this.getServerInfo().url;
  }

  private isWorkspaceDevHtml(html: string): boolean {
    return WEBVIEW_MARKERS.some((marker) => html.includes(marker));
  }

  private async tryGetServerHtml(webview: Webview): Promise<string | undefined> {
    const devUrl = this.getServerUrl();
    if (!devUrl) {
      log("[webview] No server URL configured, skipping server HTML.");
      return undefined;
    }

    log(`[webview] Checking server at ${devUrl}...`);
    if (!await this.isServerReachable(devUrl)) {
      log("[webview] Server not reachable, falling back to production build.");
      return undefined;
    }
    log("[webview] Server is reachable.");

    const webviewRoot = resolveWebviewRoot(this.context.extensionPath);

    // Try HMR plugin output from the repo (paths already rewritten, @vite/client injected)
    if (webviewRoot) {
      const hmrIndex = join(webviewRoot, this.wiewProviderOptions.indexPath);
      try {
        const htmlText = readFileSync(hmrIndex, { encoding: "utf8" }).toString();
        if (htmlText.includes(AbstractViewProvider.VSCODE_WEBVIEW_HMR_MARK) && this.isWorkspaceDevHtml(htmlText)) {
          log(`[webview] Using HMR plugin output (${hmrIndex}).`);
          return this.buildWebviewHtml(webview, htmlText, devUrl);
        }
      } catch (err) {
        log(`[webview] Could not read HMR plugin output: ${err}`);
      }
    }

    // Try source index.html from the repo (has /src/main.tsx that Vite can serve)
    if (webviewRoot) {
      const sourceIndex = join(webviewRoot, "src", "webview", "index.html");
      try {
        const htmlText = readFileSync(sourceIndex, { encoding: "utf8" }).toString();
        if (this.isWorkspaceDevHtml(htmlText)) {
          log(`[webview] Using source index.html with server URL ${devUrl} (${sourceIndex}).`);
          // Vite normally injects @vite/client and the React Refresh preamble via
          // transformIndexHtml, but we load the HTML from disk so we must add them manually.
          // Paths must be absolute URLs because inline module scripts resolve
          // imports against the document origin (vscode-webview://…), not the Vite server.
          const base = devUrl.replace(/\/$/, "");
          const viteBootstrap = [
            `<script type="module" src="${base}/@vite/client"></script>`,
            '<script type="module">',
            `  import RefreshRuntime from "${base}/@react-refresh";`,
            '  RefreshRuntime.injectIntoGlobalHook(window);',
            '  window.$RefreshReg$ = () => {};',
            '  window.$RefreshSig$ = () => (type) => type;',
            '  window.__vite_plugin_react_preamble_installed__ = true;',
            '</script>',
          ].join("\n");
          const prepared = htmlText.replace(/<head>/i, `<head>${viteBootstrap}`);
          return this.buildWebviewHtml(webview, prepared, devUrl);
        }
      } catch (err) {
        log(`[webview] Could not read source index.html: ${err}`);
      }
    }

    // Try production HTML with HMR mark from installed extension
    const indexPath = join(this.context.extensionPath, this.wiewProviderOptions.indexPath);
    try {
      const htmlText = readFileSync(indexPath, { encoding: "utf8" }).toString();
      const hasHmrMark = htmlText.includes(AbstractViewProvider.VSCODE_WEBVIEW_HMR_MARK);
      const hasWorkspaceMark = this.isWorkspaceDevHtml(htmlText);
      if (hasHmrMark && hasWorkspaceMark) {
        log(`[webview] Using installed HTML with server URL ${devUrl}.`);
        return this.buildWebviewHtml(webview, htmlText, devUrl);
      }
    } catch {
      // ignore
    }

    // Try local webview path
    const webviewPath = resolveWebviewPath(this.context.extensionPath);
    if (webviewPath) {
      log(`[webview] Trying local webview path: ${webviewPath}`);
      try {
        const htmlText = readFileSync(webviewPath, { encoding: "utf8" }).toString();
        return this.buildWebviewHtml(webview, htmlText);
      } catch {
        log("[webview] Could not read local webview path.");
      }
    }

    log("[webview] No server HTML available, falling back to production build.");
    return undefined;
  }

  private async isServerReachable(devUrl: string): Promise<boolean> {
    if (typeof fetch !== "function") {
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    try {
      const response = await fetch(devUrl, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }


  private getFallbackHtml(webview: Webview, message: string) {
    const escaped = message.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline';`;
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_NAME} Webview</title>
    <style>
      body { font-family: sans-serif; padding: 24px; color: #1f2328; }
      .card { border: 1px solid #d0d7de; border-radius: 8px; padding: 16px; background: #f6f8fa; }
      code { background: #f0f0f0; padding: 2px 4px; border-radius: 4px; }
    </style>
  </head>
  <body>
    <div class="card">
      <h2>Webview UI unavailable</h2>
      <p>${escaped}</p>
      <p>Run <code>bun run dev:webview</code> for HMR or <code>bun run compile:webview</code> for a build.</p>
    </div>
  </body>
</html>`;
  }

  /**
   * Embeds an initial route into the webview HTML so the app starts at the correct path.
   *
   * Sets both `location.hash` (so TanStack Router initializes at the right path) and
   * `window.__workRoute` (so App.tsx can apply the route hint in its mount effect).
   *
   * The hash is always overridden when an `initialRoute` is present — even if a previous
   * hash exists (e.g., `#/plan` from a prior session). This is intentional: `initialRoute`
   * represents an explicit navigation request (deep link, command) that should take priority.
   */
  private injectInitialRoute(html: string): string {
    if (!this.initialRoute) {
      return html;
    }
    const normalizedPath = routeHintToPath(this.initialRoute);
    const targetHash = buildRouteHash(normalizedPath, this.initialRoute.query);
    const routePayload = JSON.stringify(this.initialRoute);
    // Always override the hash — this route was explicitly requested via deep link or command.
    const routeHintKey = JSON.stringify(ROUTE_HINT_PRIMARY_KEY);
    const script = `<script>(function(){try{window[${routeHintKey}]=${routePayload};location.hash=${JSON.stringify(
      targetHash,
    )};}catch(e){}})();</script>`;
    this.initialRoute = undefined;
    return html.replace(/<head>/i, `<head>${script}`);
  }
}
