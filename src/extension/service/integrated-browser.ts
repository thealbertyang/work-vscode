import * as vscode from "vscode";
import { resolveWorkMcpOrigins } from "./work-mcp-client";

const INTEGRATED_BROWSER_OPEN_COMMAND = "workbench.action.browser.open";
const INTEGRATED_BROWSER_RELOAD_COMMAND = "workbench.action.browser.reload";
const SIMPLE_BROWSER_SHOW_COMMAND = "simpleBrowser.show";
const LAST_WORK_BROWSER_URL_STATE_KEY = "work.browser.lastUrl";
const DEFAULT_WORK_BROWSER_PATH = "/app/now";

type BrowserTarget =
  | string
  | {
    url?: string;
    path?: string;
    section?: string;
  }
  | undefined;

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_WORK_BROWSER_PATH;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function preferredWorkBrowserOrigin(): string {
  const origins = resolveWorkMcpOrigins();
  return origins.find((origin) => origin.includes("localhost:4500"))
    ?? origins.find((origin) => origin.includes(":4500"))
    ?? origins[0]
    ?? "https://localhost:4500";
}

export function resolveWorkBrowserUrl(target?: BrowserTarget): string {
  if (typeof target === "string") {
    const normalized = normalizePath(target);
    return /^https?:\/\//i.test(normalized)
      ? normalized
      : `${normalizeBaseUrl(preferredWorkBrowserOrigin())}${normalized}`;
  }

  if (target?.url) {
    return resolveWorkBrowserUrl(target.url);
  }

  if (target?.section) {
    return resolveWorkBrowserUrl(`/app/${target.section.trim().replace(/^\/+|\/+$/g, "")}`);
  }

  if (target?.path) {
    return resolveWorkBrowserUrl(target.path);
  }

  return `${normalizeBaseUrl(preferredWorkBrowserOrigin())}${DEFAULT_WORK_BROWSER_PATH}`;
}

async function commandExists(commandId: string): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  return commands.includes(commandId);
}

export function getLastWorkBrowserUrl(context: vscode.ExtensionContext): string {
  return context.workspaceState.get<string>(
    LAST_WORK_BROWSER_URL_STATE_KEY,
    resolveWorkBrowserUrl(),
  ) ?? resolveWorkBrowserUrl();
}

export async function openWorkBrowser(
  context: vscode.ExtensionContext,
  target?: BrowserTarget,
): Promise<string> {
  const url = resolveWorkBrowserUrl(target);
  await context.workspaceState.update(LAST_WORK_BROWSER_URL_STATE_KEY, url);

  if (await commandExists(INTEGRATED_BROWSER_OPEN_COMMAND)) {
    await vscode.commands.executeCommand(INTEGRATED_BROWSER_OPEN_COMMAND, url);
    return url;
  }

  await vscode.commands.executeCommand(SIMPLE_BROWSER_SHOW_COMMAND, url);
  return url;
}

export async function refreshWorkBrowser(
  context: vscode.ExtensionContext,
): Promise<string> {
  const url = getLastWorkBrowserUrl(context);

  if (await commandExists(INTEGRATED_BROWSER_RELOAD_COMMAND)) {
    try {
      await vscode.commands.executeCommand(INTEGRATED_BROWSER_RELOAD_COMMAND);
      return url;
    } catch {
      // Fall through and reopen the last Work URL.
    }
  }

  return openWorkBrowser(context, { url });
}
