import https from "node:https";
import axios from "axios";

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

const DEFAULT_ORIGINS = [
  "https://127.0.0.1:4500",
  "http://127.0.0.1:4500",
  "https://localhost:4500",
  "http://localhost:4500",
  "https://127.0.0.1:3001",
  "http://127.0.0.1:3001",
] as const;

const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function wsToHttp(value: string): string {
  return normalizeBaseUrl(value)
    .replace(/^wss:/, "https:")
    .replace(/^ws:/, "http:")
    .replace(/\/ws(?:\?.*)?$/, "");
}

function httpToWs(value: string): string {
  return normalizeBaseUrl(value)
    .replace(/^https:/, "wss:")
    .replace(/^http:/, "ws:");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function resolveWorkMcpOrigins(): string[] {
  const configuredOrigin = process.env.WORK_MCP_ORIGIN?.trim();
  if (configuredOrigin) {
    return [normalizeBaseUrl(configuredOrigin)];
  }

  const configuredWs = process.env.WORK_MCP_WS_URL?.trim();
  if (configuredWs) {
    return [wsToHttp(configuredWs)];
  }

  return [...DEFAULT_ORIGINS];
}

export function resolveWorkMcpEventEndpoints(): string[] {
  const configuredWs = process.env.WORK_MCP_WS_URL?.trim();
  if (configuredWs) {
    return [normalizeBaseUrl(configuredWs)];
  }

  return unique(
    resolveWorkMcpOrigins().map((origin) => `${httpToWs(origin)}/ws?topic=events`),
  );
}

function formatSpawnError(error: unknown): string {
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

      lastError = typeof response.data?.error === "string"
        ? `${origin}: ${response.data.error}`
        : `${origin}: HTTP ${response.status}`;
    } catch (error) {
      lastError = `${origin}: ${formatSpawnError(error)}`;
    }
  }

  throw new Error(lastError ?? "Work MCP agent spawn failed");
}
