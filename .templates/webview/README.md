# Webview Module

## Overview

The webview module is displayed as a Panel inside VS Code. It runs within the VS Code Webview sandbox and is subject to common constraints such as cross-origin limits and resource URL handling.

The webview module communicates with the extension via [jsonrpc-rx-js](https://github.com/jsonrpc-rx/jsonrpc-rx-js).

## Structure

```
webview/
├── src/
│   ├── contexts/
│   │   └── jsonrpc-rx-context.ts              # Extension <-> webview JSON-RPC context
│   ├── hooks/
│   │   ├── use-handlers.ts                    # Access handlers defined in the extension
│   │   ├── use-message.ts                     # Webview-to-webview messaging helpers
│   │   ├── use-on-did-open-text-documentts    # Listen for file open events
│   │   └── use-vsc-theme.ts                   # Read/update VS Code theme
│   ├── App.tsx                                # Webview UI
│   └── main.tsx                               # Entry point
└── vite.config.ts                             # Uses vite-plugin-vscode-webview-hmr for HMR
```
