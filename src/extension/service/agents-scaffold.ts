import fs from "fs";
import path from "path";
import { Uri, workspace, type ExtensionContext } from "vscode";
import { log } from "../providers/data/jira/logger";

const AGENTS_DIR = ".claude";

const SCAFFOLD_SUBDIRS = ["docs", "runbooks", "plans", "automations", "skills"];

/** Subdirectories to copy from the extension's bundled .claude/ to the workspace .claude/. */
const COPY_SUBDIRS = ["docs", "runbooks", "plans", "skills"];

const isDirectory = (p: string): boolean => {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const copyMissingFiles = (srcDir: string, destDir: string, ext: string): number => {
  if (!isDirectory(srcDir)) {
    return 0;
  }
  if (!isDirectory(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let count = 0;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      count += copyMissingFiles(src, dest, ext);
      continue;
    }

    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(ext)) {
      continue;
    }
    if (fs.existsSync(dest)) {
      continue;
    }
    fs.copyFileSync(src, dest);
    count++;
  }

  return count;
};

/**
 * Scaffolds the .claude directory in the workspace root.
 * Creates subdirectories if .claude exists, and copies missing
 * docs from the extension's bundled docs/ directory.
 */
export function scaffoldAgentsDir(context: ExtensionContext): void {
  const workspaceFolder =
    workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ??
    workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return;
  }

  const agentsRoot = path.join(workspaceFolder.uri.fsPath, AGENTS_DIR);
  if (!isDirectory(agentsRoot)) {
    try {
      fs.mkdirSync(agentsRoot, { recursive: true });
    } catch {
      return;
    }
  }

  // Ensure subdirectories exist
  for (const sub of SCAFFOLD_SUBDIRS) {
    const dir = path.join(agentsRoot, sub);
    if (!isDirectory(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Copy missing files from the extension's bundled .claude/ to the workspace .claude/
  const extensionAgents = path.join(context.extensionPath, AGENTS_DIR);
  if (!isDirectory(extensionAgents)) {
    return;
  }

  let total = 0;
  for (const sub of COPY_SUBDIRS) {
    const src = path.join(extensionAgents, sub);
    const dest = path.join(agentsRoot, sub);
    total += copyMissingFiles(src, dest, ".md");
  }

  if (total > 0) {
    log(`[scaffold] copied ${total} agent doc${total === 1 ? "" : "s"} to ${agentsRoot}`);
  }
}
