import * as vscode from "vscode";
import { resolveWorkMcpOrigins } from "./work-mcp-client";
import { log } from "../providers/data/jira/logger";

const DEFAULT_WORK_BROWSER_PATH = "/now";

// VS Code Insiders 2026 integrated browser commands (in priority order)
const BROWSER_COMMANDS = [
  "integratedBrowser.open",                    // VS Code Insiders 1.110+ (March 2026)
  "workbench.action.browser.open",             // earlier integrated browser
  "simpleBrowser.show",                        // fallback
] as const;

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

export function resolveWorkBrowserUrl(target?: string): string {
  if (target) {
    const normalized = normalizePath(target);
    return /^https?:\/\//i.test(normalized)
      ? normalized
      : `${normalizeBaseUrl(preferredWorkBrowserOrigin())}${normalized}`;
  }
  return `${normalizeBaseUrl(preferredWorkBrowserOrigin())}${DEFAULT_WORK_BROWSER_PATH}`;
}

async function openUrl(url: string): Promise<void> {
  const allCommands = await vscode.commands.getCommands(true);

  for (const cmd of BROWSER_COMMANDS) {
    if (allCommands.includes(cmd)) {
      log(`[browser] opening ${url} via ${cmd}`);
      try {
        await vscode.commands.executeCommand(cmd, url);
        return;
      } catch (e) {
        log(`[browser] ${cmd} failed: ${e}`);
        // try next command
      }
    }
  }

  // All integrated browser commands failed — last resort external browser
  log(`[browser] no integrated browser available, opening externally: ${url}`);
  await vscode.env.openExternal(vscode.Uri.parse(url));
}

export async function openWorkBrowser(
  _context: vscode.ExtensionContext,
  target?: string | { url?: string; path?: string; section?: string },
): Promise<string> {
  let path: string | undefined;

  if (typeof target === "string") {
    path = target;
  } else if (target?.url) {
    path = target.url;
  } else if (target?.section) {
    path = `/${target.section.trim().replace(/^\/+|\/+$/g, "")}`;
  } else if (target?.path) {
    path = target.path;
  }

  const url = resolveWorkBrowserUrl(path);
  await openUrl(url);
  return url;
}

export async function refreshWorkBrowser(
  context: vscode.ExtensionContext,
): Promise<string> {
  const allCommands = await vscode.commands.getCommands(true);
  if (allCommands.includes("workbench.action.browser.reload")) {
    try {
      await vscode.commands.executeCommand("workbench.action.browser.reload");
      return resolveWorkBrowserUrl();
    } catch {
      // Fall through and reopen
    }
  }
  return openWorkBrowser(context);
}
