import {
  IPC_EVENTS,
  formatLogPayload,
  getActionByRpcMethod,
  safeJsonParse,
  type UiActionPayload,
} from "../../shared/contracts";
import { log } from "../providers/data/jira/logger";

type Direction = "send" | "recv";
type IpcKind = "event" | "command";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const formatContext = (context?: string) => (context ? ` ${context}` : "");

const formatRpcMeta = (payload: unknown) => {
  if (!isRecord(payload)) {
    return "";
  }
  const parts: string[] = [];
  if (typeof payload.method === "string") {
    const action = getActionByRpcMethod(payload.method);
    parts.push(`method=${payload.method}`);
    if (action?.id) {
      parts.push(`action=${action.id}`);
    }
  }
  if ("id" in payload) {
    parts.push(`id=${String(payload.id)}`);
  }
  if ("result" in payload) {
    parts.push("result");
  }
  if ("error" in payload) {
    parts.push("error");
  }
  return parts.length ? ` ${parts.join(" ")}` : "";
};

export const logRpcMessage = (
  direction: Direction,
  payload: string,
  context?: string,
) => {
  const parsed = safeJsonParse(payload);
  const meta = formatRpcMeta(parsed);
  const formatted = formatLogPayload(parsed);
  log(`[ui:rpc:${direction}]${formatContext(context)}${meta} payload=${formatted}`);
};

export const logIpcMessage = (
  direction: Direction,
  kind: IpcKind,
  name: string,
  payload: unknown,
  context?: string,
) => {
  const maybeAction =
    name === IPC_EVENTS.UI_ACTION && isRecord(payload) ? (payload as UiActionPayload) : undefined;
  const formatted = formatLogPayload(payload);
  const actionMeta = maybeAction?.id ? ` action=${maybeAction.id}` : "";
  log(
    `[ui:ipc:${direction}:${kind}]${formatContext(context)} name=${name}${actionMeta} payload=${formatted}`,
  );
};
