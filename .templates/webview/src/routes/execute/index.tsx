import { createFileRoute } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import { useEffect, useState } from "react";
import type {
  Automation,
  AutomationRun,
  AutomationsIndex,
} from "@shared/automations-contract";
import { useHandlers } from "../../hooks/use-handlers";
import { useAppContext } from "../../contexts/app-context";
import { StatusDot } from "../../components/StatusDot";

export const Route = createFileRoute("/execute/")({
  component: ExecutePage,
  staticData: ROUTE_META.execute,
});

const formatRelativeTime = (timestamp?: number): string => {
  if (!timestamp) return "Never";
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 0) {
    const absDiff = Math.abs(diff);
    if (absDiff < 60000) return "in <1m";
    if (absDiff < 3600000) return `in ${Math.round(absDiff / 60000)}m`;
    if (absDiff < 86400000) return `in ${Math.round(absDiff / 3600000)}h`;
    return `in ${Math.round(absDiff / 86400000)}d`;
  }

  if (diff < 60000) return "<1m ago";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
};

const truncate = (text: string, maxLen: number): string => {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
};

const DAY_NAMES: Record<string, string> = {
  MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun",
};
const ALL_WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"];
const ALL_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const humanizeRrule = (raw: string): string => {
  // If it's already human-friendly (doesn't start with RRULE:), return as-is
  if (!raw.startsWith("RRULE:")) return raw;

  const params: Record<string, string> = {};
  raw.replace("RRULE:", "").split(";").forEach((part) => {
    const [k, v] = part.split("=");
    if (k && v) params[k] = v;
  });

  const freq = params.FREQ;
  const interval = params.INTERVAL ? Number.parseInt(params.INTERVAL, 10) : 1;
  const byDay = params.BYDAY?.split(",") ?? [];
  const byHour = params.BYHOUR ? Number.parseInt(params.BYHOUR, 10) : undefined;

  // Format time portion
  const timeStr = byHour !== undefined
    ? ` at ${byHour === 0 ? "12am" : byHour <= 11 ? `${byHour}am` : byHour === 12 ? "12pm" : `${byHour - 12}pm`}`
    : "";

  // Format days
  const daySet = new Set(byDay);
  const isEveryDay = ALL_DAYS.every((d) => daySet.has(d));
  const isWeekdays = ALL_WEEKDAYS.every((d) => daySet.has(d)) && !daySet.has("SA") && !daySet.has("SU");
  const isWeekends = daySet.has("SA") && daySet.has("SU") && daySet.size === 2;

  let dayStr = "";
  if (isEveryDay || byDay.length === 0) {
    dayStr = "";
  } else if (isWeekdays) {
    dayStr = " on weekdays";
  } else if (isWeekends) {
    dayStr = " on weekends";
  } else {
    dayStr = ` on ${byDay.map((d) => DAY_NAMES[d] ?? d).join(", ")}`;
  }

  // Build sentence
  if (!freq) return raw;

  switch (freq) {
    case "MINUTELY":
      return interval === 1 ? "Every minute" : `Every ${interval} minutes`;
    case "HOURLY":
      return interval === 1 ? "Every hour" : `Every ${interval} hours`;
    case "DAILY": {
      const base = interval === 1 ? "Daily" : `Every ${interval} days`;
      return `${base}${timeStr}`;
    }
    case "WEEKLY": {
      if (isEveryDay || byDay.length === 7) {
        return `Daily${timeStr}`;
      }
      if (isWeekdays) {
        return `Weekdays${timeStr}`;
      }
      const base = interval === 1 ? "Weekly" : `Every ${interval} weeks`;
      return `${base}${dayStr}${timeStr}`;
    }
    case "MONTHLY": {
      const base = interval === 1 ? "Monthly" : `Every ${interval} months`;
      return `${base}${timeStr}`;
    }
    case "YEARLY": {
      const base = interval === 1 ? "Yearly" : `Every ${interval} years`;
      return `${base}${timeStr}`;
    }
    default:
      return raw;
  }
};

function AutomationRow({ automation, onLoadRuns }: { automation: Automation; onLoadRuns: (id: string) => Promise<AutomationRun[]> }) {
  const [expanded, setExpanded] = useState(false);
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  const handleToggle = async () => {
    if (!expanded && runs.length === 0) {
      setRunsLoading(true);
      try {
        setRuns(await onLoadRuns(automation.id));
      } catch {
        // silent
      } finally {
        setRunsLoading(false);
      }
    }
    setExpanded(!expanded);
  };

  const isActive = automation.status === "ACTIVE";

  return (
    <div className="automation-row">
      <button type="button" className="automation-row-header" onClick={handleToggle}>
        <StatusDot variant={isActive ? "ok" : "muted"} />
        <span className="automation-row-name">{automation.name}</span>
        <span className="automation-row-schedule">{humanizeRrule(automation.rruleHuman)}</span>
        <span className="automation-row-timing">
          {automation.lastRunAt ? formatRelativeTime(automation.lastRunAt) : "never"}
        </span>
        <span className="automation-row-chevron">{expanded ? "\u25BE" : "\u25B8"}</span>
      </button>

      {expanded && (
        <div className="automation-row-detail">
          <div className="automation-row-prompt">{truncate(automation.prompt, 200)}</div>
          <div className="automation-row-meta">
            <span>{automation.cwds.length} cwd{automation.cwds.length !== 1 ? "s" : ""}</span>
            {automation.hasMemory && <span>has memory</span>}
            <span>Next: {formatRelativeTime(automation.nextRunAt)}</span>
          </div>

          {runsLoading && <p className="note">Loading runs...</p>}
          {!runsLoading && runs.length > 0 && (
            <div className="automation-runs-compact">
              {runs.map((run) => (
                <div key={run.threadId} className="automation-run-row">
                  <StatusDot
                    variant={run.status === "ACCEPTED" ? "ok" : run.status === "ARCHIVED" ? "muted" : "warn"}
                  />
                  <span className="automation-run-status">{run.status}</span>
                  {run.threadTitle && <span className="automation-run-title">{truncate(run.threadTitle, 50)}</span>}
                  <span className="automation-run-time">{formatRelativeTime(run.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
          {!runsLoading && runs.length === 0 && expanded && <p className="note">No runs recorded.</p>}
        </div>
      )}
    </div>
  );
}

function ExecutePage() {
  const handlers = useHandlers();
  const { isWebview } = useAppContext();
  const [index, setIndex] = useState<AutomationsIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isWebview) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    handlers
      .getAutomations()
      .then((result) => {
        if (cancelled) return;
        setIndex(result);
        if (result.error) setError(result.error);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load automations.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [handlers, isWebview]);

  const loadRuns = async (automationId: string): Promise<AutomationRun[]> => {
    return handlers.getAutomationRuns(automationId);
  };

  if (!isWebview) {
    return (
      <div className="execute-empty">
        <p className="note">Open the extension inside VS Code to view automations.</p>
      </div>
    );
  }

  const allAutomations = index ? [...index.global, ...index.local] : [];
  const activeAutomations = allAutomations.filter((a) => a.status === "ACTIVE");
  const inactiveAutomations = allAutomations.filter((a) => a.status !== "ACTIVE");

  return (
    <div className="execute-page">
      {loading && <p className="note">Loading automations...</p>}
      {error && <div className="error">{error}</div>}

      {!loading && index && allAutomations.length === 0 && (
        <div className="execute-empty">
          <div className="execute-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 3" />
            </svg>
          </div>
          <p className="execute-empty-title">No automations</p>
          <p className="execute-empty-hint">
            Add automation configs to <code>~/.codex/automations/</code> or <code>.claude/automations/</code> in your work.
          </p>
        </div>
      )}

      {!loading && activeAutomations.length > 0 && (
        <div className="execute-section">
          <div className="section-label">Active ({activeAutomations.length})</div>
          <div className="automation-list-compact">
            {activeAutomations.map((a) => (
              <AutomationRow key={a.id} automation={a} onLoadRuns={loadRuns} />
            ))}
          </div>
        </div>
      )}

      {!loading && inactiveAutomations.length > 0 && (
        <div className="execute-section">
          <div className="section-label">Inactive ({inactiveAutomations.length})</div>
          <div className="automation-list-compact">
            {inactiveAutomations.map((a) => (
              <AutomationRow key={a.id} automation={a} onLoadRuns={loadRuns} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
