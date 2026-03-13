import { ExtensionContext, WebviewView, WebviewViewProvider } from "vscode";
import { HandlerConfig } from "@jsonrpc-rx/server";
import { AbstractViewProvider } from "./view-provider-abstract";
import { APP_ID } from "../../../shared/app-identity";

export class ViewProviderSidebar extends AbstractViewProvider implements WebviewViewProvider {
  constructor(context: ExtensionContext, handlers: HandlerConfig) {
    super(context, handlers, {
      distDir: "out/webview",
      indexPath: "out/webview/index.html",
      logContextProvider: () => `view=${APP_ID}Sidebar`,
    });
  }

  async resolveWebviewView(webviewView: WebviewView) {
    const { webview } = webviewView;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri],
    };
    this.exposeHandlers(webview);
    webview.html = await this.getWebviewHtml(webview);
  }
}
