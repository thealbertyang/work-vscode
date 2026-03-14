import type { DelegationIndexItem, WorkDelegationProjection } from "work-shared/domain/delegation";
import type { JiraIssue } from "../jira/jiraClient";
import type { LocalStory } from "../local/local-story-reader";

export interface ExplorerIssueRow {
  issue: JiraIssue;
  delegation: DelegationIndexItem | null;
  area: "work" | "personal";
  source: "jira" | "local" | "mixed" | "derived";
}

function normalizeKey(value: string): string {
  return value.trim().toUpperCase();
}

function keyProject(key: string): string {
  return key.split("-")[0] ?? "";
}

function deriveAreaFromProjectKey(projectKeyRaw: string): "work" | "personal" {
  const projectKey = normalizeKey(projectKeyRaw);
  switch (projectKey) {
    case "CSO":
    case "PROD":
      return "work";
    case "DEV":
    default:
      return "personal";
  }
}

function toLocalIssue(story: LocalStory): JiraIssue {
  return {
    key: normalizeKey(story.key),
    summary: story.summary,
    status: story.status,
    issueType: "story",
    project: story.projectKey || keyProject(story.key),
    assignee: story.assignee ?? null,
  };
}

export function delegationStatusLabel(item: DelegationIndexItem): string {
  if (item.failedTasks > 0) return "Failed";
  if (item.blockedTasks > 0) return "Blocked";
  if (item.inProgressTasks > 0) return "In Progress";
  if (item.pendingTasks > 0) return "Pending";
  if (item.totalTasks > 0 && item.completedTasks === item.totalTasks) return "Done";
  return "Active";
}

export function delegationSummaryLabel(item: DelegationIndexItem): string {
  const parts: string[] = [];
  if (item.inProgressTasks > 0) parts.push(`${item.inProgressTasks} active`);
  if (item.pendingTasks > 0) parts.push(`${item.pendingTasks} pending`);
  if (item.blockedTasks > 0) parts.push(`${item.blockedTasks} blocked`);
  if (item.failedTasks > 0) parts.push(`${item.failedTasks} failed`);
  if (item.completedTasks > 0) parts.push(`${item.completedTasks} done`);
  return parts.length > 0 ? parts.join(" · ") : "No delegation tasks";
}

export function explorerAreaLabel(area: "work" | "personal"): string {
  return area === "work" ? "Work" : "Personal";
}

export function explorerSourceLabel(source: ExplorerIssueRow["source"]): string | null {
  switch (source) {
    case "local":
      return "Local";
    case "mixed":
      return "Jira + Local";
    case "derived":
      return null;
    case "jira":
    default:
      return null;
  }
}

function toDelegationIssue(
  item: DelegationIndexItem,
  jiraIssue?: JiraIssue | null,
  localStory?: LocalStory | null,
): JiraIssue {
  const key = normalizeKey(item.storyKey || item.workId);
  return {
    key,
    summary: jiraIssue?.summary || localStory?.summary || key,
    status: delegationStatusLabel(item),
    issueType: jiraIssue?.issueType || "story",
    project: jiraIssue?.project || localStory?.projectKey || keyProject(key),
    assignee: jiraIssue?.assignee ?? localStory?.assignee ?? null,
  };
}

export function mergeExplorerIssueRows(input: {
  delegations?: WorkDelegationProjection | null;
  jiraIssues?: JiraIssue[];
  localStories?: LocalStory[];
}): ExplorerIssueRow[] {
  const jiraIssues = input.jiraIssues ?? [];
  const localStories = input.localStories ?? [];

  const jiraByKey = new Map(jiraIssues.map((issue) => [normalizeKey(issue.key), issue]));
  const localByKey = new Map(localStories.map((story) => [normalizeKey(story.key), story]));
  const rows: ExplorerIssueRow[] = [];
  const seen = new Set<string>();

  for (const item of input.delegations?.index ?? []) {
    const key = normalizeKey(item.storyKey || item.workId);
    const jiraIssue = jiraByKey.get(key);
    const localStory = localByKey.get(key);
    rows.push({
      issue: toDelegationIssue(item, jiraIssue, localStory),
      delegation: item,
      area: deriveAreaFromProjectKey(jiraIssue?.project || localStory?.projectKey || keyProject(key)),
      source: jiraIssue && localStory
        ? "mixed"
        : jiraIssue
          ? "jira"
          : localStory
            ? "local"
            : "derived",
    });
    seen.add(key);
  }

  for (const issue of jiraIssues) {
    const key = normalizeKey(issue.key);
    if (seen.has(key)) continue;
    rows.push({
      issue,
      delegation: null,
      area: deriveAreaFromProjectKey(issue.project || keyProject(key)),
      source: "jira",
    });
    seen.add(key);
  }

  for (const story of localStories) {
    const key = normalizeKey(story.key);
    if (seen.has(key)) continue;
    rows.push({
      issue: toLocalIssue(story),
      delegation: null,
      area: deriveAreaFromProjectKey(story.projectKey || keyProject(key)),
      source: "local",
    });
    seen.add(key);
  }

  return rows;
}
