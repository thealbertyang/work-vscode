import { describe, expect, test } from "bun:test";
import type { DelegationIndexItem, WorkDelegationProjection } from "work-shared/domain/delegation";
import type { JiraIssue } from "../jira/jiraClient";
import type { LocalStory } from "../local/local-story-reader";
import {
  explorerAreaLabel,
  explorerSourceLabel,
  delegationStatusLabel,
  delegationSummaryLabel,
  mergeExplorerIssueRows,
} from "./delegation-rows";

function makeDelegationIndexItem(
  input: Partial<DelegationIndexItem> & Pick<DelegationIndexItem, "workId" | "storyKey">,
): DelegationIndexItem {
  return {
    workId: input.workId,
    storyKey: input.storyKey,
    primaryRuntime: input.primaryRuntime ?? "claude-native",
    updatedAt: input.updatedAt ?? "2026-03-13T00:00:00.000Z",
    totalTasks: input.totalTasks ?? 0,
    pendingTasks: input.pendingTasks ?? 0,
    inProgressTasks: input.inProgressTasks ?? 0,
    blockedTasks: input.blockedTasks ?? 0,
    failedTasks: input.failedTasks ?? 0,
    completedTasks: input.completedTasks ?? 0,
  };
}

describe("delegation rows", () => {
  test("prefers canonical delegation status while preserving Jira summary", () => {
    const projection: WorkDelegationProjection = {
      index: [
        makeDelegationIndexItem({
          workId: "DEV-1",
          storyKey: "DEV-1",
          totalTasks: 3,
          inProgressTasks: 1,
          pendingTasks: 2,
        }),
      ],
      byWorkId: {},
    };

    const jiraIssues: JiraIssue[] = [
      {
        key: "DEV-1",
        summary: "Ship the real thing",
        status: "To Do",
        issueType: "Story",
        project: "DEV",
        assignee: "A. Yang",
      },
    ];

    const rows = mergeExplorerIssueRows({ delegations: projection, jiraIssues });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.issue.summary).toBe("Ship the real thing");
    expect(rows[0]?.issue.status).toBe("In Progress");
    expect(rows[0]?.delegation?.pendingTasks).toBe(2);
    expect(rows[0]?.area).toBe("personal");
    expect(rows[0]?.source).toBe("jira");
  });

  test("keeps delegation-backed rows first and appends non-delegated jira and local rows", () => {
    const projection: WorkDelegationProjection = {
      index: [
        makeDelegationIndexItem({
          workId: "DEV-2",
          storyKey: "DEV-2",
          totalTasks: 1,
          blockedTasks: 1,
        }),
      ],
      byWorkId: {},
    };

    const jiraIssues: JiraIssue[] = [
      { key: "DEV-2", summary: "Delegated", status: "In Progress", issueType: "Story", project: "DEV", assignee: null },
      { key: "DEV-3", summary: "Jira only", status: "To Do", issueType: "Task", project: "DEV", assignee: null },
    ];
    const localStories: LocalStory[] = [
      {
        key: "DEV-4",
        projectKey: "DEV",
        status: "Review",
        workStatus: "review",
        queue: "review",
        assignee: null,
        summary: "Local only",
        updatedAt: null,
        syncedAt: null,
      },
    ];

    const rows = mergeExplorerIssueRows({ delegations: projection, jiraIssues, localStories });
    expect(rows.map((row) => row.issue.key)).toEqual(["DEV-2", "DEV-3", "DEV-4"]);
    expect(rows[0]?.delegation?.blockedTasks).toBe(1);
    expect(rows[2]?.issue.summary).toBe("Local only");
    expect(rows[2]?.source).toBe("local");
  });

  test("formats delegation status and summary labels from counts", () => {
    const active = makeDelegationIndexItem({
      workId: "DEV-5",
      storyKey: "DEV-5",
      totalTasks: 4,
      inProgressTasks: 1,
      pendingTasks: 2,
      completedTasks: 1,
    });
    const idle = makeDelegationIndexItem({
      workId: "DEV-6",
      storyKey: "DEV-6",
    });

    expect(delegationStatusLabel(active)).toBe("In Progress");
    expect(delegationSummaryLabel(active)).toBe("1 active · 2 pending · 1 done");
    expect(delegationSummaryLabel(idle)).toBe("No delegation tasks");
  });

  test("maps human-facing area and source labels", () => {
    expect(explorerAreaLabel("work")).toBe("Work");
    expect(explorerAreaLabel("personal")).toBe("Personal");
    expect(explorerSourceLabel("jira")).toBeNull();
    expect(explorerSourceLabel("local")).toBe("Local");
    expect(explorerSourceLabel("mixed")).toBe("Jira + Local");
    expect(explorerSourceLabel("derived")).toBeNull();
  });
});
