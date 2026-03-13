# Universal Matrix of Matrices

This document defines the universal, config-driven contract for actions, routes, commands, events, storage, and platform behavior. It is the blueprint for making the app fully configurable via `config/universal.toml`.

## Matrix Inventory

| Matrix | Purpose | Primary Keys | Examples |
| --- | --- | --- | --- |
| Identity | Namespacing and ownership | namespace, domain, prefix | `atlassian.*` |
| Actions | User intent and orchestration | action id, route, command | `atlassian.app.open` |
| Commands | Execution entry points | command id, kind | `atlassian.openApp` |
| Events (Signals) | Observable signals: subscribe, publish, capture, query, replay | event id, kind, category, capture | `atlassian.triage.completed` (50 events, 14 categories) |
| Routes | Navigation and deep links | route id, path | `/overview` |
| URL State | Shareable, bookmarkable UI state | route path, query key | `/system/registry?q=events&open=matrix.operations` |
| Views | UI surfaces | view id, label | Overview tab |
| Objects | Domain classes | object id, fields | Issue, User |
| Datasets | Collections and queries | dataset id, source | Sprint issues |
| Storage | Persistence targets | target id, kind | settings, secrets |
| Rules | Behavior and policy | rule id, when/then | auto-refresh |
| Rulesets | Bundled rules | ruleset id, rules | auth-required |
| Platforms | Surface constraints | platform id, kind | vscode, web |
| Environments | Runtime mode | env id, kind | dev, prod |
| Transport | Message envelopes + wiring | envelope kind, auth | postMessage, websocket |
| Observability | Logging and tracing | trace id, action id | UI action logs |

## Core Matrices

**Identity Matrix**

| Field | Description |
| --- | --- |
| namespace | Primary prefix for IDs |
| domain | Actions, commands, routes, events |
| scope | Global, workspace, webview |

**Action Matrix**

| Field | Description |
| --- | --- |
| id | Stable action identifier |
| command | VS Code or RPC command to execute |
| event | IPC event emitted |
| route | Navigation target |
| ruleset | Ruleset to enforce |

**Command Matrix**

| Field | Description |
| --- | --- |
| id | Command identifier |
| kind | vscode, rpc, ipc, webview |
| title | User-facing label |
| target | Handler or module |

**Event Matrix**

| Field | Description |
| --- | --- |
| id | Event identifier (e.g., `atlassian.triage.completed`) |
| kind | Source type: `extension`, `webview`, `timer`, `external`, `git`, `automation` |
| category | Grouping: `app`, `route`, `ui`, `issue`, `triage`, `pr`, `branch`, `build`, `automation`, `state`, `sprint`, `timer`, `system` |
| capture | Whether to persist to event store (`true`/`false`) |
| payloadSchema | Optional payload schema reference |

Events support subscribe (glob patterns like `triage.*`), publish, capture (persist), query (read back), and replay (catch-up). Full catalog and bus design in `docs/event-system-matrix.md`.

Config shape:

```toml
[events.triageCompleted]
id = "atlassian.triage.completed"
kind = "extension"
category = "triage"
capture = true

[events.config]
capture = ["triage", "automation", "state", "sprint", "pr", "issue"]
transient = ["ui", "route", "timer", "app"]

[events.store]
kind = "sqlite"
path = ".claude/events"
maxAge = "7d"
maxCount = 5000
```

**Route Matrix**

| Field | Description |
| --- | --- |
| id | Route identifier |
| path | URL/path pattern |
| view | View ID |
| deepLink | External scheme mapping |
| tabLabel | UI label |

**URL State Matrix (Query Params)**

Declared in `config/universal.toml` under `[urlState.*]` (8 params: `view`, `sort`, `filter`, `open`, `q`, `tab`, `focus`, `stage`). Runtime types: `src/shared/universal/types.ts` (`UrlStateParam`, `UrlStateConfig`). Utilities: `src/shared/link/url-state.ts` (`validateUrlParam`, `sanitizeUrlState`, `getUrlStateDefaults`, `getOmniboxHints`).

Treat the URL as the primary state container for shareable UI state:

- **Path**: "what resource/surface" (stage, page, entity)
- **Query**: "how to render it" (filters, layout, selection, focus, debug)

This enables:

- Shareable links (copy/paste deep links, runbooks, AI actions)
- Bookmarkable states (return to the exact view)
- Deterministic reproduction (URL becomes the debug artifact)

**Rules of thumb**

| Put In URL Query | Do Not Put In URL Query |
| --- | --- |
| Filters (`q`, `status`, `assignee`) | Secrets (tokens, credentials) |
| View modes (`view=compact`) | Large payloads (big JSON blobs) |
| Tabs/panels (`tab=comments`) | High-frequency transient UI (hover, scroll, toasts) |
| Pagination/sort (`page`, `sort`) | Unsaved form input |
| "Open/collapsed" UI sections (`open=...`) | Anything that would exceed practical URL length limits |

**Common query keys (recommended)**

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `q` | string | empty | Free-text filter/search |
| `view` | enum | route-defined | Layout mode (compact/full) |
| `tab` | enum | route-defined | Sub-surface selection |
| `open` | dot-separated string[] (CSV accepted) | route-defined | UI sections expanded (for registry/settings-like UIs) |
| `focus` | string | empty | Focus/selection anchor (scroll + highlight) |
| `sort` | enum | route-defined | Sort order |
| `page` | int | 1 | Pagination page |

**Route-specific URL state examples (current)**

| Route | Query Keys | Notes |
| --- | --- | --- |
| `/system/docs` | `doc`, `anchor` | `doc` is the canonical doc id; `anchor` scrolls within the doc and is shareable |
| `/system/registry` | `q`, `open`, `focus` | `q` filters; `open` shares which sections are expanded |
| `/review/issues/:key` | `view`, `tab` | `view=compact` is implemented today |

**Anchors vs query params**

- In the browser wrapper we already use `#` for SPA routing, so fragments are not a portable place for UI state.
- VS Code URI handlers typically ignore fragments unless explicitly forwarded.

Preferred convention:

- Use query params for anchors/focus (`anchor=...`, `focus=...`) so the same link works in:
  - VS Code deep links (`vscode://.../app/...?...`)
  - Browser dev links (`http://localhost:5173/#/app/...?...`)

**Implementation (TanStack Router + nuqs)**

For consistent, type-safe query-state in React components, prefer `nuqs`:

- Add `NuqsAdapter` at the app root (TanStack Router adapter).
- Use `useQueryState` / `useQueryStates` for component interaction state.
- Use `history: \"replace\"` for high-frequency edits (typing), `history: \"push\"` for discrete navigations.
- Use defaults + `clearOnDefault` to avoid noisy URLs.

This keeps the contract stable: query keys are part of the public interface surface (like routes/actions/commands) and should be treated as versioned API.

## Query Param Hygiene (Owned vs Wrapper)

In VS Code webviews, the base document URL often contains internal wrapper query params (`id`, `parentId`, `origin`, `swVersion`, etc.). These are not app-owned state and must not leak into:

- app deep links you copy/share
- app URL state (router search)
- registry/omnibox display

Rule: treat wrapper params as transport implementation detail. Only app-owned query keys are part of the public contract.

**Implementation:** `INTERNAL_WRAPPER_QUERY_KEYS` and `isInternalWrapperQueryKey()` in `src/shared/link/wrapper-keys.ts` define the known wrapper keys (`id`, `parentid`, `origin`, `swversion`, `extensionid`, `platform`, `vscode-resource-base-authority`, `parentorigin`) plus any key with a `vscode-` prefix. `parseAnyLink` automatically strips these via `stripWrapperParams()`, returning app-owned params in `search` and wrapper params in `passthrough`.

**Intent Links (Canonical Meaning)**

**Unified parser:** `parseAnyLink(input)` from `src/shared/link/parse-any-link.ts` is the single "paste anything" entry point. It accepts canonical intents, legacy intents, VS Code deep links, HTTP/localhost URLs, hash routes, raw paths, and legacy redirects, returning a `ParsedLink` with resolved route path, app-owned query params (wrapper params stripped), display string, and optional canonical intent URL.

**Formatter:** `formatLink(parsed, format)` from `src/shared/link/format.ts` converts a `ParsedLink` into one of 4 output formats: `canonical` (`app://atlassian/route/plan`), `dispatcher` (`/app/atlassian/route/plan`), `deepLink` (`vscode://ext/app/atlassian/route/plan`), `webHash` (`#/plan`).

You cannot make one `scheme://` work across browser navigation (`http(s)://`), VS Code deep links (`vscode://`), and sockets (`ws://`) because the scheme is the transport selector.

The universal approach is a 2-layer link model:

1. **Canonical universal URL (meaning-only):** `app://<appId>/<kind>/<target>?...`
2. **Environment wrapper (transport-specific):** always route through the path dispatcher (e.g. `/app/<appId>/<kind>/<target>?...`).

Config:

```toml
[app]
# Canonical scheme is `app://` (host is `app.id`)
id = "atlassian"
intentScheme = "app"
```

Examples (canonical universal URLs):

- `app://atlassian/route/plan`
- `app://atlassian/doc/docs/universal-matrix.md`
- `app://atlassian/skill/release-promotion`
- `app://atlassian/command/openApp?args=[...]`
- `app://atlassian/rpc/getUniversalConfig?args=[...]`
- `app://atlassian/action/dev/syncEnvToSettings`

Notes:

- For `action` and `command` kinds, the canonical URL uses **path segments** (URL-friendly), but the internal IDs remain stable and namespaced (e.g. `atlassian.dev.syncEnvToSettings`, `atlassian.openApp`).
- Dot-form (`app://atlassian/action/atlassian.dev.syncEnvToSettings`) is accepted for backward compatibility, but the omnibox normalizes it to the path form.

**Transport wrappers** (examples):

- VS Code deep link wrapper: `${uriScheme}://${extensionId}/app/atlassian/route/plan`
- Browser wrapper: `http://localhost:5173/#/app/atlassian/route/plan`

**Constructing deep links in code:**

Use the helpers in `src/shared/contracts/routes.ts`:

```ts
import { buildAppDispatcherPath, isAppDispatcherPath, buildDeepLinkUrl, buildDeepLinkBase } from "@shared/contracts";

// Wrap a route path in dispatcher format
const dispatcherPath = buildAppDispatcherPath("atlassian", "/plan");
// → "/app/atlassian/route/plan"

// Check before wrapping (prevents double-prefix bugs)
if (!isAppDispatcherPath(pathname)) {
  const path = buildAppDispatcherPath(appId, pathname);
}

// Build the full deep link URL
const base = buildDeepLinkBase(uriScheme, extensionId);
const url = buildDeepLinkUrl(base, dispatcherPath, { view: "compact" });
// → "vscode-insiders://pub.ext/app/atlassian/route/plan?view=compact"
```

**Surface-aware base selection:** The URL bar deep link base is chosen by surface (presence of `acquireVsCodeApi`), not by WS bridge connectivity. Browser links stay browser links even when the WS bridge connects.

Legacy note: `/intent?u=...` still exists as a redirect for old links, but the canonical dispatcher is `/app/...`.

Command-like intents should require confirmation in the UI to prevent drive-by execution (on the `/app/...` dispatcher page).

Docs integration: the docs renderer should treat canonical universal links (`app://...`) as internal navigation and route them through `/app/...`.

**Storage Matrix**

| Field | Description |
| --- | --- |
| id | Storage target ID |
| kind | settings, secrets, state, file, localStorage, indexeddb, sqlite, remoteDb |
| scope | global, workspace, webview |
| location | Filesystem URI or provider |

**Rules Matrix**

| Field | Description |
| --- | --- |
| id | Rule ID |
| when | Condition expression |
| then | Action or effect |

## Matrix of Matrices (Interaction Map)

| From \\ To | Identity | Actions | Commands | Events | Routes | Views | Storage | Rules | Platforms |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Identity | Prefix rules | Action IDs | Command IDs | Event IDs | Route IDs | View IDs | Storage IDs | Rule IDs | Platform IDs |
| Actions | Namespaced | Map to commands | Invoke | Emit | Navigate | Render | Read/write | Enforce | Varies |
| Commands | Namespaced | Trigger actions | Execute | Emit | Navigate | Refresh | Read/write | Enforce | Varies |
| Events | Namespaced | Notify actions | Notify handlers | Emit | Update | Refresh | Persist | Trigger | Varies |
| Routes | Namespaced | Open | Navigate | Emit | Resolve | Render | Persist | Enforce | Varies |
| Views | Namespaced | Invoke | Invoke | Emit | Navigate | Render | Persist | Enforce | Varies |
| Storage | Namespaced | Persist | Read/write | Emit | Persist | Persist | Store | Enforce | Varies |
| Rules | Namespaced | Gate | Gate | Gate | Gate | Gate | Gate | Apply | Varies |
| Platforms | Namespaced | Surface | Bind | Bind | Bind | Bind | Storage | Policy | Constraint |

## Config File Mapping

All matrices are configured under `config/universal.toml` and merged with defaults from the shared contracts.

| Section | Maps To |
| --- | --- |
| `[app]` | App identity and defaults |
| `[namespaces]` | Identity matrix |
| `[styles]` | UI styling tokens |
| `[actions.*]` | Action matrix |
| `[commands.*]` | Command matrix |
| `[events.*]` | Event matrix (catalog + capture policy + store config) |
| `[routes.*]` | Route matrix |
| `[views.*]` | View matrix |
| `[objects.*]` | Object classspace |
| `[datasets.*]` | Datasets |
| `[storage.targets.*]` | Storage targets |
| `[rules.*]` | Rules |
| `[rulesets.*]` | Rulesets |
| `[platforms.*]` | Platform mapping |
| `[urlState.*]` | URL State registry (app-owned query params, types, defaults, history mode) |
| `[environments.*]` | Environment mapping |

## Transport Matrix (Envelopes + Adapters)

Unify on a transport-agnostic envelope and swap transports underneath:

The thing you actually want to unify long-term is the contract (intent/actions/routes/envelope), not the transport.

- **Inside VS Code webviews:** prefer `acquireVsCodeApi().postMessage(...)` (most reliable; no ports/CSP/proxy issues).
- **External browser/dev clients:** use WebSocket (auth-gated) and translate to/from the same envelope.

The transport choice should not change route/action/command/event IDs, only how they are carried.

Node/Bun notes:

- Node has a browser-compatible `WebSocket` *client* on the global object in modern versions (including Node 25.x), but does not ship a WebSocket *server* API. Use `ws` (or similar) for server-side.
- VS Code extensions run on the Node version embedded in VS Code (not your system Node), so transport choices and APIs should target that runtime.
- Bun provides built-in server-side WebSockets via `Bun.serve({ websocket: ... })` (upgrade hooks, contextual `ws.data`, compression/backpressure controls). In Bun 1.3, WebSocket subprotocol negotiation matches RFC6455 and permessage-deflate is enabled automatically.
- Bun also re-exports `WebSocket`/`WebSocketServer` from `node:http` for Node compatibility (Bun 1.2.2+).
- Browser WS auth cannot rely on custom headers; prefer short-lived tokens via HTTPS and connect with `?token=...`, or use cookies/subprotocol negotiation.

## Registry UI (Control Center Integration)

The System → Registry page is the interactive index of the “matrix of matrices”:

- Visualizes the intent → action → envelope → transport → effects chain.
- Shows live counts/examples for routes/actions/commands/events/settings/storage.
- Provides copyable deep links and canonical intent URLs.
- Uses intent-level section naming (Entry points, Runtime, Navigation, Intents, Operations, Signals, Preferences, Persistence) so users learn the contract “shape,” not just raw lists.
- Cross-links matrices (e.g. which actions map to a given route/command) and supports filtering without duplicating full Settings/Docs/Dev pages.
- Acts as the main “contract surface” UI when integrating runbooks/skills/plans into the control-center experience.
- Keeps the omnibox (URL bar + palette) functional in browser/WS-bridge mode: navigation is always available; only execution/RPC is gated by connectivity.

### Naming/UX Vocabulary (Keep It Elegant)

Prefer intent-level labels in UI and docs, and only show raw IDs when needed:

- **Meaning link:** `app://<appId>/<kind>/...`
- **Navigation:** routes (paths + deep links)
- **Intents:** user-goal IDs (action definitions)
- **Operations:** execution entry points (VS Code commands, RPC, IPC commands)
- **Signals:** events (observable state changes)
- **Preferences:** settings registry (user intent)
- **Persistence:** storage targets (where data is allowed to live)
- **Runtime:** platforms + environments (constraints, connectivity, auth)
- **Agents:** `.claude/` docs/runbooks/plans/skills/automations (repeatable workflows + knowledge)

## Integration Points

| Layer | Entry Point | Purpose |
| --- | --- | --- |
| Extension | `UniversalConfigService` | Load TOML + merge defaults |
| Extension | `getUniversalConfig` RPC | Share registry with webview |
| Webview | `useHandlers().getUniversalConfig()` | Fetch config and apply UI tokens |
| Shared | `src/shared/universal/*` | Types + registry helpers |
| Shared | `src/shared/link/*` | Unified link parsing (`parseAnyLink`), formatting (`formatLink`), wrapper key stripping, URL state utilities |
