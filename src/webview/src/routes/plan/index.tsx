import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ROUTE_META } from "@shared/contracts";
import type { TriageState, TriagedIssue } from "@shared/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppContext } from "../../contexts/app-context";
import { useHandlers } from "../../hooks/use-handlers";
import { ActionStack } from "../../components/ActionStack";
import { WorklistSection } from "../../components/WorklistSection";
import { StatusDot } from "../../components/StatusDot";
import type { AutomationsIndex } from "@shared/automations-contract";

export const Route = createFileRoute("/plan/")({
  component: PlanPage,
  staticData: ROUTE_META.plan,
});

const statusVariant = (status: string) => {
  const lower = status.toLowerCase();
  if (lower.includes("done")) return "ok" as const;
  if (lower.includes("progress")) return "warn" as const;
  return "muted" as const;
};

function IssueRow({ issue, onNavigate }: { issue: TriagedIssue; onNavigate: (path: string) => void }) {
  return (
    <button
      type="button"
      className="review-issue-row"
      onClick={() => onNavigate(`/review/issues/${issue.key}`)}
    >
      <span className="review-issue-row-key">{issue.key}</span>
      <span className="review-issue-row-summary">{issue.summary}</span>
      <StatusDot variant={statusVariant(issue.status)} label={issue.status} />
    </button>
  );
}

function PlanPage() {
  const { status, isWebview, navigate: appNavigate } = useAppContext();
  const navigate = useNavigate();
  const handlers = useHandlers();
  const [automations, setAutomations] = useState<AutomationsIndex | null>(null);
  const [automationsError, setAutomationsError] = useState("");
  const [triage, setTriage] = useState<TriageState | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);

  // Load automations
  useEffect(() => {
    if (!isWebview) return;
    let cancelled = false;
    setAutomationsError("");
    handlers
      .getAutomations()
      .then((result) => {
        if (!cancelled) {
          setAutomations(result);
          if (result.error) setAutomationsError(result.error);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setAutomationsError(err instanceof Error ? err.message : "Failed to load automations.");
        }
      });
    return () => { cancelled = true; };
  }, [handlers, isWebview]);

  // Auto-load persisted triage state on mount
  useEffect(() => {
    if (!isWebview || !status.isConnected) return;
    let cancelled = false;
    handlers
      .getTriageState()
      .then((result) => {
        if (!cancelled && result.lastTriagedAt) {
          setTriage(result);
        }
      })
      .catch(() => { /* ignore — first load may have no state */ });
    return () => { cancelled = true; };
  }, [handlers, isWebview, status.isConnected]);

  // Run Triage — fetch fresh from Jira, categorize, persist
  const runTriage = useCallback(async () => {
    setTriageLoading(true);
    try {
      const result = await handlers.runTriage();
      setTriage(result);
    } catch {
      // keep existing triage on failure
    } finally {
      setTriageLoading(false);
    }
  }, [handlers]);

  const openDoc = (id: string) => {
    navigate({ to: "/system/docs", search: { doc: id } });
  };

  const automationSummary = useMemo(() => {
    const all = automations ? [...automations.global, ...automations.local] : [];
    const active = all.filter((a) => a.status === "ACTIVE");
    const nextRun = active
      .map((a) => a.nextRunAt)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t))
      .sort((a, b) => a - b)[0];
    const lastRun = active
      .map((a) => a.lastRunAt)
      .filter((t): t is number => typeof t === "number" && Number.isFinite(t))
      .sort((a, b) => b - a)[0];
    return { total: all.length, active: active.length, nextRun, lastRun };
  }, [automations]);

  const buckets = useMemo(() => {
    const now: TriagedIssue[] = [];
    const next: TriagedIssue[] = [];
    const waiting: TriagedIssue[] = [];
    if (triage?.issues) {
      for (const issue of triage.issues) {
        if (issue.bucket === "now") now.push(issue);
        else if (issue.bucket === "waiting") waiting.push(issue);
        else next.push(issue);
      }
    }
    return { now, next, waiting };
  }, [triage]);

  const hasTriage = triage?.lastTriagedAt != null;

  return (
    <div className="plan-layout">
      <div className="plan-worklist">
        <div className="worklist">
          <WorklistSection
            title="Now"
            isEmpty={buckets.now.length === 0}
            emptyMessage={hasTriage ? "Nothing in progress." : "No in-progress issues."}
          >
            {buckets.now.map((issue) => (
              <IssueRow key={issue.key} issue={issue} onNavigate={appNavigate} />
            ))}
          </WorklistSection>

          <WorklistSection
            title="Next"
            isEmpty={buckets.next.length === 0}
            emptyMessage={hasTriage ? "No upcoming items." : "No upcoming items."}
          >
            {buckets.next.map((issue) => (
              <IssueRow key={issue.key} issue={issue} onNavigate={appNavigate} />
            ))}
          </WorklistSection>

          <WorklistSection
            title="Waiting"
            isEmpty={buckets.waiting.length === 0}
            emptyMessage={hasTriage ? "Nothing blocked." : "Nothing blocked."}
          >
            {buckets.waiting.map((issue) => (
              <IssueRow key={issue.key} issue={issue} onNavigate={appNavigate} />
            ))}
          </WorklistSection>
        </div>

        {!status.isConnected && (
          <p className="note">Connect your Jira workspace to see sprint issues here.</p>
        )}

        {automationsError ? <div className="error">{automationsError}</div> : null}
      </div>

      <ActionStack
        actions={[
          {
            label: status.isConnected
              ? triageLoading ? "Triaging\u2026" : "Run Triage"
              : "Connect",
            primary: true,
            disabled: !isWebview || triageLoading,
            onClick: () => {
              if (!status.isConnected) {
                navigate({ to: "/system/settings" });
                return;
              }
              void runTriage();
            },
          },
          {
            label: "Automations",
            disabled: !isWebview,
            onClick: () => navigate({ to: "/execute" }),
          },
          {
            label: "Reminder UI",
            disabled: !isWebview,
            onClick: () => openDoc("docs/reminder-ui.md"),
          },
          {
            label: "Lifecycle UI",
            disabled: !isWebview,
            onClick: () => openDoc("docs/lifecycle-ui.md"),
          },
        ]}
        context={
          <div>
            <div>Connected: {status.isConnected ? "yes" : "no"}</div>
            <div>Automations: {automationSummary.active}/{automationSummary.total} active</div>
            {automationSummary.lastRun ? (
              <div>Last run: {new Date(automationSummary.lastRun).toLocaleString()}</div>
            ) : (
              <div>Last run: unknown</div>
            )}
            {automationSummary.nextRun ? (
              <div>Next run: {new Date(automationSummary.nextRun).toLocaleString()}</div>
            ) : (
              <div>Next run: unknown</div>
            )}
            {triage?.lastTriagedAt ? (
              <div>Triaged: {new Date(triage.lastTriagedAt).toLocaleString()}</div>
            ) : null}
          </div>
        }
      />
    </div>
  );
}
