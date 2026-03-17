import { IPC_COMMANDS, IPC_EVENTS, type IpcEnvelope, type IpcHandler, type IpcMessage } from "@shared/contracts";

export type { IpcEnvelope, IpcHandler, IpcMessage };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const wrapRpcMessage = (payload: string): IpcEnvelope => ({ kind: "rpc", payload });

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

export const getIpcCommand = (message: unknown): IpcMessage | undefined => {
  if (!isRecord(message)) {
    return undefined;
  }
  if (message.kind === "command" && typeof message.name === "string") {
    return { name: message.name, payload: message.payload };
  }
  if (message.type === "work:navigate") {
    return { name: IPC_COMMANDS.NAVIGATE, payload: { route: message.route } };
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

const registerHandler = (
  map: Map<string, Set<IpcHandler>>,
  name: string,
  handler: IpcHandler,
): (() => void) => {
  const handlers = map.get(name) ?? new Set<IpcHandler>();
  handlers.add(handler);
  map.set(name, handlers);
  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      map.delete(name);
    }
  };
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

export const createWebviewIpc = (postMessage: (message: IpcEnvelope) => void) => {
  const eventHandlers = new Map<string, Set<IpcHandler>>();
  const commandHandlers = new Map<string, Set<IpcHandler>>();

  const handleWindowMessage = (event: MessageEvent) => {
    const command = getIpcCommand(event.data);
    if (command) {
      dispatch(commandHandlers, command.name, command.payload);
    }
    const evt = getIpcEvent(event.data);
    if (evt) {
      dispatch(eventHandlers, evt.name, evt.payload);
    }
  };

  window.addEventListener("message", handleWindowMessage);

  return {
    onCommand: (name: string, handler: IpcHandler) =>
      registerHandler(commandHandlers, name, handler),
    onEvent: (name: string, handler: IpcHandler) => registerHandler(eventHandlers, name, handler),
    sendEvent: (name: string, payload?: unknown) =>
      postMessage({ kind: "event", name, payload }),
    sendCommand: (name: string, payload?: unknown) =>
      postMessage({ kind: "command", name, payload }),
    dispose: () => window.removeEventListener("message", handleWindowMessage),
  };
};
