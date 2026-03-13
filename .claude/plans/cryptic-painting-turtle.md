# Fix: WebSocket Bridge Not Starting (Port 5174 Not Listening)

## Context

The Chrome dev view at `http://localhost:5173` shows "Webview Unavailable" because the WebSocket RPC bridge on port 5174 never starts. The bridge connects the external browser to the VS Code extension host, replacing `acquireVsCodeApi()` which is only available inside VS Code webviews.

**Root cause:** In `extension.ts:136`, the WS bridge creation (line 141-142) is nested inside `if (cwd)` where `cwd = resolveWebviewRoot(extensionPath)`. This function looks for `src/webview/src` on disk under the extension path or workspace folders. When the extension is installed normally (not via F5), the install directory lacks source files, and if workspace folders don't match the hardcoded path patterns in `resolveWebviewRoot()`, `cwd` is empty and the entire block — including the bridge — is skipped.

The bridge only needs the RPC `handlers` object (already constructed earlier in `activate()`). It does NOT need source files.

## Plan

### 1. Decouple WS bridge startup from `resolveWebviewRoot`

**File:** `src/extension/extension.ts` (lines 130-153)

Move the WS bridge startup outside the `if (cwd)` block. Start it whenever a localhost dev URL is active (configured or default), independent of whether source files are found on disk.

**Before:**
```typescript
const cwd = resolveWebviewRoot(context.extensionPath);
if (cwd) {
    const devUrl = configuredUrl || `http://localhost:${DEFAULT_WEBVIEW_PORT}/`;
    if (!configuredUrl || isLocalhostUrl(devUrl)) {
      const port = getServerPort(devUrl) || DEFAULT_WEBVIEW_PORT;
      webviewServer.start(cwd, port);
      const wsBridge = new WebviewWsBridge(handlers);
      wsBridge.start();
      context.subscriptions.push(wsBridge);
      // ...waitForServer...
    }
}
```

**After:**
```typescript
const cwd = resolveWebviewRoot(context.extensionPath);
const devUrl = configuredUrl || (cwd ? `http://localhost:${DEFAULT_WEBVIEW_PORT}/` : "");

// Start Vite dev server (needs source files)
if (cwd && (!configuredUrl || isLocalhostUrl(devUrl))) {
    const port = getServerPort(devUrl) || DEFAULT_WEBVIEW_PORT;
    webviewServer.start(cwd, port);
}

// Start WS bridge (needs only RPC handlers, not source files)
if (devUrl && isLocalhostUrl(devUrl)) {
    const wsBridge = new WebviewWsBridge(handlers);
    wsBridge.start();
    context.subscriptions.push(wsBridge);
}

// Wait for server readiness
if (devUrl && isLocalhostUrl(devUrl)) {
    void waitForServer(devUrl, 20, 500).then((ready) => {
      if (ready) {
        log("Webview server ready, refreshing panel.");
        void refreshAppPanel();
      }
    });
} else if (configuredUrl && !isLocalhostUrl(configuredUrl)) {
    log(`Webview server not started (using ${configuredUrl}).`);
}
```

Key changes:
- `webviewServer.start()` still requires `cwd` (needs source files to run Vite)
- `WebviewWsBridge` starts whenever there's a localhost dev URL, regardless of `cwd`
- The bridge starts even when the Vite dev server was started externally (e.g., `bun run dev:webview` in a terminal)

### 2. Rebuild the extension

```bash
cd /Users/albertyang/Developer/repos/vscode/extensions/atlassian
bun run build:ext
```

## Files Modified

- `src/extension/extension.ts` — decouple WS bridge from source-file check

## Verification

1. Rebuild: `bun run build:ext`
2. Reload VS Code extension host (Cmd+Shift+P → "Developer: Reload Window")
3. Confirm port 5174 is listening: `lsof -i :5174`
4. Open `http://localhost:5173` in Chrome — "Webview Unavailable" should disappear once the WS bridge connects
5. Check the "Atlassian" output channel in VS Code for `[ws-bridge] listening on ws://127.0.0.1:5174` log
