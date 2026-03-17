import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { ROUTE_META } from "@shared/contracts";
import { useAppContext } from "../../contexts/app-context";
import { StatusDot } from "../../components/StatusDot";

export const Route = createFileRoute("/review/")({
  component: ReviewPage,
  staticData: ROUTE_META.review,
});

const truncate = (value: string, length: number) => {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trim()}\u2026`;
};

const statusVariant = (status: string) => {
  const lower = status.toLowerCase();
  if (lower.includes("done")) return "ok" as const;
  if (lower.includes("progress")) return "warn" as const;
  return "muted" as const;
};

function ReviewPage() {
  const {
    issue,
    issueLoading,
    issueError,
    issueKey,
    issueView,
    setIssueView,
    openIssueInBrowser,
    refreshIssue,
    isWebview,
    navigate,
    sprintIssues,
    sprintIssuesLoading,
  } = useAppContext();

  const description = useMemo(() => {
    if (!issue?.description) return "";
    return issueView === "compact" ? truncate(issue.description, 420) : issue.description;
  }, [issue?.description, issueView]);

  // No specific issue selected — show sprint issues list
  if (!issueKey) {
    if (sprintIssuesLoading) {
      return (
        <div className="review-empty">
          <p className="note">Loading sprint issues...</p>
        </div>
      );
    }

    if (sprintIssues.length === 0) {
      return (
        <div className="review-empty">
          <div className="review-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 9h6M9 13h4" />
            </svg>
          </div>
          <p className="review-empty-title">No issues found</p>
          <p className="review-empty-hint">
            No issues match your current sprint filter. Try updating your JQL in settings, or navigate to a deep link like{" "}
            <a href="#" className="inline-route-link" onClick={(e) => { e.preventDefault(); navigate("/review/issues/CSO-123"); }}><code>/review/issues/CSO-123</code></a>
          </p>
        </div>
      );
    }

    return (
      <div className="review-issue-list">
        <p className="review-issue-list-header">Sprint Issues</p>
        {sprintIssues.map((item) => (
          <button
            key={item.key}
            type="button"
            className="review-issue-row"
            onClick={() => navigate(`/review/issues/${item.key}`)}
          >
            <span className="review-issue-row-key">{item.key}</span>
            <span className="review-issue-row-summary">{item.summary}</span>
            <StatusDot variant={statusVariant(item.status)} label={item.status} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="review-detail">
      {/* Header */}
      <div className="review-header">
        <div className="review-key-row">
          <span className="review-key">{issueKey}</span>
          {issue && (
            <StatusDot
              variant={issue.status?.toLowerCase().includes("done") ? "ok" : issue.status?.toLowerCase().includes("progress") ? "warn" : "muted"}
              label={issue.status}
            />
          )}
        </div>
        {issue?.summary && <h2 className="review-summary">{issue.summary}</h2>}
        <div className="review-actions">
          <button
            type="button"
            className="secondary"
            onClick={openIssueInBrowser}
            disabled={!isWebview}
          >
            Open in Jira
          </button>
          <button
            type="button"
            className="secondary"
            onClick={refreshIssue}
            disabled={!isWebview || issueLoading}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Loading / Error */}
      {issueLoading && <p className="note">Loading issue details...</p>}
      {issueError && <div className="error">{issueError}</div>}

      {/* Issue content */}
      {issue && !issueLoading && (
        <>
          {/* Metadata as dense rows */}
          <div className="review-fields">
            <div className="review-field">
              <span className="review-field-label">Type</span>
              <span>{issue.issueType}</span>
            </div>
            {issue.priority && (
              <div className="review-field">
                <span className="review-field-label">Priority</span>
                <span>{issue.priority}</span>
              </div>
            )}
            {issue.project && (
              <div className="review-field">
                <span className="review-field-label">Project</span>
                <span>{issue.project}</span>
              </div>
            )}
            {issue.assignee && (
              <div className="review-field">
                <span className="review-field-label">Assignee</span>
                <span>{issue.assignee}</span>
              </div>
            )}
            {issue.reporter && (
              <div className="review-field">
                <span className="review-field-label">Reporter</span>
                <span>{issue.reporter}</span>
              </div>
            )}
            {issue.created && (
              <div className="review-field">
                <span className="review-field-label">Created</span>
                <span>{new Date(issue.created).toLocaleDateString()}</span>
              </div>
            )}
            {issue.updated && (
              <div className="review-field">
                <span className="review-field-label">Updated</span>
                <span>{new Date(issue.updated).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="review-description-section">
            <div className="review-description-header">
              <span className="section-label">Description</span>
              <div className="segmented">
                <button
                  type="button"
                  className={issueView === "compact" ? "active" : ""}
                  onClick={() => setIssueView("compact")}
                >
                  Compact
                </button>
                <button
                  type="button"
                  className={issueView === "full" ? "active" : ""}
                  onClick={() => setIssueView("full")}
                >
                  Full
                </button>
              </div>
            </div>
            {description ? (
              <pre className="review-description">{description}</pre>
            ) : (
              <p className="note">No description.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
