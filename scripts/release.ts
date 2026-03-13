#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

type BumpKind = "patch" | "minor";

type CliOptions = {
  ci: boolean;
  bump: BumpKind;
  dryRun: boolean;
};

type Semver = {
  major: number;
  minor: number;
  patch: number;
};

const ROOT = resolve(import.meta.dir, "..");
const PACKAGE_JSON_PATH = join(ROOT, "package.json");
const ENV_LOCAL_PATH = join(ROOT, ".env.local");

function parseArgs(argv: string[]): CliOptions {
  let ci = false;
  let bump: BumpKind = "patch";
  let dryRun = false;

  for (const rawArg of argv) {
    const arg = rawArg.trim();
    if (!arg) continue;
    if (arg === "--ci") {
      ci = true;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "minor" || arg === "patch") {
      bump = arg;
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    console.error("usage: release.sh [patch|minor] [--ci] [--dry-run]");
    process.exit(2);
  }

  return { ci, bump, dryRun };
}

function parseSemver(version: string): Semver {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Unsupported package version format: ${version}`);
  }
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function formatSemver(v: Semver): string {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function bumpVersion(version: string, bump: BumpKind): string {
  const current = parseSemver(version);
  if (bump === "minor") {
    return formatSemver({
      major: current.major,
      minor: current.minor + 1,
      patch: 0,
    });
  }
  return formatSemver({
    major: current.major,
    minor: current.minor,
    patch: current.patch + 1,
  });
}

async function readPackageJson(): Promise<Record<string, unknown>> {
  const source = await readFile(PACKAGE_JSON_PATH, "utf-8");
  return JSON.parse(source) as Record<string, unknown>;
}

async function writePackageJson(pkg: Record<string, unknown>): Promise<void> {
  const text = `${JSON.stringify(pkg, null, "\t")}\n`;
  await writeFile(PACKAGE_JSON_PATH, text, "utf-8");
}

function parseEnvFile(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) result[key] = value;
  }
  return result;
}

function loadEnvLocalIntoProcess(): void {
  if (!existsSync(ENV_LOCAL_PATH)) {
    return;
  }
  const parsed = parseEnvFile(readFileSync(ENV_LOCAL_PATH, "utf-8"));
  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }
}

function run(
  cmd: string[],
  opts?: { allowFailure?: boolean; env?: Record<string, string | undefined>; dryRun?: boolean },
): void {
  if (opts?.dryRun) {
    const safeParts = [...cmd];
    const tokenFlagIndex = safeParts.findIndex((part) => part === "-p" || part === "--pat");
    if (tokenFlagIndex >= 0 && tokenFlagIndex + 1 < safeParts.length) {
      safeParts[tokenFlagIndex + 1] = "***";
    }
    console.log(`[dry-run] ${safeParts.map((part) => JSON.stringify(part)).join(" ")}`);
    return;
  }
  const proc = Bun.spawnSync(cmd, {
    cwd: ROOT,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: opts?.env ?? process.env,
  });
  if (proc.exitCode !== 0 && !opts?.allowFailure) {
    process.exit(proc.exitCode || 1);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(Bun.argv.slice(2));
  process.chdir(ROOT);

  const pkg = await readPackageJson();
  const oldVersion = String(pkg.version ?? "").trim();
  if (!oldVersion) {
    throw new Error("package.json is missing version");
  }

  if (!options.ci) {
    const newVersion = bumpVersion(oldVersion, options.bump);
    pkg.version = newVersion;
    if (options.dryRun) {
      console.log(`[dry-run] Bumped ${oldVersion} -> ${newVersion}`);
    } else {
      await writePackageJson(pkg);
      console.log(`Bumped ${oldVersion} -> ${newVersion}`);
    }
  }

  const latestPkg = options.dryRun ? pkg : await readPackageJson();
  const version = String(latestPkg.version ?? "").trim();
  if (!version) {
    throw new Error("Unable to resolve release version");
  }

  run(["bun", "run", "build"], { dryRun: options.dryRun });
  run(["bun", "run", "package"], { dryRun: options.dryRun });

  if (!options.ci) {
    run(["git", "add", basename(PACKAGE_JSON_PATH)], { dryRun: options.dryRun });
    run(["git", "commit", "-m", `Release v${version}`], { dryRun: options.dryRun });
    run(["git", "tag", "-a", `v${version}`, "-m", `Release v${version}`], { dryRun: options.dryRun });
    run(["git", "push"], { dryRun: options.dryRun });
    run(["git", "push", "--tags"], { dryRun: options.dryRun });
  }

  loadEnvLocalIntoProcess();
  const token = (process.env.VSCE_PAT ?? "").trim();
  if (!token) {
    if (options.dryRun) {
      console.log("[dry-run] Missing VSCE_PAT; publish command skipped");
    } else {
      console.error("VSCE_PAT is required to publish. Set it in .env.local or environment.");
      process.exit(1);
    }
  } else {
    run(
      ["bunx", "@vscode/vsce", "publish", "-p", token, "--skip-duplicate"],
      {
        dryRun: options.dryRun,
        env: {
          ...process.env,
          NODE_OPTIONS: "--require ./scripts/patch-os-cpus.cjs",
        },
      },
    );
  }

  console.log(`Published v${version}${options.dryRun ? " (dry-run)" : ""}`);
}

await main();
