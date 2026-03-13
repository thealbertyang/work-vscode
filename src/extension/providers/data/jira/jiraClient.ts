import * as http from "http";
import * as https from "https";
import * as vscode from "vscode";
import { getApiTokenConfig } from "./jiraConfig";
import type { StorageService } from "../../../service/storage-service";
import type { PermissionPolicy } from "../../../policy/permission-policy";
import type { Identity } from "../../../policy/identities";
import type { Scope } from "../../../policy/scopes";

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  issueType: string;
  project: string;
  assignee?: string | null;
}

export interface JiraIssueDetails extends JiraIssue {
  description?: string;
  priority?: string;
  assignee?: string;
  reporter?: string;
  created?: string;
  updated?: string;
  url?: string;
}

interface ApiTokenAuth {
  type: "apiToken";
  baseUrl: string;
  email: string;
  apiToken: string;
}

const STORAGE_KEYS = {
  baseUrl: "work.baseUrl",
  email: "work.email",
  apiToken: "work.apiToken",
} as const;

export class JiraClient {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly storage: StorageService,
    private readonly policy: PermissionPolicy,
    private readonly identity: Identity,
  ) {}

  /**
   * Gate any write operation through the policy engine.
   * Throws PolicyViolationError and shows a VS Code warning if denied.
   *
   * ─── ALL JIRA WRITES ARE BLOCKED BY DEFAULT ───────────────────────────────
   * Unlock per-scope via work.policy.allow* settings when ready.
   */
  checkWrite(scope: Scope): void {
    this.policy.assertAllowed(this.identity, scope);
  }

  async hasStoredApiToken(): Promise<boolean> {
    const token = await this.storage.getSecret(STORAGE_KEYS.apiToken);
    return Boolean(token);
  }

  async isAuthenticated(): Promise<boolean> {
    return (await this.getAuth()) !== null;
  }

  async getApiTokenDefaults(): Promise<{ baseUrl: string; email: string }> {
    const envConfig = getApiTokenConfig();
    const baseUrl =
      envConfig.baseUrl || this.storage.getGlobalState<string>(STORAGE_KEYS.baseUrl) || "";
    const email =
      envConfig.email || this.storage.getGlobalState<string>(STORAGE_KEYS.email) || "";
    return { baseUrl, email };
  }

  async saveApiTokenAuth(baseUrlInput: string, email: string, apiToken: string): Promise<void> {
    const baseUrl = normalizeBaseUrl(baseUrlInput);
    await this.storage.setGlobalState(STORAGE_KEYS.baseUrl, baseUrl);
    await this.storage.setGlobalState(STORAGE_KEYS.email, email.trim());
    await this.storage.storeSecret(STORAGE_KEYS.apiToken, apiToken.trim());
  }

  async updateApiTokenDefaults(baseUrlInput?: string, email?: string): Promise<void> {
    if (baseUrlInput) {
      const baseUrl = normalizeBaseUrl(baseUrlInput);
      await this.storage.setGlobalState(STORAGE_KEYS.baseUrl, baseUrl);
    }
    if (email) {
      await this.storage.setGlobalState(STORAGE_KEYS.email, email.trim());
    }
  }

  async clearAuth(): Promise<void> {
    await this.storage.deleteSecret(STORAGE_KEYS.apiToken);
  }

  async getIssueUrl(key: string): Promise<string | undefined> {
    const auth = await this.getAuth();
    if (!auth) {
      return undefined;
    }
    const baseUrl = auth.baseUrl;
    return `${baseUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(key)}`;
  }

  async searchMyOpenSprintIssues(): Promise<JiraIssue[]> {
    const auth = await this.getAuth();
    if (!auth) {
      const envConfig = getApiTokenConfig();
      if (envConfig.baseUrl && envConfig.email && envConfig.apiToken) {
        await this.saveApiTokenAuth(envConfig.baseUrl, envConfig.email, envConfig.apiToken);
        if (envConfig.jql) {
          await this.storage.updateSetting(
            "jql",
            envConfig.jql,
            vscode.ConfigurationTarget.Workspace,
          );
        }
        return this.searchMyOpenSprintIssues();
      }
      return [];
    }

    const envConfig = getApiTokenConfig();
    const jql = (envConfig.jql || this.storage.getSetting<string>("jql") || "").trim();
    const maxResults = Math.max(
      1,
      Math.min(100, this.storage.getSetting<number>("maxResults") ?? 50),
    );

    const fields = ["summary", "status", "issuetype", "project", "assignee"].join(",");
    const query = new URLSearchParams({
      jql: jql || "assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC",
      maxResults: String(maxResults),
      fields,
    });

    const url = `${auth.baseUrl.replace(/\/$/, "")}/rest/api/3/search/jql?${query.toString()}`;
    const basic = Buffer.from(`${auth.email}:${auth.apiToken}`).toString("base64");
    const headers = { Authorization: `Basic ${basic}` };

    const response = await requestJson<{ issues: Array<any> }>(url, {
      method: "GET",
      headers,
    });

    return response.issues.map((issue) => ({
      key: issue.key,
      summary: issue.fields?.summary || "",
      status: issue.fields?.status?.name || "Unknown",
      issueType: issue.fields?.issuetype?.name || "Issue",
      project: issue.fields?.project?.key || "",
      assignee: issue.fields?.assignee?.displayName ?? null,
    }));
  }

  async getIssueDetails(key: string): Promise<JiraIssueDetails | null> {
    const auth = await this.getAuth();
    if (!auth) {
      return null;
    }

    const fields = [
      "summary",
      "status",
      "issuetype",
      "project",
      "priority",
      "assignee",
      "reporter",
      "created",
      "updated",
      "description",
    ].join(",");

    const query = new URLSearchParams({ fields });
    const url = `${auth.baseUrl.replace(/\/$/, "")}/rest/api/3/issue/${encodeURIComponent(
      key,
    )}?${query.toString()}`;
    const basic = Buffer.from(`${auth.email}:${auth.apiToken}`).toString("base64");
    const headers = { Authorization: `Basic ${basic}` };

    const issue = await requestJson<any>(url, { method: "GET", headers });
    const issueFields = issue.fields ?? {};

    return {
      key: issue.key || key,
      summary: issueFields.summary || "",
      status: issueFields.status?.name || "Unknown",
      issueType: issueFields.issuetype?.name || "Issue",
      project: issueFields.project?.key || "",
      priority: issueFields.priority?.name,
      assignee: issueFields.assignee?.displayName,
      reporter: issueFields.reporter?.displayName,
      created: issueFields.created,
      updated: issueFields.updated,
      description: formatDescription(issueFields.description),
      url: await this.getIssueUrl(key),
    };
  }

  private async getAuth(): Promise<ApiTokenAuth | null> {
    const baseUrl = this.storage.getGlobalState<string>(STORAGE_KEYS.baseUrl) ?? "";
    const email = this.storage.getGlobalState<string>(STORAGE_KEYS.email) ?? "";
    const apiToken = await this.storage.getSecret(STORAGE_KEYS.apiToken);
    if (!baseUrl || !email || !apiToken) {
      return null;
    }
    return { type: "apiToken", baseUrl, email, apiToken };
  }
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/$/, "");
  if (!trimmed) {
    return trimmed;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function formatDescription(description: any): string | undefined {
  if (!description) {
    return undefined;
  }
  if (typeof description === "string") {
    return description;
  }
  if (typeof description === "object" && Array.isArray(description.content)) {
    const lines: string[] = [];
    const visit = (node: any) => {
      if (!node) {
        return;
      }
      if (node.type === "text" && typeof node.text === "string") {
        lines.push(node.text);
        return;
      }
      if (Array.isArray(node.content)) {
        node.content.forEach(visit);
        if (node.type === "paragraph") {
          lines.push("\n");
        }
      }
    };
    visit(description);
    const raw = lines.join("").replace(/\n{3,}/g, "\n\n").trim();
    return raw || undefined;
  }
  return undefined;
}

async function requestJson<T>(
  url: string,
  options: { method?: string; headers?: Record<string, string>; body?: any },
): Promise<T> {
  const method = options.method || "GET";
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...options.headers,
  };

  const body = options.body ? JSON.stringify(options.body) : undefined;
  if (body) {
    headers["Content-Type"] = "application/json";
    headers["Content-Length"] = Buffer.byteLength(body).toString();
  }

  const urlObj = new URL(url);
  const transport = urlObj.protocol === "http:" ? http : https;

  return new Promise<T>((resolve, reject) => {
    const req = transport.request(
      {
        method,
        hostname: urlObj.hostname,
        path: `${urlObj.pathname}${urlObj.search}`,
        port: urlObj.port,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const status = res.statusCode || 0;
          if (status >= 200 && status < 300) {
            if (!data) {
              resolve({} as T);
              return;
            }
            try {
              resolve(JSON.parse(data) as T);
            } catch {
              reject(new Error("Failed to parse JSON response."));
            }
            return;
          }

          const message = data.length > 500 ? `${data.slice(0, 500)}...` : data;
          reject(new Error(`Request failed (${status}): ${message}`));
        });
      },
    );

    req.on("error", (err) => reject(err));

    if (body) {
      req.write(body);
    }
    req.end();
  });
}
