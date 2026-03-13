import fs from "fs";
import os from "os";
import path from "path";
import { Uri, commands, window, workspace } from "vscode";
import { getDocsPath } from "../providers/data/jira/jiraConfig";
import type { DocContent, DocEntry, DocGroup, DocsIndex, DocsSource } from "../../shared/docs-contract";
import type { HandlerDependencies } from "./types";

type DocsDependencies = Pick<HandlerDependencies, "context">;

type DocsRoot = {
  root: string | null;
  source: DocsSource;
  workspaceRoot?: string;
  allowedRealRoots?: string[];
  error?: string;
};

const RUNBOOKS_DIR = "runbooks";
const PLANS_DIR = "plans";
const SKILLS_DIR = "skills";
const MARKDOWN_EXT = ".md";

const CODEX_HOME = process.env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
const CLAUDE_HOME = process.env.CLAUDE_CODE_DIR?.trim() || path.join(os.homedir(), ".claude");

const ALLOWED_HIDDEN_DIRS = new Set([".codex-global", ".claude-global"]);

const toTitleCase = (value: string): string =>
  value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const toPosix = (value: string): string => value.split(path.sep).join("/");

const isDirectory = (value: string): boolean => {
  try {
    return fs.statSync(value).isDirectory();
  } catch {
    return false;
  }
};

const isFile = (value: string): boolean => {
  try {
    return fs.statSync(value).isFile();
  } catch {
    return false;
  }
};

const realpathOrNull = (value: string): string | null => {
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
};

const normalizeDocId = (value: string): string | null => {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.startsWith("/")) {
    return null;
  }
  const normalized = path.posix.normalize(trimmed);
  if (normalized.startsWith("../") || normalized === "..") {
    return null;
  }
  return normalized;
};

const isWithinRoots = (roots: string[], target: string): boolean => {
  const normalizedTarget = path.resolve(target);
  return roots.some((root) => {
    const normalizedRoot = path.resolve(root);
    return (
      normalizedTarget === normalizedRoot ||
      normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
    );
  });
};

const buildAllowedRealRoots = (docsRoot: string, workspaceRoot?: string): string[] => {
  const allowed: string[] = [];

  const pushIfDir = (p: string) => {
    if (!isDirectory(p)) {
      return;
    }
    const real = realpathOrNull(p);
    if (real) {
      allowed.push(real);
    }
  };

  pushIfDir(docsRoot);
  if (workspaceRoot) {
    pushIfDir(workspaceRoot);
  }
  pushIfDir(path.join(CODEX_HOME, SKILLS_DIR));
  pushIfDir(path.join(CODEX_HOME, PLANS_DIR));
  pushIfDir(path.join(CLAUDE_HOME, SKILLS_DIR));
  pushIfDir(path.join(CLAUDE_HOME, PLANS_DIR));

  return allowed;
};

const isWithinRoot = (root: string, target: string): boolean => {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return (
    normalizedTarget === normalizedRoot ||
    normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`)
  );
};

const resolveConfiguredPath = (value: string, context: DocsDependencies["context"]): string => {
  if (!value) {
    return "";
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  const workspaceFolder =
    workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ?? workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    return path.resolve(workspaceFolder.uri.fsPath, value);
  }
  return path.resolve(context.extensionPath, value);
};

const WORKSPACE_AGENTS_DIR = ".claude";

const resolveDocsRoot = (context: DocsDependencies["context"]): DocsRoot => {
  const workspaceFolder =
    workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ?? workspace.workspaceFolders?.[0];
  const workspaceRoot = workspaceFolder?.uri.fsPath;

  const configured = getDocsPath();
  if (configured) {
    const resolved = resolveConfiguredPath(configured, context);
    if (isDirectory(resolved)) {
      return {
        root: resolved,
        source: "settings",
        workspaceRoot,
        allowedRealRoots: buildAllowedRealRoots(resolved, workspaceRoot),
      };
    }
    return {
      root: null,
      source: "settings",
      workspaceRoot,
      error: `Docs path not found: ${resolved}`,
    };
  }

  if (workspaceFolder) {
    const workAgents = path.join(workspaceFolder.uri.fsPath, WORKSPACE_AGENTS_DIR);
    if (isDirectory(workAgents)) {
      return {
        root: workAgents,
        source: "local",
        workspaceRoot,
        allowedRealRoots: buildAllowedRealRoots(workAgents, workspaceRoot),
      };
    }
    const workspaceDocs = path.join(workspaceFolder.uri.fsPath, "docs");
    if (isDirectory(workspaceDocs)) {
      return {
        root: workspaceDocs,
        source: "local",
        workspaceRoot,
        allowedRealRoots: buildAllowedRealRoots(workspaceDocs, workspaceRoot),
      };
    }
  }

  const extensionAgents = path.join(context.extensionPath, WORKSPACE_AGENTS_DIR);
  if (isDirectory(extensionAgents)) {
    return {
      root: extensionAgents,
      source: "extension",
      workspaceRoot,
      allowedRealRoots: buildAllowedRealRoots(extensionAgents, workspaceRoot),
    };
  }

  return {
    root: null,
    source: "none",
    workspaceRoot,
    error: "No docs directory found. Set work.docsPath to enable Markdown rendering.",
  };
};

const readTitle = (filePath: string): string => {
  const fallback = toTitleCase(path.basename(filePath, MARKDOWN_EXT));
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const match = raw.match(/^#\s+(.+)$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch {
    // ignore
  }
  return fallback;
};

const ensureSymlink = (symlinkPath: string, targetDir: string): boolean => {
  if (!isDirectory(targetDir)) {
    return false;
  }

  try {
    const existing = fs.lstatSync(symlinkPath);
    if (existing.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(symlinkPath);
      if (currentTarget === targetDir) {
        return true;
      }
      fs.unlinkSync(symlinkPath);
    } else {
      // Not a symlink: do not overwrite user content.
      return false;
    }
  } catch {
    // Missing: create it.
  }

  try {
    fs.symlinkSync(targetDir, symlinkPath, "dir");
    return true;
  } catch {
    return false;
  }
};

const ensureAgentExternalRoots = (agentsRoot: string) => {
  if (path.basename(agentsRoot) !== WORKSPACE_AGENTS_DIR) {
    return;
  }

  const skillsDir = path.join(agentsRoot, SKILLS_DIR);
  const plansDir = path.join(agentsRoot, PLANS_DIR);

  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(plansDir, { recursive: true });
  } catch {
    return;
  }

  ensureSymlink(path.join(skillsDir, ".codex-global"), path.join(CODEX_HOME, SKILLS_DIR));
  ensureSymlink(path.join(skillsDir, ".claude-global"), path.join(CLAUDE_HOME, SKILLS_DIR));
  ensureSymlink(path.join(plansDir, ".codex-global"), path.join(CODEX_HOME, PLANS_DIR));
  ensureSymlink(path.join(plansDir, ".claude-global"), path.join(CLAUDE_HOME, PLANS_DIR));
};

const MAX_SCAN_DEPTH = 4;

const listMarkdownEntries = (
  root: string,
  group: DocGroup,
  subdir?: string,
  depth = 0,
  seen = new Set<string>(),
): DocEntry[] => {
  if (depth > MAX_SCAN_DEPTH) {
    return [];
  }
  const dirPath = subdir ? path.join(root, subdir) : root;
  if (!isDirectory(dirPath)) {
    return [];
  }
  const realDir = realpathOrNull(dirPath);
  if (realDir) {
    if (seen.has(realDir)) {
      return [];
    }
    seen.add(realDir);
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: DocEntry[] = entries
    .filter((entry) => isFile(path.join(dirPath, entry.name)))
    .filter((entry) => entry.name.toLowerCase().endsWith(MARKDOWN_EXT))
    .filter((entry) => !entry.name.startsWith("_") && !entry.name.startsWith("."))
    .map((entry) => {
      const relativePath = subdir ? path.join(subdir, entry.name) : entry.name;
      const id = toPosix(relativePath);
      const filePath = path.join(dirPath, entry.name);
      return {
        id,
        title: readTitle(filePath),
        group,
        relativePath: toPosix(relativePath),
      } satisfies DocEntry;
    });
  const subdirs = entries
    .filter((entry) => {
      if (entry.name.startsWith("_")) {
        return false;
      }
      if (entry.name.startsWith(".")) {
        return ALLOWED_HIDDEN_DIRS.has(entry.name);
      }
      return true;
    })
    .filter((entry) => isDirectory(path.join(dirPath, entry.name)));
  for (const dir of subdirs) {
    const childSubdir = subdir ? path.join(subdir, dir.name) : dir.name;
    files.push(...listMarkdownEntries(root, group, childSubdir, depth + 1, seen));
  }
  return files.sort((a, b) => a.title.localeCompare(b.title));
};

const resolveDocPath = (root: string, allowedRealRoots: string[], id: string): string | null => {
  const normalized = normalizeDocId(id);
  if (!normalized) {
    return null;
  }
  const target = path.resolve(root, normalized.split("/").join(path.sep));
  const base = path.resolve(root);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    return null;
  }
  if (!target.toLowerCase().endsWith(MARKDOWN_EXT)) {
    return null;
  }

  if (allowedRealRoots.length > 0) {
    const realTarget = realpathOrNull(target);
    if (!realTarget || !isWithinRoots(allowedRealRoots, realTarget)) {
      return null;
    }
  }

  return target;
};

const resolveAssetPath = (
  root: string,
  allowedRealRoots: string[],
  baseId: string,
  href: string,
): { path: string; withinRoot: boolean } | null => {
  const trimmed = href.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.split("#")[0].split("?")[0];
  if (!cleaned) {
    return null;
  }
  const decoded = (() => {
    try {
      return decodeURIComponent(cleaned);
    } catch {
      return cleaned;
    }
  })();
  const basePath = resolveDocPath(root, allowedRealRoots, baseId);
  if (!basePath) {
    return null;
  }
  const resolved = path.resolve(path.dirname(basePath), decoded);
  return { path: resolved, withinRoot: isWithinRoot(root, resolved) };
};

export const createDocsHandlers = ({ context }: DocsDependencies) => ({
  getDocsIndex: async (): Promise<DocsIndex> => {
    const { root, source, error } = resolveDocsRoot(context);
    if (!root) {
      return {
        root: null,
        source,
        entries: [],
        error,
      };
    }

    // If we're using the workspace/extension .claude root, wire in external Codex/Claude
    // content via symlinks so the UI can browse them.
    ensureAgentExternalRoots(root);

    const all = listMarkdownEntries(root, "docs");
    // Classify entries by subdir.
    for (const entry of all) {
      if (entry.relativePath.startsWith(`${RUNBOOKS_DIR}/`)) {
        entry.group = "runbooks";
        continue;
      }
      if (entry.relativePath.startsWith(`${PLANS_DIR}/`)) {
        entry.group = "plans";
        continue;
      }
      if (entry.relativePath.startsWith(`${SKILLS_DIR}/`)) {
        entry.group = "skills";
      }
    }

    return {
      root,
      source,
      entries: all,
    };
  },

  getDocContent: async (id: string): Promise<DocContent | null> => {
    const { root, allowedRealRoots } = resolveDocsRoot(context);
    if (!root) {
      return null;
    }
    const filePath = resolveDocPath(root, allowedRealRoots ?? [], id);
    if (!filePath || !isFile(filePath)) {
      return null;
    }
    const markdown = fs.readFileSync(filePath, "utf8");
    return {
      id: toPosix(id),
      title: readTitle(filePath),
      relativePath: toPosix(path.relative(root, filePath)),
      markdown,
    };
  },

  openDocInEditor: async (id: string): Promise<boolean> => {
    const { root, allowedRealRoots } = resolveDocsRoot(context);
    if (!root) {
      return false;
    }
    const filePath = resolveDocPath(root, allowedRealRoots ?? [], id);
    if (!filePath || !isFile(filePath)) {
      return false;
    }
    await commands.executeCommand("revealInExplorer", Uri.file(filePath));
    return true;
  },

  revealDocAsset: async (baseId: string, href: string): Promise<boolean> => {
    const { root, allowedRealRoots } = resolveDocsRoot(context);
    if (!root) {
      window.showWarningMessage("Docs folder is not configured.");
      return false;
    }
    const allowed = allowedRealRoots ?? [];
    const resolved = resolveAssetPath(root, allowed, baseId, href);
    if (!resolved) {
      window.showWarningMessage("Unable to resolve the linked file.");
      return false;
    }

    if (!fs.existsSync(resolved.path)) {
      window.showWarningMessage(`File not found: ${resolved.path}`);
      return false;
    }

    const realTarget = realpathOrNull(resolved.path) ?? resolved.path;
    if (allowed.length > 0 && !isWithinRoots(allowed, realTarget)) {
      window.showWarningMessage("Linked file is outside the allowed roots.");
      return false;
    }

    await commands.executeCommand("revealInExplorer", Uri.file(resolved.path));
    return true;
  },
});
