import { describe, expect, it } from "bun:test";
import { collectPickerIssues } from "./issue-picker";
import type { ExplorerIssueRow } from "../work/delegation-rows";

describe("collectPickerIssues", () => {
  it("dedupes issues by key and preserves row order", () => {
    const rows = [
      {
        issue: { key: "CSO-7040", summary: "A", status: "In Progress", issueType: "story", project: "CSO", assignee: null },
        delegation: null,
        area: "work",
        source: "jira",
      },
      {
        issue: { key: "DEV-0001", summary: "B", status: "To Do", issueType: "story", project: "DEV", assignee: null },
        delegation: null,
        area: "personal",
        source: "local",
      },
      {
        issue: { key: "cso-7040", summary: "C", status: "Review", issueType: "story", project: "CSO", assignee: null },
        delegation: null,
        area: "work",
        source: "mixed",
      },
    ] satisfies ExplorerIssueRow[];

    expect(collectPickerIssues(rows).map((issue) => issue.key)).toEqual([
      "CSO-7040",
      "DEV-0001",
    ]);
  });
});
