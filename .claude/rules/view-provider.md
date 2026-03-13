---
paths:
  - "src/extension/providers/view/view-provider-panel.ts"
---

- Call `requestNavigate(route)` BEFORE `showApp()` so that `initialRoute` is set before `getWebviewHtmlSafe()` builds the HTML. Reversing this order loses the route.
- `injectInitialRoute()` always overrides `location.hash` when `initialRoute` is present, even if a previous hash exists. This is intentional: explicit navigation (deep link, command) takes priority over persisted state.
- `injectInitialRoute()` clears `this.initialRoute` after injecting. It is a one-shot operation; do not rely on `initialRoute` being available after HTML generation.
- Deep link lifecycle: URI handler calls `requestNavigate()` (sets both `pendingRoute` and `initialRoute`) then `showApp()` (creates/reveals panel, triggers `getWebviewHtmlSafe` which calls `injectInitialRoute`) then `WEBVIEW_READY` event fires then `postPendingRoute()` sends IPC NAVIGATE command.
- `postPendingRoute()` only fires when `webviewReady` is true AND `pendingRoute` is set AND `ipc` exists. It clears `pendingRoute` after sending. Do not set `webviewReady = true` before IPC is initialized.
