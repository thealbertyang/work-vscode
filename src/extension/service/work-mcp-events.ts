import WebSocket from "ws";
import type { Disposable } from "vscode";
import { commands } from "vscode";
import { log } from "../providers/data/jira/logger";
import { VSCODE_COMMANDS } from "../../shared/contracts";
import { resolveWorkMcpEventEndpoints } from "./work-mcp-client";

const RECONNECT_MS = 5_000;

function normalizeWindowIndex(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Subscribe to Work MCP live events and open agent terminals on
 * `terminal:open` notifications.
 */
export class WorkMcpEventListener implements Disposable {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private endpointIndex = 0;
  private readonly endpoints = resolveWorkMcpEventEndpoints();

  constructor(private readonly opts: { onTerminalOpen?: () => void } = {}) {}

  start(): void {
    log(`[work-mcp-events] starting listener (${this.endpoints.length} endpoint${this.endpoints.length === 1 ? "" : "s"})`);
    this.connect();
  }

  private connect(): void {
    if (this.disposed || this.endpoints.length === 0) return;
    const endpoint = this.endpoints[this.endpointIndex] ?? this.endpoints[0];
    log(`[work-mcp-events] connecting to ${endpoint}`);

    let opened = false;
    const ws = new WebSocket(endpoint, {
      rejectUnauthorized: false,
    });
    this.ws = ws;

    ws.on("open", () => {
      opened = true;
      log(`[work-mcp-events] connected: ${endpoint}`);
    });

    ws.on("message", (raw) => {
      this.handleMessage(String(raw));
    });

    ws.on("error", (err) => {
      log(`[work-mcp-events] error (${endpoint}): ${err.message}`);
    });

    ws.on("close", (code, reasonBuf) => {
      const reason = reasonBuf.toString().trim();
      log(
        `[work-mcp-events] disconnected (${endpoint}) code=${code}${reason ? ` reason=${reason}` : ""}`,
      );

      if (this.ws === ws) this.ws = null;
      if (!opened && this.endpoints.length > 1) {
        this.endpointIndex = (this.endpointIndex + 1) % this.endpoints.length;
      }
      this.scheduleReconnect();
    });
  }

  private handleMessage(text: string): void {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      if (data.type !== "terminal:open") return;

      const session = typeof data.session === "string" ? data.session : "";
      const windowIndex = normalizeWindowIndex(data.windowIndex ?? data.window);
      log(`[work-mcp-events] terminal:open session=${session} w=${windowIndex ?? "-"}`);

      void commands.executeCommand(VSCODE_COMMANDS.OPEN_AGENT_TERMINAL, {
        tool: data.tool,
        role: data.role,
        story: data.story,
        session,
        windowIndex,
      }).then(undefined, (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        log(`[work-mcp-events] executeCommand error: ${message}`);
      });
      this.opts.onTerminalOpen?.();
    } catch {
      // ignore non-JSON / unrelated events
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, RECONNECT_MS);
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.terminate();
      this.ws = null;
    }
  }
}
