import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { ROUTE_META } from "@shared/contracts";
import { useAppContext } from "../../../contexts/app-context";
import { StatusDot } from "../../../components/StatusDot";

export const Route = createFileRoute("/review/issues/$key")({
  component: ReviewIssuePage,
  staticData: ROUTE_META.reviewIssue,
});

const truncate = (value: string, length: number) => {
  if (value.length <= length) return value;
  return `${value.slice(0, length).trim()}\u2026`;
};

function ReviewIssuePage() {
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
  } = useAppContext();

  const description = useMemo(() => {
    if (!issue?.description) return "";
    return issueView === "compact" ? truncate(issue.description, 420) : issue.description;
  }, [issue?.description, issueView]);

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
