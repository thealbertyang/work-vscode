# Main App Usage

This document describes how to use the Atlassian Sprint extension as a lifecycle control center (Plan → Execute → Review → Ship → Observe) and how it integrates `.claude` docs/runbooks/skills/plans.

## What This App Is

- A VS Code extension that:
  - shows sprint issues in a tree view
  - provides a lifecycle UI (Plan/Execute/Review/Ship/Observe)
  - exposes **System** pages for Settings, Docs, and the Universal Registry
- A universal `.claude/` workspace convention that keeps:
  - **Docs** (`docs/`) as the knowledge base (matrices, concepts)
  - **Runbooks** (`runbooks/`) as step-by-step procedures
  - **Plans** (`plans/`) as one-off design/decision artifacts
  - **Skills** (`skills/`) as reusable agent workflows (`SKILL.md`)
  - **Automations** (`automations/`) as scheduled workflows (Codex `automation.toml`)

Open **System → Docs** to browse these groups from inside the app.

## Primary Workflow (Lifecycle)

| Stage | What You Do | What The UI Should Surface | Default Artifact |
| --- | --- | --- | --- |
| Plan | Pick the right work | Worklist + reminders + links to matrices | Plan notes, next actions |
| Execute | Run code/work | Automations + task execution | PR / patch / automation runs |
| Review | Reduce risk | Issue detail, checklists, verification | Review notes, fixes |
| Ship | Release safely | Release checklist + promotion runbook | VSIX + release notes |
| Observe | Triage signals | Incident/triage runbook + routing back to Plan/Execute | Repro + owner + next step |
| System | Configure + inspect | Settings + Docs + Registry | Config state |

Stage pages should link directly to the relevant runbook/matrix docs (for muscle memory).

## Navigation + Deep Links

You can navigate via:
- in-app routing (Stage rail)
- pasting routes into the URL bar (raw routes, hash routes, or deep links)

Canonical route examples:
- `/plan`
- `/execute`
- `/review/issues/ABC-123`
- `/system/docs?doc=docs/engineer-work-matrix.md`

Deep links (VS Code):
- Base: `${uriScheme}://${extensionId}`
- Primary: `/app/<appId>/<kind>/<target>?...`
  - Example universal URL: `app://atlassian/route/plan`
  - Example deep link: `vscode-insiders://albertyang.atlassian-sprint-view/app/atlassian/route/plan`
- Legacy (route-only convenience): `/open/<route>`
  - Example: `vscode-insiders://albertyang.atlassian-sprint-view/open/plan`
  - Legacy redirect: `/intent?u=...` still exists for old links, but resolves to `/app/...`

Use **System → Registry** to see your current deep link base and copy examples.

## Main VS Code Commands

These are the primary user entry points:

- `atlassian.openApp`
- `atlassian.refresh`
- `atlassian.openIssue`
- `atlassian.login` / `atlassian.logout`
- `atlassian.syncEnvToSettings`

Dev commands:
- `atlassian.runDevWebview`
- `atlassian.reloadWebviews`
- `atlassian.restartExtensionHost`
- `atlassian.reinstallExtension`

## Dev: Browser Mode (WS Bridge)

In development, you can run the UI in a normal browser at `http://localhost:5173` and still talk to the extension host.

Transport contract:
- Webview (VS Code): `webview.postMessage` with an IPC envelope
- Browser dev: WebSocket bridge at `ws://127.0.0.1:5174/?token=...` using the same envelopes

Auth:
- The WS bridge requires a token.
- When the extension starts the Vite dev server, it injects `VITE_ATLASSIAN_WS_BRIDGE_TOKEN` so the browser connects automatically.
- If you started Vite manually, open the browser once with `?wsToken=...` (the UI persists it in localStorage).

Troubleshooting:
- **System → Registry** shows the WS endpoint and token presence.
- **System → Settings** shows the token (masked) and includes a copy action.

## Runtime Notes (Node/Bun)

- The extension host runtime is the Node version shipped with VS Code/Electron (not your system `node`).
- `bun` is used for local builds/scripts and does not change the VS Code extension host runtime.

## Related Docs

- `docs/lifecycle-ui.md`
- `docs/routing-matrix.md`
- `docs/configuration-matrix.md`
- `docs/universal-matrix.md`
