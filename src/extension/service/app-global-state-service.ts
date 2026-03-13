import fs from "fs";
import path from "path";
import type { Disposable, ExtensionContext } from "vscode";
import { RelativePattern, Uri, workspace } from "vscode";
import type { UniversalConfig } from "../../shared/universal";
import type { FullConfig } from "../handlers/config";
import type { WebviewState, AppPersistedState } from "../../shared/contracts";
import { EMPTY_APP_STATE } from "../../shared/contracts";
import { parseSimpleToml } from "../../shared/simple-toml";
import { log } from "../providers/data/jira/logger";
import { AppEngineConfigService, DEFAULT_APP_ENGINE_CONFIG, type AppEngineConfig } from "./app-engine-config-service";
import { UniversalConfigService } from "./universal-config-service";

const ensureDir = (dir: string) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
};

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const readJsonFile = <T>(filePath: string, fallback: T): T => {
  try {
    if (!isFile(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
};

const readWorkspaceUserConfig = (filePath: string): Record<string, unknown> | null => {
  try {
    if (!isFile(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return parseSimpleToml(raw);
  } catch {
    return null;
  }
};

const defaultUserConfigTemplate = `# Work App Config (User-Facing)
#
# This file is for user intent and workspace preferences only.
# Do NOT put secrets here (API tokens, WS tokens, passwords). Use VS Code Secrets/Settings.
#
# Live, read-only cache written by the extension:
#   .claude/app-global-state.json

version = 1

[preferences]
defaultRoute = ""

[docs]
extraPaths = []

[dev]
webviewServerUrl = ""
wsBridgeUrl = ""
`;

const writeFileAtomic = (filePath: string, content: string): void => {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, filePath);
};

const looksSecretKey = (key: string, patterns: string[]): boolean => {
  const lower = key.toLowerCase();
  return patterns.some((p) => lower.includes(p.toLowerCase()));
};

const redactByKeyPatterns = (
  value: unknown,
  patterns: string[],
  mode: "mask" | "remove",
  depth = 0,
): unknown => {
  if (depth > 8) {
    return "[Truncated]";
  }

  if (Array.isArray(value)) {
    return value.map((v) => redactByKeyPatterns(v, patterns, mode, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (looksSecretKey(k, patterns) && typeof v === "string") {
      if (mode === "remove") {
        continue;
      }
      out[k] = "********";
      continue;
    }
    out[k] = redactByKeyPatterns(v, patterns, mode, depth + 1);
  }
  return out;
};

const resolveWorkspaceRoot = (context: ExtensionContext): { root: string; uri: Uri } | null => {
  const workspaceFolder =
    workspace.getWorkspaceFolder(Uri.file(context.extensionPath)) ??
    workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return null;
  }
  return { root: workspaceFolder.uri.fsPath, uri: workspaceFolder.uri };
};

const readPersistedState = (filePath: string): AppPersistedState => {
  const parsed = readJsonFile<AppPersistedState>(filePath, EMPTY_APP_STATE);
  if (!parsed || (parsed as any).version !== 1) {
    return EMPTY_APP_STATE;
  }
  // Be defensive: allow partial state and keep the schema resilient.
  const triage = (parsed as any).triage;
  return {
    version: 1,
    triage:
      triage && typeof triage === "object"
        ? {
            issues: Array.isArray(triage.issues) ? triage.issues : EMPTY_APP_STATE.triage.issues,
            lastTriagedAt:
              typeof triage.lastTriagedAt === "number" || triage.lastTriagedAt === null
                ? triage.lastTriagedAt
                : EMPTY_APP_STATE.triage.lastTriagedAt,
          }
        : EMPTY_APP_STATE.triage,
  };
};

export type AppGlobalState = {
  version: 1;
  generatedAt: number;
  workspace: {
    root: string;
  };
  engine: {
    configPath?: string;
    config: AppEngineConfig;
  };
  files: {
    userConfigPath: string;
    globalStatePath: string;
    persistedStatePath: string;
    universalConfigPath?: string;
  };
  userConfig?: Record<string, unknown> | null;
  registry?: {
    universal?: UniversalConfig;
  };
  webviewState?: WebviewState;
  fullConfig?: FullConfig;
  persistedState?: AppPersistedState;
};

type AppGlobalStateSources = {
  getUniversalConfig: () => Promise<UniversalConfig>;
  getFullConfig: () => Promise<FullConfig>;
  getState: () => Promise<WebviewState>;
};

export class AppGlobalStateService implements Disposable {
  private readonly engineService: AppEngineConfigService;
  private readonly universalService: UniversalConfigService;
  private readonly disposables: Disposable[] = [];
  private writeTimer: NodeJS.Timeout | null = null;
  private writing = false;

  constructor(
    private readonly context: ExtensionContext,
    private readonly sources: AppGlobalStateSources,
  ) {
    this.engineService = new AppEngineConfigService(context.extensionPath);
    this.universalService = new UniversalConfigService(context.extensionPath);
  }

  start(): void {
    const ws = resolveWorkspaceRoot(this.context);
    if (!ws) {
      return;
    }

    // Ensure the user-facing config exists (never overwrite).
    const engine = this.engineService.getConfig();
    const userConfigPath = path.join(ws.root, engine.outputs.userConfigPath);
    if (!isFile(userConfigPath)) {
      try {
        writeFileAtomic(userConfigPath, defaultUserConfigTemplate);
      } catch {
        // ignore
      }
    }

    // Watch key inputs that affect the app-global-state snapshot.
    const watch = (relativePath: string) => {
      const watcher = workspace.createFileSystemWatcher(new RelativePattern(ws.uri, relativePath));
      const schedule = () => this.scheduleWrite();
      watcher.onDidChange(schedule);
      watcher.onDidCreate(schedule);
      watcher.onDidDelete(schedule);
      this.disposables.push(watcher);
    };

    watch(engine.outputs.persistedStatePath);
    watch(engine.outputs.userConfigPath);
    watch(engine.sources.universalConfigPath);

    this.disposables.push(
      workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("work")) {
          this.scheduleWrite();
        }
      }),
    );

    // Initial write.
    this.scheduleWrite();
  }

  dispose(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    for (const d of this.disposables.splice(0)) {
      d.dispose();
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null;
      void this.writeNow();
    }, 150);
  }

  async writeNow(): Promise<void> {
    if (this.writing) {
      return;
    }
    this.writing = true;
    try {
      const ws = resolveWorkspaceRoot(this.context);
      if (!ws) return;

      const engine = this.engineService.getConfig() ?? DEFAULT_APP_ENGINE_CONFIG;
      const universalConfigPath = this.universalService.getConfigPath();

      const userConfigPath = path.join(ws.root, engine.outputs.userConfigPath);
      const persistedStatePath = path.join(ws.root, engine.outputs.persistedStatePath);
      const globalStatePath = path.join(ws.root, engine.outputs.globalStatePath);

      const userConfig = engine.registry?.includeWorkspaceUserConfig
        ? readWorkspaceUserConfig(userConfigPath)
        : null;

      const persistedState = engine.registry?.includePersistedState
        ? readPersistedState(persistedStatePath)
        : undefined;

      const [universal, fullConfig, webviewState] = await Promise.all([
        engine.registry?.includeUniversalConfig ? this.sources.getUniversalConfig() : Promise.resolve(undefined),
        engine.registry?.includeFullConfig ? this.sources.getFullConfig() : Promise.resolve(undefined),
        engine.registry?.includeWebviewState ? this.sources.getState() : Promise.resolve(undefined),
      ]);

      const state: AppGlobalState = {
        version: 1,
        generatedAt: Date.now(),
        workspace: { root: ws.root },
        engine: {
          configPath: this.engineService.getConfigPath(),
          config: engine,
        },
        files: {
          userConfigPath: engine.outputs.userConfigPath,
          globalStatePath: engine.outputs.globalStatePath,
          persistedStatePath: engine.outputs.persistedStatePath,
          universalConfigPath: universalConfigPath
            ? path.relative(ws.root, universalConfigPath) || engine.sources.universalConfigPath
            : undefined,
        },
        userConfig,
        registry: universal ? { universal } : undefined,
        webviewState: webviewState as WebviewState | undefined,
        fullConfig: fullConfig as FullConfig | undefined,
        persistedState,
      };

      const patterns = engine.redaction?.keyPatterns ?? DEFAULT_APP_ENGINE_CONFIG.redaction?.keyPatterns ?? [];
      const mode = engine.redaction?.mode ?? DEFAULT_APP_ENGINE_CONFIG.redaction?.mode ?? "mask";
      const sanitized = patterns.length > 0 ? redactByKeyPatterns(state, patterns, mode) : state;

      writeFileAtomic(globalStatePath, `${JSON.stringify(sanitized, null, 2)}\n`);
    } catch (err) {
      log(`[app-global-state] failed to write: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.writing = false;
    }
  }
}
