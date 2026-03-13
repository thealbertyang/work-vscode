# Fix WS Bridge: Empty State + Connection Stability

## Context

When the webview runs in a browser (localhost:5173) instead of inside VS Code, the WS bridge
on port 5174 relays JSON-RPC between the browser and the extension host. After fixing the
bridge startup issue, the bridge connects but:

1. `getState` returns empty config (browser shows "Not set" / "Disconnected")
2. The WS connection drops and reconnects repeatedly
3. After reconnection, RPC calls silently fail

## Root Causes

### RC1: `loadState` never re-runs after bridge connects

**`App.tsx:169-194`** — `loadState()` checks `if (!isWebview) return` and the effect has
empty deps `[]`. On mount, `isWebview` is `false` (no `acquireVsCodeApi` in browser). When
the bridge connects, `isWebview` becomes `true` via the `ws-bridge-connected` event, but the
effect never re-runs.

### RC2: WS reconnection doesn't update `wsApi` reference

**`jsonrpc-rx-context.tsx:42-44`** — On `ws.onclose`, `createWsBridge()` is called via
`setTimeout`, but the returned VsCodeApi object is **discarded**. The module-level `wsApi`
still points to the old VsCodeApi with the closed WebSocket. The `postMessage` closure
captures the old `ws`, so new messages check the old (closed) readyState and push to an
old `pending` array that will never flush.

### RC3: No `onerror` handler, no disconnect event

No `ws.onerror` handler means connection failures are invisible. No `ws-bridge-disconnected`
event means the UI can't track connection drops.

## Files to Modify

| File | Change |
|------|--------|
| `src/webview/src/contexts/jsonrpc-rx-context.tsx` | Fix reconnection to update global ref; add onerror; fire disconnect event |
| `src/webview/src/App.tsx` | Re-run `loadState` when `isWebview` changes |

## Implementation

### Step 1: Fix WS bridge reconnection (`jsonrpc-rx-context.tsx`)

Restructure `createWsBridge` into a persistent bridge object that swaps its internal
WebSocket on reconnect. The `postMessage` function should always use the current connection.

```typescript
// Module-level mutable state for the bridge
let currentWs: WebSocket | null = null;
let bridgeReady = false;
const pending: string[] = [];

const connectWs = () => {
  try {
    const ws = new WebSocket(WS_BRIDGE_URL);

    ws.onopen = () => {
      currentWs = ws;
      bridgeReady = true;
      for (const msg of pending.splice(0)) ws.send(msg);
      window.dispatchEvent(new CustomEvent("ws-bridge-connected"));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      window.dispatchEvent(new MessageEvent("message", { data }));
    };

    ws.onerror = (err) => {
      console.warn("[ws-bridge] error", err);
    };

    ws.onclose = () => {
      if (currentWs === ws) currentWs = null;
      bridgeReady = false;
      window.dispatchEvent(new CustomEvent("ws-bridge-disconnected"));
      setTimeout(connectWs, 2000);
    };
  } catch {
    setTimeout(connectWs, 2000);
  }
};

// Single VsCodeApi that references mutable currentWs
const wsBridgeApi: VsCodeApi = {
  postMessage: (message: unknown) => {
    const serialized = JSON.stringify(message);
    if (currentWs?.readyState === WebSocket.OPEN) {
      currentWs.send(serialized);
    } else {
      pending.push(serialized);
    }
  },
  getState: () => { ... localStorage ... },
  setState: (state) => { ... localStorage ... },
};
```

Key changes:
- `connectWs()` is the reconnect function (no return value needed)
- `currentWs` is module-level and updated on each successful open
- `pending` is module-level so queued messages survive reconnections
- `wsBridgeApi` is a single stable object — `postMessage` always checks `currentWs`
- `onerror` handler added for visibility
- `ws-bridge-disconnected` event dispatched on close

Update `getVsCodeApi()`:
```typescript
export const getVsCodeApi = (): VsCodeApi => {
  if (isWebview) { ... native ... }
  if (!currentWs && !bridgeReady) connectWs();
  return wsBridgeApi;
};
```

### Step 2: Re-run `loadState` on bridge connect (`App.tsx`)

Change the `loadState` effect to depend on `isWebview`:

```diff
  useEffect(() => {
    void loadState();
- }, []);
+ }, [isWebview]);
```

This ensures `loadState` re-runs when the bridge connects and `isWebview` flips to `true`.

## Verification

1. `bun run build:ext && bun run package` then install VSIX
2. Start Vite dev server: `bun run dev:webview`
3. Open `localhost:5173` in Chrome
4. Check Output panel for `[ws-bridge] listening on ws://127.0.0.1:5174`
5. Browser console should show `[ws-bridge] error` if connection fails (not silent)
6. Settings page should show real config (edmunds.atlassian.net, etc.)
7. Overlay pill should show "Connected" instead of "Disconnected"
8. Kill and restart the extension host — browser should auto-reconnect and re-fetch state
