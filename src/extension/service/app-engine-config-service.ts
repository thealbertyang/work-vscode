import fs from "fs";
import path from "path";
import { workspace } from "vscode";
import { parseSimpleToml } from "../../shared/simple-toml";

export type AppEngineConfig = {
  version: 1;
  outputs: {
    userConfigPath: string;
    globalStatePath: string;
    persistedStatePath: string;
  };
  sources: {
    universalConfigPath: string;
  };
  registry?: {
    includeUniversalConfig?: boolean;
    includeFullConfig?: boolean;
    includeWebviewState?: boolean;
    includePersistedState?: boolean;
    includeWorkspaceUserConfig?: boolean;
  };
  redaction?: {
    mode?: "mask" | "remove";
    keyPatterns?: string[];
  };
};

const APP_ENGINE_CONFIG_REL_PATH = path.join("config", "app.config.toml");

export const DEFAULT_APP_ENGINE_CONFIG: AppEngineConfig = {
  version: 1,
  outputs: {
    userConfigPath: ".claude/app.config.toml",
    globalStatePath: ".claude/app-global-state.json",
    persistedStatePath: ".claude/state.json",
  },
  sources: {
    universalConfigPath: "config/universal.toml",
  },
  registry: {
    includeUniversalConfig: true,
    includeFullConfig: true,
    includeWebviewState: true,
    includePersistedState: true,
    includeWorkspaceUserConfig: true,
  },
  redaction: {
    mode: "mask",
    keyPatterns: ["token", "secret", "password", "authorization"],
  },
};

const isFile = (value: string): boolean => {
  try {
    return fs.statSync(value).isFile();
  } catch {
    return false;
  }
};

const resolveConfigPath = (extensionPath: string): string | undefined => {
  const workspaceFolders = workspace.workspaceFolders ?? [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(folder.uri.fsPath, APP_ENGINE_CONFIG_REL_PATH);
    if (isFile(candidate)) {
      return candidate;
    }
  }

  const fallback = path.join(extensionPath, APP_ENGINE_CONFIG_REL_PATH);
  if (isFile(fallback)) {
    return fallback;
  }

  return undefined;
};

const mergeEngineConfig = (
  base: AppEngineConfig,
  override?: Partial<AppEngineConfig>,
): AppEngineConfig => {
  if (!override) return base;
  return {
    ...base,
    ...override,
    outputs: {
      ...base.outputs,
      ...override.outputs,
    },
    sources: {
      ...base.sources,
      ...override.sources,
    },
    registry: {
      ...base.registry,
      ...override.registry,
    },
    redaction: {
      ...base.redaction,
      ...override.redaction,
    },
  };
};

export class AppEngineConfigService {
  private cached?: AppEngineConfig;
  private cachedMtimeMs?: number;
  private configPath?: string;

  constructor(private readonly extensionPath: string) {}

  getConfig(): AppEngineConfig {
    const configPath = this.getConfigPath();
    if (!configPath) {
      this.cached = DEFAULT_APP_ENGINE_CONFIG;
      return this.cached;
    }

    try {
      const stat = fs.statSync(configPath);
      const mtimeMs = stat.mtimeMs;
      if (this.cached && this.cachedMtimeMs === mtimeMs) {
        return this.cached;
      }
      const content = fs.readFileSync(configPath, "utf8");
      const parsed = parseSimpleToml(content) as Partial<AppEngineConfig>;
      this.cached = mergeEngineConfig(DEFAULT_APP_ENGINE_CONFIG, parsed);
      this.cachedMtimeMs = mtimeMs;
      return this.cached;
    } catch {
      this.cached = DEFAULT_APP_ENGINE_CONFIG;
      this.cachedMtimeMs = undefined;
      return this.cached;
    }
  }

  getConfigPath(): string | undefined {
    if (this.configPath) {
      return this.configPath;
    }
    this.configPath = resolveConfigPath(this.extensionPath);
    return this.configPath;
  }
}
