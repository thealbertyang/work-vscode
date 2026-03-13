---
paths:
  - "src/shared/contracts/ipc.ts"
  - "src/extension/service/webview-ipc.ts"
  - "src/extension/service/webview-ws-bridge.ts"
  - "src/webview/src/ipc/**"
---

- `IpcEnvelope.kind` has exactly three variants: `"rpc"` (JSON-RPC 2.0 request/response via @jsonrpc-rx, payload is a raw JSON string), `"event"` (fire-and-forget signal from webview to extension), `"command"` (imperative directive from extension to webview). Never conflate these.
- All event names must be registered in `IPC_EVENTS` and all command names in `IPC_COMMANDS`. Never use inline string literals for IPC names.
- Event and command names follow the `atlassian.<domain>.<verb|noun>` pattern (e.g., `atlassian.webview.ready`, `atlassian.route.navigate`). Keep this convention when adding new entries.
- Add corresponding payload type and schema entry in `IPC_EVENT_PAYLOAD_SCHEMAS` or `IPC_COMMAND_PAYLOAD_SCHEMAS` for every new event or command.
- RPC envelopes carry a raw JSON string in `payload`. Events and commands carry structured `payload?: unknown` with a `name` field. Do not put a `name` on RPC envelopes or a raw string payload on event/command envelopes.
