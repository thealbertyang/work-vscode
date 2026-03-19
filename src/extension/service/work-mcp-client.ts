import https from "node:https";
import axios from "axios";
import type {
  WorkDelegationEntry,
  WorkDelegationProjection,
} from "work-shared/domain/delegation";
import type { WorkAppSummary } from "work-shared/domain/app";
import {
  resolveWorkMcpEventEndpoints,
  resolveWorkMcpOrigins,
} from "work-shared/contracts/origins";

export type WorkMcpAgentTool = "claude" | "codex";
export type WorkMcpSpawnAction = "new" | "continue" | "resume";

export type WorkMcpSpawnParams = {
  tool?: WorkMcpAgentTool;
  action?: WorkMcpSpawnAction;
  story?: string;
  role?: string;
  prompt?: string;
};

export type WorkMcpSpawnResult = {
  ok: boolean;
  tool: string;
  action: string;
  story: string;
  role: string;
  tmuxSession: string;
  tmuxWindow: string;
  tmuxWindowIndex: string;
  createdSession: boolean;
};

export interface WorkSnapshot {
  namespace: "work.state";
  schemaVersion: number;
  path: string;
  version: number;
  checksum: string;
  updatedAt: string | null;
  state: {
    graph: unknown;
    delegations: WorkDelegationProjection;
    lastSync: unknown;
    graphAlertState: Record<string, unknown> | null;
    rulebook: unknown;
  };
}

const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });
export { resolveWorkMcpEventEndpoints, resolveWorkMcpOrigins } from "work-shared/contracts/origins";

export async function findReachableWorkMcpOrigin(
  opts?: { timeoutMs?: number },
): Promise<string | null> {
  const timeout = opts?.timeoutMs ?? 750;

  for (const origin of resolveWorkMcpOrigins()) {
    try {
      const response = await axios.get(
        `${origin}/api/app`,
        {
          timeout,
          httpsAgent: INSECURE_HTTPS_AGENT,
          validateStatus: () => true,
        },
      );
      if (response.status >= 200 && response.status < 300) {
        return origin;
      }
    } catch {
      // Try the next configured origin.
    }
  }

  return null;
}

function formatRequestError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const responseMessage = typeof error.response?.data?.error === "string"
      ? error.response.data.error
      : undefined;
    return responseMessage
      ?? error.message
      ?? `HTTP ${error.response?.status ?? "error"}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function responseErrorMessage(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    return typeof message === "string" ? message : null;
  }
  return null;
}

async function getJsonViaOrigins<T>(
  path: string,
  opts?: { timeoutMs?: number },
): Promise<T> {
  let lastError: string | null = null;
  const timeout = opts?.timeoutMs ?? 1_500;

  for (const origin of resolveWorkMcpOrigins()) {
    try {
      const response = await axios.get<T | { error?: string }>(
        `${origin}${path}`,
        {
          timeout,
          httpsAgent: INSECURE_HTTPS_AGENT,
          validateStatus: () => true,
        },
      );

      if (response.status >= 200 && response.status < 300) {
        return response.data as T;
      }

      lastError = typeof responseErrorMessage(response.data) === "string"
        ? `${origin}: ${responseErrorMessage(response.data)}`
        : `${origin}: HTTP ${response.status}`;
    } catch (error) {
      lastError = `${origin}: ${formatRequestError(error)}`;
    }
  }

  throw new Error(lastError ?? `Work MCP request failed for ${path}`);
}

export async function readWorkMcpResource<T>(
  uri: string,
  opts?: { timeoutMs?: number },
): Promise<T> {
  return await getJsonViaOrigins<T>(`/api/resources/${encodeURIComponent(uri)}`, opts);
}

export async function fetchWorkDelegationProjection(
  opts?: { timeoutMs?: number },
): Promise<WorkDelegationProjection> {
  return await readWorkMcpResource<WorkDelegationProjection>("work://delegations", opts);
}

export async function fetchWorkDelegationEntry(
  workId: string,
  opts?: { timeoutMs?: number },
): Promise<WorkDelegationEntry> {
  return await readWorkMcpResource<WorkDelegationEntry>(`work://delegations/${encodeURIComponent(workId)}`, opts);
}

export async function fetchWorkSnapshot(
  opts?: { timeoutMs?: number },
): Promise<WorkSnapshot> {
  return await readWorkMcpResource<WorkSnapshot>("work://state", opts);
}

export async function fetchWorkAppSummary(
  opts?: { timeoutMs?: number },
): Promise<WorkAppSummary> {
  return await getJsonViaOrigins<WorkAppSummary>("/api/app", opts);
}

export async function spawnAgentViaWorkMcp(
  params: WorkMcpSpawnParams,
): Promise<WorkMcpSpawnResult> {
  const requestBody = {
    tool: params.tool ?? "claude",
    action: params.action ?? "new",
    story: params.story ?? "work",
    role: params.role ?? "worker",
    ...(typeof params.prompt === "string" && params.prompt.trim().length > 0
      ? { prompt: params.prompt.trim() }
      : {}),
  };

  let lastError: string | null = null;

  for (const origin of resolveWorkMcpOrigins()) {
    try {
      const response = await axios.post<WorkMcpSpawnResult | { error?: string }>(
        `${origin}/api/agents/spawn`,
        requestBody,
        {
          timeout: 5000,
          httpsAgent: INSECURE_HTTPS_AGENT,
          validateStatus: () => true,
        },
      );

      if (response.status >= 200 && response.status < 300 && response.data && "ok" in response.data) {
        return response.data;
      }

      lastError = typeof responseErrorMessage(response.data) === "string"
        ? `${origin}: ${responseErrorMessage(response.data)}`
        : `${origin}: HTTP ${response.status}`;
    } catch (error) {
      lastError = `${origin}: ${formatRequestError(error)}`;
    }
  }

  throw new Error(lastError ?? "Work MCP agent spawn failed");
}
