import { IPC_EVENTS, getActionByRpcMethod, type UiActionPayload } from "@shared/contracts";
import { getVsCodeApi } from "../contexts/jsonrpc-rx-context";

const sanitizeValue = (value: unknown): unknown => {
  if (typeof value === "function") {
    return "[Function]";
  }
  if (value instanceof Event) {
    return { type: value.type };
  }
  if (value instanceof Node) {
    return `[${value.nodeName}]`;
  }
  return value;
};

const sanitizeArgs = (args: unknown[]): unknown[] => args.map((arg) => sanitizeValue(arg));

export const logUiAction = (rpcMethod: string, args: unknown[], source = "webview") => {
  const action = getActionByRpcMethod(rpcMethod);
  const payload: UiActionPayload = {
    id: action?.id,
    rpc: rpcMethod,
    args: sanitizeArgs(args),
    route: window.location.hash || window.location.pathname,
    source,
  };
  const vscodeApi = getVsCodeApi();
  vscodeApi.postMessage({ kind: "event", name: IPC_EVENTS.UI_ACTION, payload });
};
