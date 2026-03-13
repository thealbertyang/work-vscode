import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { getWebviewPath } from "../providers/data/jira/jiraConfig";

export function resolveWebviewPath(_extensionPath: string): string {
  const configured = getWebviewPath();
  if (configured) {
    return configured;
  }
  return "";
}

export function resolveWebviewRoot(extensionPath: string): string {
  const direct = path.join(extensionPath, "src", "webview", "src");
  if (fs.existsSync(direct)) {
    return extensionPath;
  }

  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const root = folder.uri.fsPath;
    const repoCandidate = path.join(root, "repos", "work", "vscode");
    if (fs.existsSync(path.join(repoCandidate, "src", "webview", "src"))) {
      return repoCandidate;
    }
    if (fs.existsSync(path.join(root, "src", "webview", "src"))) {
      return root;
    }
  }

  return "";
}
