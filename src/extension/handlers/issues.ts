import { window } from "vscode";
import type { HandlerDependencies } from "./types";
import { openUrl } from "../service/integrated-browser";

type IssueDependencies = Pick<HandlerDependencies, "client">;

export const createIssueHandlers = ({ client }: IssueDependencies) => ({
  getIssue: async (key: string) => {
    if (!key) {
      return null;
    }
    return await client.getIssueDetails(key);
  },

  listIssues: async () => {
    return await client.searchMyOpenSprintIssues();
  },

  openIssueInBrowser: async (key: string) => {
    if (!key) {
      return;
    }
    const url = await client.getIssueUrl(key);
    if (!url) {
      window.showErrorMessage("Please login to open issues.");
      return;
    }
    await openUrl(url);
  },
});
