#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { WEBVIEW_MARKERS, buildEnvKeys } from "../src/shared/app-identity";

type CliOptions = {
  dryRun: boolean;
};

const DEFAULT_PORT = 5173;
const SHUTDOWN_RETRIES = 10;
const SHUTDOWN_DELAY_MS = 200;
const WEBVIEW_PORT_ENV_KEYS = buildEnvKeys("WEBVIEW_PORT");
const WEBVIEW_DEV_KEEPALIVE_ENV_KEYS = buildEnvKeys("WEBVIEW_DEV_KEEPALIVE");

function firstEnvValue(keys: readonly string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

function parseArgs(argv: string[]): CliOptions {
  let dryRun = false;
  for (const arg of argv) {
    const value = arg.trim();
    if (!value) continue;
    if (value === "--dry-run") {
      dryRun = true;
      continue;
    }
    console.error(`Unknown argument: ${value}`);
    console.error("usage: dev-webview.sh [--dry-run]");
    process.exit(2);
  }
  return { dryRun };
}

function parsePort(raw: string | undefined): number {
  const parsed = Number.parseInt((raw ?? "").trim(), 10);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
    return parsed;
  }
  return DEFAULT_PORT;
}

function commandExists(command: string): boolean {
  const result = Bun.spawnSync(["which", command], {
    stdout: "ignore",
    stderr: "ignore",
    env: process.env,
  });
  return result.exitCode === 0;
}

async function fetchText(url: string, timeoutMs = 1200): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function listPortPids(port: number): string[] {
  if (!commandExists("lsof")) return [];
  const result = Bun.spawnSync(["lsof", "-ti", `:${port}`], {
    stdout: "pipe",
    stderr: "ignore",
    env: process.env,
  });
  if (result.exitCode !== 0) return [];
  return result.stdout
    .toString()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function stopPortOwners(port: number, dryRun: boolean): Promise<void> {
  const pids = listPortPids(port);
  if (pids.length === 0) return;

  if (dryRun) {
    console.log(`[dry-run] kill ${pids.join(" ")}`);
    return;
  }

  Bun.spawnSync(["kill", ...pids], {
    stdout: "ignore",
    stderr: "ignore",
    env: process.env,
  });

  for (let i = 0; i < SHUTDOWN_RETRIES; i += 1) {
    await Bun.sleep(SHUTDOWN_DELAY_MS);
    if (listPortPids(port).length === 0) return;
  }
}

async function ensureWebviewDeps(webviewDir: string, dryRun: boolean): Promise<void> {
  const nodeModulesDir = join(webviewDir, "node_modules");
  const reactSwcDir = join(nodeModulesDir, "@vitejs", "plugin-react-swc");
  const missing = !existsSync(nodeModulesDir) || !existsSync(reactSwcDir);
  if (!missing) return;

  console.log("Installing webview dependencies...");
  if (dryRun) {
    console.log(`[dry-run] bun install --cwd ${JSON.stringify(webviewDir)}`);
    return;
  }

  const install = Bun.spawnSync(["bun", "install", "--cwd", webviewDir], {
    cwd: webviewDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if (install.exitCode !== 0) {
    process.exit(install.exitCode || 1);
  }
}

async function maybeKeepAliveIfRequested(dryRun: boolean): Promise<void> {
  if (firstEnvValue(WEBVIEW_DEV_KEEPALIVE_ENV_KEYS) !== "1") return;
  if (dryRun) {
    console.log("[dry-run] keepalive enabled");
    return;
  }
  await new Promise<void>(() => {});
}

async function launchVite(webviewDir: string, port: number, dryRun: boolean): Promise<void> {
  console.log(`Starting webview server at http://localhost:${port}`);
  const cmd = ["bunx", "vite", "--", "--port", String(port), "--strictPort"];
  if (dryRun) {
    console.log(`[dry-run] ${cmd.join(" ")}`);
    return;
  }
  const proc = Bun.spawn(cmd, {
    cwd: webviewDir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  const exitCode = await proc.exited;
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  const root = resolve(import.meta.dir, "..");
  const webviewDir = join(root, "src", "webview");
  const port = parsePort(firstEnvValue(WEBVIEW_PORT_ENV_KEYS));
  const url = `http://localhost:${port}`;

  const portPids = listPortPids(port);
  if (portPids.length > 0) {
    const viteClient = await fetchText(`${url}/@vite/client`);
    const rootHtml = await fetchText(`${url}/`);
    const looksLikeWorkspaceWebview =
      Boolean(viteClient) &&
      Boolean(rootHtml && WEBVIEW_MARKERS.some((marker) => rootHtml.includes(marker)));
    if (looksLikeWorkspaceWebview) {
      console.log(`Webview server already running at ${url}`);
      await maybeKeepAliveIfRequested(options.dryRun);
      return;
    }

    console.log(`Port ${port} is in use by another process. Stopping it...`);
    await stopPortOwners(port, options.dryRun);
  }

  await ensureWebviewDeps(webviewDir, options.dryRun);
  await launchVite(webviewDir, port, options.dryRun);
}

await main();
