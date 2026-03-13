import { WebSocketServer, WebSocket } from "ws";
import { JsonrpcServer, expose, type HandlerConfig } from "@jsonrpc-rx/server";
import type { Disposable } from "vscode";
import type { IncomingMessage } from "http";
import { log } from "../providers/data/jira/logger";
import { DEFAULT_WS_BRIDGE_HOST, DEFAULT_WS_BRIDGE_PORT } from "../constants";
import { logIpcMessage } from "./ui-logger";
import { IPC_EVENTS, type IpcEnvelope } from "../../shared/contracts";

export type WebviewWsBridgeOptions = {
  host?: string;
  port?: number;
  token?: string;
  allowedOrigins?: string[];
};

export class WebviewWsBridge implements Disposable {
  private wss?: WebSocketServer;
  private seq = 0;
  private readonly lastCommands = new Map<string, { seq: number; envelope: IpcEnvelope }>();
  private readonly clientSeq = new WeakMap<WebSocket, Map<string, number>>();
  private readonly readyClients = new WeakSet<WebSocket>();

  constructor(
    private readonly handlers: HandlerConfig,
    private readonly options: WebviewWsBridgeOptions = {},
  ) {}

  start(): void {
    const host = (this.options.host ?? DEFAULT_WS_BRIDGE_HOST).trim() || DEFAULT_WS_BRIDGE_HOST;
    const port = this.options.port ?? DEFAULT_WS_BRIDGE_PORT;
    this.wss = new WebSocketServer({ port, host });
    log(`[ws-bridge] listening on ws://${host}:${port}`);

    this.wss.on("connection", (ws, req) => {
      const auth = this.authorize(req);
      if (!auth.ok) {
        log(`[ws-bridge] rejected client: ${auth.reason ?? "unauthorized"}`);
        ws.close(1008, "Unauthorized");
        return;
      }

      log("[ws-bridge] client connected");
      this.clientSeq.set(ws, new Map());

      let rpcHandler: ((message: string) => void) | null = null;

      const msgSender = (message: string) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ kind: "rpc", payload: message }));
        }
      };
      const msgReceiver = (handler: (message: string) => void) => {
        rpcHandler = handler;
      };

      const server = new JsonrpcServer(msgSender, msgReceiver);
      expose(server, this.handlers);

      ws.on("message", (raw) => {
        try {
          const envelope = JSON.parse(raw.toString()) as IpcEnvelope;
          if (envelope.kind === "rpc" && typeof envelope.payload === "string") {
            rpcHandler?.(envelope.payload);
            return;
          }
          if (envelope.kind === "event" && typeof envelope.name === "string") {
            logIpcMessage("recv", "event", envelope.name, envelope.payload, "transport=ws-bridge");
            if (envelope.name === IPC_EVENTS.WEBVIEW_READY) {
              this.readyClients.add(ws);
              this.flushClient(ws);
            }
            return;
          }
          if (envelope.kind === "command" && typeof envelope.name === "string") {
            logIpcMessage("recv", "command", envelope.name, envelope.payload, "transport=ws-bridge");
          }
        } catch { /* ignore */ }
      });

      ws.on("close", () => {
        this.clientSeq.delete(ws);
        this.readyClients.delete(ws);
        log("[ws-bridge] client disconnected");
      });
    });

    this.wss.on("error", (err) => {
      log(`[ws-bridge] error: ${err.message}`);
    });
  }

  sendEvent(name: string, payload?: unknown) {
    this.broadcast({ kind: "event", name, payload });
    logIpcMessage("send", "event", name, payload, "transport=ws-bridge");
  }

  sendCommand(name: string, payload?: unknown) {
    const envelope: IpcEnvelope = { kind: "command", name, payload };
    const seq = ++this.seq;
    this.lastCommands.set(name, { seq, envelope });
    this.broadcast(envelope, { name, seq });
    logIpcMessage("send", "command", name, payload, "transport=ws-bridge");
  }

  private broadcast(message: IpcEnvelope, meta?: { name: string; seq: number }) {
    if (!this.wss) {
      return;
    }
    const serialized = JSON.stringify(message);
    for (const client of this.wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        // Treat WEBVIEW_READY as a lightweight handshake. Commands may arrive before the
        // browser UI has registered its window message handler; only deliver commands
        // after a client declares readiness, and use catch-up on ready.
        if (message.kind === "command" && !this.readyClients.has(client)) {
          continue;
        }
        client.send(serialized);
        if (message.kind === "command" && meta) {
          const sent = this.clientSeq.get(client);
          sent?.set(meta.name, meta.seq);
        }
      }
    }
  }

  private flushClient(ws: WebSocket) {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const sent = this.clientSeq.get(ws);
    if (!sent) {
      return;
    }
    for (const [name, last] of this.lastCommands.entries()) {
      const lastSeen = sent.get(name) ?? 0;
      if (lastSeen >= last.seq) {
        continue;
      }
      try {
        ws.send(JSON.stringify(last.envelope));
        sent.set(name, last.seq);
      } catch {
        // ignore send failures for transient clients
      }
    }
  }

  private authorize(req: IncomingMessage): { ok: boolean; reason?: string } {
    const tokenRequired = (this.options.token ?? "").trim();
    const allowedOrigins = (this.options.allowedOrigins ?? [])
      .map((origin) => origin.trim())
      .filter(Boolean);

    if (!tokenRequired && allowedOrigins.length === 0) {
      return { ok: true };
    }

    const origin = req.headers.origin;
    // VS Code webviews use an opaque origin like vscode-webview://{uuid}. This origin
    // is controlled by VS Code and cannot be spoofed from external pages — treat as trusted
    // without requiring a token. This enables unified WS transport from VS Code webviews.
    if (typeof origin === "string" && origin.startsWith("vscode-webview://")) {
      return { ok: true };
    }
    if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
      return { ok: false, reason: `origin_not_allowed (${origin})` };
    }

    if (tokenRequired) {
      const tokenOk = this.matchesToken(req, tokenRequired);
      if (!tokenOk.ok) return tokenOk;
    }

    return { ok: true };
  }

  private matchesToken(req: IncomingMessage, tokenRequired: string): { ok: boolean; reason?: string } {
    const rawUrl = req.url ?? "/";
    const url = new URL(rawUrl, "http://127.0.0.1");
    const token = url.searchParams.get("token") ?? "";
    if (token !== tokenRequired) {
      return { ok: false, reason: "invalid_token" };
    }
    return { ok: true };
  }

  dispose(): void {
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.close();
      }
      this.wss.close();
      this.wss = undefined;
      log("[ws-bridge] stopped");
    }
  }
}
