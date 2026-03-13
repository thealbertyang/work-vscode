import fs from "fs";
import path from "path";
import { workspace } from "vscode";
import type { HandlerDependencies } from "./types";
import type {
  Automation,
  AutomationRun,
  AutomationsIndex,
  AutomationSource,
} from "../../shared/automations-contract";

type AutomationsDependencies = Pick<HandlerDependencies, "context">;

const CODEX_HOME = process.env.CODEX_HOME?.trim() || path.join(process.env.HOME ?? "", ".codex");
const AUTOMATIONS_DIR = "automations";
const AUTOMATION_TOML = "automation.toml";
const MEMORY_FILE = "memory.md";
const SQLITE_DB = path.join(CODEX_HOME, "sqlite", "codex-dev.db");

type TomlAutomation = {
  version?: number;
  id: string;
  name: string;
  prompt: string;
  status?: string;
  rrule?: string;
  cwds?: string[];
  created_at?: number;
  updated_at?: number;
};

const parseSimpleToml = (content: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value: unknown = rawValue;

    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      value = rawValue.slice(1, -1);
    } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      try {
        value = JSON.parse(rawValue.replace(/'/g, '"'));
      } catch {
        value = [];
      }
    } else if (rawValue === "true") {
      value = true;
    } else if (rawValue === "false") {
      value = false;
    } else if (/^\d+$/.test(rawValue)) {
      value = parseInt(rawValue, 10);
    }

    result[key] = value;
  }

  return result;
};

const ALL_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
const ALL_DAYS_SET = new Set(["SU", "MO", "TU", "WE", "TH", "FR", "SA"]);
const DAY_LABELS: Record<string, string> = {
  MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun",
};

const formatTime12h = (hour: number): string => {
  if (hour === 0) return "12am";
  if (hour < 12) return `${hour}am`;
  if (hour === 12) return "12pm";
  return `${hour - 12}pm`;
};

const rruleToHuman = (rrule: string): string => {
  if (!rrule) return "Not scheduled";

  const parts: Record<string, string> = {};
  rrule.split(";").forEach((part) => {
    const [key, val] = part.split("=");
    if (key && val) parts[key] = val;
  });

  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL ?? "1", 10);
  const byDayRaw = parts.BYDAY?.split(",") ?? [];
  const byHour = parts.BYHOUR ? parseInt(parts.BYHOUR, 10) : undefined;

  const timeStr = byHour !== undefined ? ` at ${formatTime12h(byHour)}` : "";

  // Classify day sets
  const daySet = new Set(byDayRaw);
  const isEveryDay = daySet.size >= 7 || (daySet.size > 0 && [...ALL_DAYS_SET].every((d) => daySet.has(d)));
  const isWeekdays = ALL_WEEKDAYS.every((d) => daySet.has(d)) && !daySet.has("SA") && !daySet.has("SU");
  const isWeekends = daySet.has("SA") && daySet.has("SU") && daySet.size === 2;

  if (freq === "MINUTELY") {
    return interval === 1 ? "Every minute" : `Every ${interval} min`;
  }

  if (freq === "HOURLY") {
    if (interval === 1) return "Hourly";
    if (interval === 24) return "Daily";
    return `Every ${interval}h`;
  }

  if (freq === "DAILY") {
    const base = interval === 1 ? "Daily" : `Every ${interval} days`;
    return `${base}${timeStr}`;
  }

  if (freq === "WEEKLY") {
    if (isEveryDay) return `Daily${timeStr}`;
    if (isWeekdays) return `Weekdays${timeStr}`;
    if (isWeekends) return `Weekends${timeStr}`;
    if (byDayRaw.length > 0) {
      const dayNames = byDayRaw.map((d) => DAY_LABELS[d] ?? d).join(", ");
      return `${dayNames}${timeStr}`;
    }
    const base = interval === 1 ? "Weekly" : `Every ${interval} weeks`;
    return `${base}${timeStr}`;
  }

  if (freq === "MONTHLY") {
    const base = interval === 1 ? "Monthly" : `Every ${interval} months`;
    return `${base}${timeStr}`;
  }

  if (freq === "YEARLY") {
    return interval === 1 ? "Yearly" : `Every ${interval} years`;
  }

  return rrule;
};

const isDirectory = (p: string): boolean => {
  try {
    // statSync follows symlinks, so symlinked dirs resolve correctly
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

const GLOBAL_SYMLINK_NAME = ".codex-global";

/**
 * Ensure a symlink exists at `.claude/automations/.codex-global` -> `~/.codex/automations/`.
 * This lets VS Code file watchers on the workspace observe global automation changes.
 */
const ensureGlobalSymlink = (workAgentsDir: string): string | null => {
  const globalDir = path.join(CODEX_HOME, AUTOMATIONS_DIR);
  if (!isDirectory(globalDir)) return null;

  const agentsAutomationsDir = path.join(workAgentsDir, AUTOMATIONS_DIR);

  // Ensure .claude/automations/ exists
  try {
    fs.mkdirSync(agentsAutomationsDir, { recursive: true });
  } catch {
    return null;
  }

  const symlinkPath = path.join(agentsAutomationsDir, GLOBAL_SYMLINK_NAME);

  try {
    const existing = fs.lstatSync(symlinkPath);
    if (existing.isSymbolicLink()) {
      const target = fs.readlinkSync(symlinkPath);
      if (target === globalDir) return symlinkPath; // Already correct
      // Wrong target — remove and recreate
      fs.unlinkSync(symlinkPath);
    } else {
      // Not a symlink (someone created a real dir) — don't touch it
      return null;
    }
  } catch {
    // Doesn't exist — create it
  }

  try {
    fs.symlinkSync(globalDir, symlinkPath, "dir");
    return symlinkPath;
  } catch (err) {
    console.warn("Failed to create global automations symlink:", err);
    return null;
  }
};

const loadAutomationsFromDir = (
  dir: string,
  source: AutomationSource,
  timingMap: Map<string, { nextRunAt?: number; lastRunAt?: number }>,
): Automation[] => {
  if (!isDirectory(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const automations: Automation[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    // Use statSync to follow symlinks — entry.isDirectory() doesn't follow them
    const entryPath = path.join(dir, entry.name);
    if (!isDirectory(entryPath)) continue;

    const automationDir = path.join(dir, entry.name);
    const tomlPath = path.join(automationDir, AUTOMATION_TOML);
    const memoryPath = path.join(automationDir, MEMORY_FILE);

    if (!isFile(tomlPath)) continue;

    try {
      const content = fs.readFileSync(tomlPath, "utf8");
      const parsed = parseSimpleToml(content) as TomlAutomation;

      const id = parsed.id ?? entry.name;
      const timing = timingMap.get(id);

      automations.push({
        id,
        name: parsed.name ?? entry.name,
        prompt: parsed.prompt ?? "",
        status: (parsed.status as "ACTIVE" | "INACTIVE") ?? "ACTIVE",
        rrule: parsed.rrule ?? "",
        rruleHuman: rruleToHuman(parsed.rrule ?? ""),
        cwds: Array.isArray(parsed.cwds) ? parsed.cwds : [],
        hasMemory: isFile(memoryPath),
        nextRunAt: timing?.nextRunAt,
        lastRunAt: timing?.lastRunAt,
        source,
        createdAt: parsed.created_at,
        updatedAt: parsed.updated_at,
      });
    } catch (err) {
      console.warn(`Failed to parse automation at ${tomlPath}:`, err);
    }
  }

  return automations;
};

const querySqliteTiming = (): Map<string, { nextRunAt?: number; lastRunAt?: number }> => {
  const map = new Map<string, { nextRunAt?: number; lastRunAt?: number }>();

  if (!isFile(SQLITE_DB)) return map;

  try {
    const { execSync } = require("child_process");
    const result = execSync(
      `sqlite3 "${SQLITE_DB}" "SELECT id, next_run_at, last_run_at FROM automations"`,
      { encoding: "utf8", timeout: 5000 },
    );

    const lines: string[] = result.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const [id, nextRun, lastRun] = line.split("|");
      if (id) {
        map.set(id, {
          nextRunAt: nextRun ? parseInt(nextRun, 10) : undefined,
          lastRunAt: lastRun ? parseInt(lastRun, 10) : undefined,
        });
      }
    }
  } catch (err) {
    console.warn("Failed to query SQLite timing:", err);
  }

  return map;
};

const queryAutomationRuns = (automationId: string): AutomationRun[] => {
  if (!isFile(SQLITE_DB)) return [];

  try {
    const { execSync } = require("child_process");
    const query = `SELECT thread_id, automation_id, status, thread_title, inbox_summary, source_cwd, created_at, updated_at, archived_reason FROM automation_runs WHERE automation_id = '${automationId.replace(/'/g, "''")}' ORDER BY created_at DESC LIMIT 10`;
    const result = execSync(`sqlite3 "${SQLITE_DB}" "${query}"`, {
      encoding: "utf8",
      timeout: 5000,
    });

    const lines = result.trim().split("\n").filter(Boolean);
    return lines.map((line: string) => {
      const [threadId, autoId, status, title, summary, cwd, created, updated, reason] =
        line.split("|");
      return {
        threadId,
        automationId: autoId,
        status: (status as "ACCEPTED" | "ARCHIVED" | "PENDING") ?? "PENDING",
        threadTitle: title || undefined,
        inboxSummary: summary || undefined,
        sourceCwd: cwd || undefined,
        createdAt: parseInt(created, 10) || 0,
        updatedAt: parseInt(updated, 10) || 0,
        archivedReason: reason || undefined,
      };
    });
  } catch (err) {
    console.warn("Failed to query automation runs:", err);
    return [];
  }
};

export const createAutomationHandlers = ({ context: _context }: AutomationsDependencies) => ({
  getAutomations: async (): Promise<AutomationsIndex> => {
    const timingMap = querySqliteTiming();

    const workspaceFolder = workspace.workspaceFolders?.[0];
    const agentsDir = workspaceFolder
      ? path.join(workspaceFolder.uri.fsPath, ".claude")
      : null;

    // Ensure symlink: .claude/automations/.codex-global -> ~/.codex/automations/
    // This lets VS Code file watchers observe global automation changes from the work.
    let globalDir = path.join(CODEX_HOME, AUTOMATIONS_DIR);
    if (agentsDir) {
      const symlink = ensureGlobalSymlink(agentsDir);
      if (symlink) {
        // Read global automations via the symlink so watchers stay consistent
        globalDir = symlink;
      }
    }

    const globalAutomations = loadAutomationsFromDir(globalDir, "global", timingMap);

    let localAutomations: Automation[] = [];
    if (agentsDir) {
      const workspaceDir = path.join(agentsDir, AUTOMATIONS_DIR);
      localAutomations = loadAutomationsFromDir(workspaceDir, "local", timingMap);
    }

    return {
      global: globalAutomations,
      local: localAutomations,
    };
  },

  getAutomationRuns: async (automationId: string): Promise<AutomationRun[]> => {
    return queryAutomationRuns(automationId);
  },
});
