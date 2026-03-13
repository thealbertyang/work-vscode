import type { ExtensionContext } from "vscode";
import type { JiraClient } from "../providers/data/jira/jiraClient";
import type { WorkspaceIssuesProvider } from "../providers/data/jira/issueProvider";
import type { WebviewServer } from "../service/webview-dev-server";
import type { StorageService } from "../service/storage-service";

export type HandlerDependencies = {
  context: ExtensionContext;
  storage: StorageService;
  client: JiraClient;
  provider: WorkspaceIssuesProvider;
  webviewServer: WebviewServer;
  extensionInstaller: import("../service/extension-installer").ExtensionInstaller;
  buildWatcher: import("../service/extension-build-watcher").ExtensionBuildWatcher;
  renderTracker: import("../service/webview-render-tracker").WebviewRenderTracker;
  showApp: () => Promise<void>;
  refreshApp: () => Promise<void>;
  closeApp: () => void;
};
