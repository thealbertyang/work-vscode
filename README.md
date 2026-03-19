# Work (VS Code Extension)

Shows your open sprint Jira issues in the Explorer view.

## Overview

Work is a VS Code extension that keeps your current sprint Jira issues visible in the Explorer view. The active product surface is the explorer plus story and agent commands. The webview code remains in the repo as a disabled template for future app work.

Primary flows:

1. Connect to Jira with an API token.
2. View and refresh your sprint issues.
3. Open an issue in the browser, open the Work app in the VS Code integrated browser, or start agent work from the explorer.

## Features

- Tree view in Explorer with issues from the current open sprint assigned to you
- Login via Atlassian API token
- Refresh and open issue commands
- Open and refresh the Work app in VS Code's integrated browser

## Setup

Quick start:

1. Open the Work explorer view.
2. Enter your Jira URL, email, and API token.
3. Confirm the connection and refresh the tree.

### API Token

1. Use `Work: Login` from the Command Palette.
2. Enter your Jira site URL, email, and API token.

If you use `.env.local`, run `Work: Sync .env.local to Settings` to copy values into workspace settings.

## Settings

| Setting | Purpose | Default | Notes |
| --- | --- | --- | --- |
| `work.baseUrl` | Jira site base URL | `""` | Example: `https://your-domain.atlassian.net` |
| `work.jiraUrl` | Legacy Jira URL | `""` | Prefer `work.baseUrl` |
| `work.email` | Atlassian account email | `""` | Used for API token auth |
| `work.apiToken` | Atlassian API token | `""` | Prefer `.env.local` |
| `work.jql` | JQL used to fetch issues | `assignee = currentUser() AND sprint in openSprints() ORDER BY updated DESC` | User intent only |
| `work.maxResults` | Max issues per refresh | `50` | Keep small for performance |
| `work.webviewPath` | Template-only local HTML path | `""` | Dormant webview scaffold |
| `work.webviewServerUrl` | Template-only HMR server URL | `""` | Dormant webview scaffold |

### Environment Overrides

You can supply settings via `.env.local` (or `.env`) in any workspace folder.
The extension loads these and will also resolve `${env:VAR}` placeholders in settings. Use `Work: Sync .env.local to Settings` to copy values into workspace settings.

API token settings can also be provided via `.env.local` (or `.env`):

API token env vars:

- `JIRA_URL` (e.g., `https://your-domain.atlassian.net`)
- `ATLASSIAN_BASE_URL`
- `JIRA_USER_EMAIL`
- `ATLASSIAN_EMAIL`
- `JIRA_API_TOKEN`
- `ATLASSIAN_API_TOKEN`
- `JIRA_JQL` (optional override for the JQL query)

Template-only webview env vars:

- `ATLASSIAN_WEBVIEW_PATH`
- `ATLASSIAN_WEBVIEW_SERVER_URL`

## Dev Design

The extension follows a predictable flow: user intent or system events are normalized into actions, the extension host produces effects, then storage and UI updates follow. Explorer refresh is event-driven by default from local story watchers and Work MCP events. Polling is now only an explicit fallback.

Design rules we follow:

1. Settings represent user intent, not cache.
2. Secrets live in `context.secrets`.
3. Large data goes in `storageUri` or `globalStorageUri`.
4. Commands stay minimal and high‑value.

Related docs:

- `docs/configuration-matrix.md`
- `docs/routing-matrix.md`
- `docs/external-app-matrix.md`
- `docs/main-app-usage.md`

### Webview Template (Disabled)

The `src/webview` tree is kept as a template scaffold for future app work. It is not part of the active extension surface.

If you want to experiment with the template locally, set:

- `work.webviewPath` in settings, or
- `ATLASSIAN_WEBVIEW_PATH` in `.env.local`

Point it to a local HTML file if you want to experiment with the dormant scaffold out of
band. It is not part of the active extension surface, so this no longer hooks into any
default command or panel flow.

### Webview Dev (HMR via Vite)

For a richer UI, you can run a local dev server and have the webview load it:

- `ATLASSIAN_WEBVIEW_SERVER_URL=http://localhost:5173`
- `bun run dev:webview:template`

The template dev server runs on `http://localhost:5173` by default. If you choose to
wire the template back in locally, it can load from that server with HMR.

#### HTTPS (optional)

If you want HTTPS locally (some browsers auto-upgrade), run:

- `bun run dev:webview:https`

This generates a self-signed cert in `src/webview/.certs` and starts Vite at
`https://localhost:5173`. You may need to trust the cert in Keychain.

### Webview Template Build

The template can still be built manually if you want to iterate on it out of band:

- `bun run build:webview:template`

### Extension Host Workflow

Run an Extension Development Host (F5) and keep a watch build running:

- `bun run dev` for extension host code
- `Developer: Restart Extension Host` after changes

The webview template is not part of the default development loop.

### VS Code Tasks (Seamless)

Use the provided launch config:

1. Press `F5` and choose `Run Extension (HMR)`.
2. Use `Developer: Restart Extension Host` after host code changes.

## Commands

- `Work: Login`
- `Work: Logout`
- `Work: Refresh Issues`
- `Work: Open Browser`
- `Work: Refresh Browser`
- `Work: Restart Extension Host`
- `Work: Open Issue`

## Docs

- `docs/configuration-matrix.md` -- full settings, env vars, build modes, HTML resolution, HMR flow
- `docs/routing-matrix.md`
- `docs/external-app-matrix.md`
- `docs/main-app-usage.md`
- `docs/engineer-work-matrix.md`
- `docs/lifecycle-ui.md`
- `docs/project-management-matrix.md`
- `docs/reminder-ui.md`
- `docs/automation-runner.md`

## Development (Bun)

- `bun install`
- `bun run dev` starts the TypeScript watch build for the extension host only.
- Press `F5` to launch an Extension Development Host.

## Install (Code - Insiders)

- `bun run install:ext` builds, packages, and installs the local VSIX.

## Publish

- `bun run publish` publishes the current version using `VSCE_PAT` from `.env.local`.

## CI/CD

This repo includes a GitHub Actions workflow at `.github/workflows/release.yml`.
Push a tag like `v0.0.5` and it will:

- build + package the VSIX
- publish to the Marketplace (requires `VSCE_PAT` secret)
- create a GitHub Release and attach the VSIX
