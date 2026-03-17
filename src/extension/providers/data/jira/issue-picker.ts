import type { JiraIssue } from "./jiraClient";
import type { ExplorerIssueRow } from "../work/delegation-rows";

export function collectPickerIssues(rows: readonly ExplorerIssueRow[]): JiraIssue[] {
  const seen = new Set<string>();
  const issues: JiraIssue[] = [];

  for (const row of rows) {
    const key = row.issue.key.trim().toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push(row.issue);
  }

  return issues;
}
