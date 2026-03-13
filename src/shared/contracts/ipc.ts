import type { RouteHint } from "./routes";
import type { DevState } from "./state";

export const IPC_EVENTS = {
  WEBVIEW_READY: "work.webview.ready",
  ROUTE_CHANGED: "work.route.changed",
  UI_ACTION: "work.ui.action",
  UI_EVENT: "work.ui.event",
} as const;

export const IPC_COMMANDS = {
  NAVIGATE: "work.route.navigate",
  REFRESH_WEBVIEW: "work.webview.refresh",
  STATE_UPDATED: "work.state.updated",
} as const;

export type IpcEventName = (typeof IPC_EVENTS)[keyof typeof IPC_EVENTS];
export type IpcCommandName = (typeof IPC_COMMANDS)[keyof typeof IPC_COMMANDS];

// Universal envelope used across transports (VS Code postMessage, WS bridge, etc).
export type IpcEnvelope =
  | { kind: "rpc"; payload: string }
  | { kind: "event"; name: string; payload?: unknown }
  | { kind: "command"; name: string; payload?: unknown };

export type IpcMessage = { name: string; payload?: unknown };
export type IpcHandler = (payload?: unknown) => void;

export type NavigatePayload = { route?: RouteHint | string };
export type RouteChangedPayload = { path: string; query?: Record<string, string> };
export type UiActionPayload = {
  id?: string;
  rpc?: string;
  args?: unknown[];
  route?: string;
  source?: string;
  detail?: unknown;
};
export type UiEventPayload = {
  id?: string;
  route?: string;
  detail?: unknown;
};

export type StateUpdatedPayload = {
  dev?: Partial<DevState>;
};

export const IPC_COMMAND_PAYLOAD_SCHEMAS = {
  [IPC_COMMANDS.NAVIGATE]: "NavigatePayload",
  [IPC_COMMANDS.REFRESH_WEBVIEW]: "undefined",
  [IPC_COMMANDS.STATE_UPDATED]: "StateUpdatedPayload",
} as const satisfies Record<IpcCommandName, string>;

export const IPC_EVENT_PAYLOAD_SCHEMAS = {
  [IPC_EVENTS.WEBVIEW_READY]: "undefined",
  [IPC_EVENTS.ROUTE_CHANGED]: "RouteChangedPayload",
  [IPC_EVENTS.UI_ACTION]: "UiActionPayload",
  [IPC_EVENTS.UI_EVENT]: "UiEventPayload",
} as const satisfies Record<IpcEventName, string>;
