import type { Uri, UriHandler } from "vscode";
import { commands } from "vscode";
import { log } from "../providers/data/jira/logger";
import { parseAnyLink } from "../../shared/link";
import { resolveWebviewRoute, type WebviewRoute } from "./webview-route";
import { VSCODE_COMMANDS } from "../../shared/contracts";

type UriHandlerDeps = {
  showApp: () => Promise<void>;
  navigate: (route: WebviewRoute) => void | Promise<void>;
};

/**
 * Handles `vscode://` and `vscode-insiders://` URIs for deep link navigation
 * and terminal actions.
 *
 * **Terminal action:** `/terminal?session=X&window=Y&tool=Z&role=R&story=S`
 * Opens a VS Code terminal attached to a tmux agent session.
 *
 * **Navigation flow:**
 * 1. Parse the URI into a route (via {@link parseAnyLink} or legacy {@link resolveWebviewRoute}).
 * 2. Call `navigate()` FIRST — this sets `ViewProviderPanel.initialRoute` so that
 *    {@link ViewProviderPanel.injectInitialRoute} can embed the target hash in the HTML.
 * 3. Call `showApp()` — this reveals/creates the panel. If the panel is freshly created,
 *    `injectInitialRoute` uses the route set in step 2. If already visible, the IPC
 *    NAVIGATE command (sent by `requestNavigate`) handles it.
 */
export class WorkspaceUriHandler implements UriHandler {
  constructor(private readonly deps: UriHandlerDeps) {}

  async handleUri(uri: Uri): Promise<void> {
    log(`URI handler triggered: ${uri.toString()}`);

    // Handle terminal actions: /terminal?session=X&window=Y&tool=Z&role=R&story=S
    if (uri.path === "/terminal") {
      const params = new URLSearchParams(uri.query);
      await commands.executeCommand(VSCODE_COMMANDS.OPEN_AGENT_TERMINAL, {
        tool: params.get("tool") ?? undefined,
        role: params.get("role") ?? undefined,
        story: params.get("story") ?? undefined,
        session: params.get("session") ?? undefined,
        windowIndex: params.get("windowIndex") ?? params.get("window") ?? undefined,
      });
      return;
    }

    const parsed = parseAnyLink(uri.toString());
    if (parsed) {
      log(`  parsed.to=${parsed.to}`);
      // Navigate BEFORE showApp so initialRoute is set for HTML injection.
      await this.deps.navigate({ path: parsed.to, query: parsed.search });
      await this.deps.showApp();
      return;
    }

    // Fallback to legacy route resolution
    const route = resolveWebviewRoute(uri);
    log(`  route=${route?.name ?? "none"}`);
    if (route) {
      await this.deps.navigate(route);
    }
    await this.deps.showApp();
  }
}
