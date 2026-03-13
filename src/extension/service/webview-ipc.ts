import { Disposable, Webview } from "vscode";
import { IPC_COMMANDS, IPC_EVENTS, type IpcEnvelope, type IpcHandler, type IpcMessage } from "../../shared/contracts";

export type { IpcEnvelope, IpcHandler, IpcMessage };
export type IpcLogFn = (
  direction: "send" | "recv",
  kind: "event" | "command",
  name: string,
  payload?: unknown,
) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const getRpcPayload = (message: unknown): string | undefined => {
  if (typeof message === "string") {
    return message;
  }
  if (!isRecord(message)) {
    return undefined;
  }
  if (message.kind === "rpc") {
    if (typeof message.payload === "string") {
      return message.payload;
    }
    if (message.payload && typeof message.payload === "object") {
      try {
        return JSON.stringify(message.payload);
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

export const getIpcEvent = (message: unknown): IpcMessage | undefined => {
  if (!isRecord(message)) {
    return undefined;
  }
  if (message.kind === "event" && typeof message.name === "string") {
    return { name: message.name, payload: message.payload };
  }
  if (message.type === "work:webview-ready") {
    return { name: IPC_EVENTS.WEBVIEW_READY };
  }
  return undefined;
};

export const getIpcCommand = (message: unknown): IpcMessage | undefined => {
  if (!isRecord(message)) {
    return undefined;
  }
  if (message.kind === "command" && typeof message.name === "string") {
    return { name: message.name, payload: message.payload };
  }
  if (message.command === "work:refreshWebview") {
    return { name: IPC_COMMANDS.REFRESH_WEBVIEW };
  }
  return undefined;
};

const registerHandler = (
  map: Map<string, Set<IpcHandler>>,
  name: string,
  handler: IpcHandler,
): Disposable => {
  const handlers = map.get(name) ?? new Set<IpcHandler>();
  handlers.add(handler);
  map.set(name, handlers);
  return new Disposable(() => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      map.delete(name);
    }
  });
};

const dispatch = (map: Map<string, Set<IpcHandler>>, name: string, payload?: unknown) => {
  const handlers = map.get(name);
  if (!handlers) {
    return;
  }
  for (const handler of handlers) {
    handler(payload);
  }
};

export class WebviewIpcHost {
  private readonly eventHandlers = new Map<string, Set<IpcHandler>>();
  private readonly commandHandlers = new Map<string, Set<IpcHandler>>();
  private readonly disposables: Disposable[] = [];

  constructor(private readonly webview: Webview, private readonly logger?: IpcLogFn) {}

  listen(): Disposable {
    const disposable = this.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    this.disposables.push(disposable);
    return disposable;
  }

  dispose() {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
    this.eventHandlers.clear();
    this.commandHandlers.clear();
  }

  onEvent(name: string, handler: IpcHandler): Disposable {
    const disposable = registerHandler(this.eventHandlers, name, handler);
    this.disposables.push(disposable);
    return disposable;
  }

  onCommand(name: string, handler: IpcHandler): Disposable {
    const disposable = registerHandler(this.commandHandlers, name, handler);
    this.disposables.push(disposable);
    return disposable;
  }

  sendEvent(name: string, payload?: unknown) {
    this.logger?.("send", "event", name, payload);
    void this.webview.postMessage({ kind: "event", name, payload });
  }

  sendCommand(name: string, payload?: unknown) {
    this.logger?.("send", "command", name, payload);
    void this.webview.postMessage({ kind: "command", name, payload });
  }

  private handleMessage(message: unknown) {
    const command = getIpcCommand(message);
    if (command) {
      this.logger?.("recv", "command", command.name, command.payload);
      dispatch(this.commandHandlers, command.name, command.payload);
    }
    const event = getIpcEvent(message);
    if (event) {
      this.logger?.("recv", "event", event.name, event.payload);
      dispatch(this.eventHandlers, event.name, event.payload);
    }
  }
}
