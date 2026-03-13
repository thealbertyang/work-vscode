import * as vscode from "vscode";
import { APP_NAME } from "../../../../shared/app-identity";

export const outputChannel = vscode.window.createOutputChannel(`${APP_NAME} Sprint`);

export function log(message: string): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] ${message}`);
}
