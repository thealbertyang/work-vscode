# Universal Event System (Signals)

This document defines the full event system design: subscribe, publish, capture, save, reference, and trigger automations. Events are called **Signals** in the UI vocabulary (see `docs/universal-matrix.md` Naming/UX Vocabulary).

The event system fits into the universal config contract (`config/universal.toml`) as the `[events.*]` section and is the nervous system connecting all reactive workflows (`docs/reactive-workflows.md`).

## Current State

| What Exists | Where | Gap |
| --- | --- | --- |
| 1 event in config | `universal.toml` → `[events.routeChanged]` | Only 1 of ~40+ needed |
| 4 hard-coded events | `src/shared/contracts/ipc.ts` → `IPC_EVENTS` | Not config-driven |
| Basic pub/sub | `webview-ipc.ts` → `Map<string, Set<IpcHandler>>` | No persistence, no patterns, no middleware |
| IPC envelope | `IpcEnvelope` with `kind: "event"` | No metadata (timestamp, source, correlation) |
| Automation discovery | Reads TOML + SQLite | No event-based triggering |
| Universal URL scheme | `app://<appId>/<kind>/<target>` | No `event` kind for referencing events |

## Event Shape

Every event in the system follows one schema:

```typescript
type AppEvent = {
  id: string;              // Unique event ID (nanoid or uuid)
  name: string;            // Fully qualified name: "atlassian.triage.completed"
  category: EventCategory; // Top-level grouping
  timestamp: number;       // Unix ms
  source: EventSource;     // Where it originated
  correlationId?: string;  // Links related events (triage.started → triage.completed)
  payload?: unknown;       // Event-specific data
  meta?: {
    stage?: string;        // Lifecycle stage when event fired
    route?: string;        // Current route when event fired
    workflowId?: string;   // If triggered by a workflow
    automationId?: string; // If triggered by an automation
  };
};

type EventCategory =
  | "app"        // Application lifecycle
  | "route"      // Navigation
  | "ui"         // User interactions
  | "issue"      // Jira domain
  | "triage"     // Triage workflow
  | "pr"         // Pull requests
  | "branch"     // Git operations
  | "build"      // Build/CI
  | "automation" // Automation lifecycle
  | "state"      // State persistence
  | "sprint"     // Sprint lifecycle
  | "timer"      // Time-based signals
  | "system";    // Extension/webview system

type EventSource =
  | "extension"  // Extension host
  | "webview"    // Webview UI
  | "automation" // Automation runner
  | "external"   // Webhook or external system
  | "git"        // Git hooks
  | "timer";     // Internal clock
```

## Event Catalog

### Application Lifecycle

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `app.activated` | extension | `{ extensionPath }` | Extension host starts |
| `app.opened` | webview | `{ route }` | Webview panel becomes visible |
| `app.closed` | webview | `{ route }` | Webview panel hidden |
| `app.connected` | extension | `{ baseUrl, email }` | Jira credentials verified |
| `app.disconnected` | extension | `{ reason }` | Credentials removed or invalid |

### Navigation

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `route.changed` | webview | `{ path, query, previousPath }` | User navigates |
| `route.deepLinked` | extension | `{ canonicalUrl, resolvedRoute }` | Deep link opened (e.g., `app://atlassian/route/plan`) |
| `stage.entered` | webview | `{ stage, previousStage }` | Stage rail click or `1-5` key |

### User Interaction

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `ui.action` | webview | `{ id, rpc, args, route, source }` | Button click, form submit |
| `ui.event` | webview | `{ id, route, detail }` | Generic UI event |
| `ui.search` | webview | `{ query, context }` | Search input |
| `ui.selected` | webview | `{ itemType, itemKey }` | Item selected in list |
| `ui.dismissed` | webview | `{ what, reason }` | Dismiss suggestion, close panel |

### Jira Domain

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `issue.viewed` | webview | `{ key }` | User opens issue detail |
| `issue.fetched` | extension | `{ key, summary, status }` | Issue data loaded from API |
| `issue.transitioned` | external | `{ key, from, to }` | Jira webhook: status change |
| `issue.commented` | external | `{ key, author, body }` | Jira webhook: new comment |
| `issue.assigned` | external | `{ key, assignee }` | Jira webhook: assignment |

### Triage

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `triage.started` | extension | `{ source: "manual" \| "auto" }` | Run Triage clicked or auto |
| `triage.completed` | extension | `{ issueCount, buckets: { now, next, waiting } }` | Triage finished |
| `triage.stale` | timer | `{ lastTriagedAt, ageMs }` | Triage older than threshold |
| `triage.overridden` | webview | `{ key, fromBucket, toBucket }` | User manually moved issue |

### Pull Requests

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `pr.opened` | external | `{ number, title, author, branch }` | GitHub webhook |
| `pr.updated` | external | `{ number, action }` | Commits pushed, review requested |
| `pr.reviewed` | external | `{ number, reviewer, state }` | Review submitted |
| `pr.merged` | external | `{ number, branch, mergeCommit }` | PR merged |
| `pr.closed` | external | `{ number, reason }` | PR closed without merge |

### Git

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `branch.switched` | git | `{ from, to }` | `git checkout` or `git switch` |
| `branch.created` | git | `{ name, base }` | `git checkout -b` |
| `branch.deleted` | git | `{ name }` | `git branch -d` |
| `commit.created` | git | `{ hash, message, branch }` | `git commit` |

### Build / CI

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `build.started` | extension | `{ target: "extension" \| "webview" }` | Build command fired |
| `build.completed` | extension | `{ target, durationMs, success }` | Build finished |
| `build.failed` | extension | `{ target, error }` | Build errored |
| `ci.passed` | external | `{ ref, checks }` | All CI checks green |
| `ci.failed` | external | `{ ref, failedChecks }` | CI check failed |

### Automation

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `automation.triggered` | automation | `{ id, trigger: "event" \| "schedule" \| "chain" }` | Automation starts |
| `automation.completed` | automation | `{ id, durationMs, stateWritten }` | Automation finished |
| `automation.failed` | automation | `{ id, error }` | Automation errored |
| `automation.skipped` | automation | `{ id, reason }` | Condition not met |

### State

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `state.written` | extension | `{ section, path }` | `.claude/state.json` updated |
| `state.section.changed` | extension | `{ section, diff }` | Specific section changed |
| `state.reset` | extension | `{ sections }` | State file reset |

### Sprint

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `sprint.started` | external | `{ id, name, goal }` | Jira sprint activated |
| `sprint.ended` | external | `{ id, name, completedCount, carriedOver }` | Jira sprint closed |
| `sprint.scopeChanged` | external | `{ id, added, removed }` | Issues added/removed mid-sprint |

### Timer / Signals

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `timer.ritual` | timer | `{ ritual: "morning" \| "midday" \| "evening" \| "weekly" }` | Ritual time window hit |
| `timer.stale` | timer | `{ section, ageMs, threshold }` | State section exceeds staleness |
| `timer.idle` | timer | `{ durationMs }` | No user activity for threshold |

### System

| Event | Source | Payload | Triggers |
| --- | --- | --- | --- |
| `system.configChanged` | extension | `{ file, section }` | `universal.toml` or `config.local.toml` changed |
| `system.stateFileChanged` | extension | `{ path }` | `.claude/state.json` file watcher fires |
| `system.error` | extension | `{ code, message, source }` | Unhandled error in extension host |
| `system.transport.connected` | extension | `{ transport: "postMessage" \| "ws" }` | Transport established |
| `system.transport.disconnected` | extension | `{ transport, reason }` | Transport lost |

## Summary Matrix (All Events)

Flat view of every event with all fields for quick reference:

| Event | Category | Source | Capture | Lifecycle Stage | Workflow Trigger |
| --- | --- | --- | --- | --- | --- |
| `app.activated` | app | extension | no | — | — |
| `app.opened` | app | webview | no | — | Load triage (if stale) |
| `app.closed` | app | webview | no | — | — |
| `app.connected` | app | extension | yes | — | — |
| `app.disconnected` | app | extension | yes | — | — |
| `route.changed` | route | webview | no | — | — |
| `route.deepLinked` | route | extension | no | — | — |
| `stage.entered` | route | webview | no | — | — |
| `ui.action` | ui | webview | no | — | — |
| `ui.event` | ui | webview | no | — | — |
| `ui.search` | ui | webview | no | — | — |
| `ui.selected` | ui | webview | no | — | — |
| `ui.dismissed` | ui | webview | no | — | — |
| `issue.viewed` | issue | webview | yes | review | — |
| `issue.fetched` | issue | extension | yes | review | — |
| `issue.transitioned` | issue | external | yes | plan | Re-triage |
| `issue.commented` | issue | external | yes | review | — |
| `issue.assigned` | issue | external | yes | plan | — |
| `triage.started` | triage | extension | yes | plan | — |
| `triage.completed` | triage | extension | yes | plan | Daily focus (chain) |
| `triage.stale` | triage | timer | yes | plan | Auto-triage |
| `triage.overridden` | triage | webview | yes | plan | — |
| `pr.opened` | pr | external | yes | review | PR risk scan |
| `pr.updated` | pr | external | yes | review | — |
| `pr.reviewed` | pr | external | yes | review | — |
| `pr.merged` | pr | external | yes | ship | Ship readiness |
| `pr.closed` | pr | external | yes | review | — |
| `branch.switched` | branch | git | yes | execute | Context restore |
| `branch.created` | branch | git | yes | execute | — |
| `branch.deleted` | branch | git | yes | — | — |
| `commit.created` | branch | git | yes | execute | — |
| `build.started` | build | extension | yes | ship | — |
| `build.completed` | build | extension | yes | ship | — |
| `build.failed` | build | extension | yes | ship | — |
| `ci.passed` | build | external | yes | ship | Ship readiness |
| `ci.failed` | build | external | yes | ship | — |
| `automation.triggered` | automation | automation | yes | — | — |
| `automation.completed` | automation | automation | yes | — | Chain next workflow |
| `automation.failed` | automation | automation | yes | — | — |
| `automation.skipped` | automation | automation | yes | — | — |
| `state.written` | state | extension | yes | — | Notify webview |
| `state.section.changed` | state | extension | yes | — | — |
| `state.reset` | state | extension | yes | — | — |
| `sprint.started` | sprint | external | yes | plan | Sprint planning |
| `sprint.ended` | sprint | external | yes | plan | Weekly summary |
| `sprint.scopeChanged` | sprint | external | yes | plan | — |
| `timer.ritual` | timer | timer | no | plan | Morning/weekly rituals |
| `timer.stale` | timer | timer | no | — | Re-run stale automation |
| `timer.idle` | timer | timer | no | — | — |
| `system.configChanged` | system | extension | yes | system | Reload config |
| `system.stateFileChanged` | system | extension | yes | — | Push state to webview |
| `system.error` | system | extension | yes | observe | — |
| `system.transport.connected` | system | extension | yes | — | — |
| `system.transport.disconnected` | system | extension | yes | — | — |

**Totals:** 50 events, 14 categories, 6 sources.

## Event × Matrix Interaction Map

How events interact with every other matrix in the universal contract:

| Matrix | How Events Interact | Direction | Example |
| --- | --- | --- | --- |
| **Identity** | Events are namespaced (`atlassian.triage.completed`) | Events use namespace | `atlassian.*` prefix |
| **Actions** | Actions emit events on execution | Actions → Events | `atlassian.app.open` → `app.opened` |
| **Commands** | Commands can trigger events; events can trigger commands | Bidirectional | `atlassian.openApp` → `app.activated` |
| **Routes** | Route changes emit events; events can trigger navigation | Bidirectional | `route.changed`, `branch.switched` → navigate |
| **Views** | Events cause view re-renders via state updates | Events → Views | `triage.completed` → Plan daily re-renders |
| **Objects** | Domain object changes emit events | Objects → Events | Issue status change → `issue.transitioned` |
| **Datasets** | Dataset refreshes emit events; events trigger dataset fetches | Bidirectional | `sprint.started` → refresh sprint issues |
| **Storage** | Events persist to event store; state writes emit events | Bidirectional | `state.written`, capture to SQLite |
| **Rules** | Rules gate event handling (e.g., only if connected) | Rules → Events | `auth-required` rule gates `triage.started` |
| **Rulesets** | Rulesets bundle rules that apply to event categories | Rulesets → Events | `capture-policy` ruleset |
| **Platforms** | Platform determines transport for events | Platforms → Events | VS Code: postMessage, Web: WebSocket |
| **Environments** | Environment affects capture policy (dev=JSONL, prod=SQLite) | Environments → Events | Dev: verbose capture, Prod: selective |
| **Transport** | Events flow through IPC envelope (`kind: "event"`) | Transport carries Events | Same envelope, different wire |
| **Workflows** | Workflows subscribe to events as triggers | Events → Workflows | `pr.opened` → pr-risk-scan workflow |
| **Automations** | Automations emit lifecycle events; events trigger automations | Bidirectional | `automation.completed` → chain next |

## Universal URL for Events

Events are referenceable via the canonical `app://` URL scheme:

```
app://atlassian/event/<eventName>
app://atlassian/event/triage.completed
app://atlassian/event/pr.opened?after=2026-02-06
app://atlassian/events?category=triage&after=2026-02-06
```

| Kind | URL Pattern | Resolves To |
| --- | --- | --- |
| Single event definition | `app://atlassian/event/triage.completed` | Event catalog entry in Registry |
| Event log query | `app://atlassian/events?category=triage` | Filtered event log in Observe stage |
| Live subscription | `app://atlassian/events/live?pattern=triage.*` | Live event stream (firehose filtered) |

Transport wrappers:
- VS Code: `${uriScheme}://${extensionId}/app/atlassian/event/triage.completed`
- Browser: `http://localhost:5173/#/app/atlassian/event/triage.completed`

## Event Bus Operations

Five operations, all fitting through the IPC envelope:

| Operation | Description | Direction | Persistence |
| --- | --- | --- | --- |
| **publish** | Fire an event | Any → Bus | Optional (capture flag) |
| **subscribe** | Listen to events matching a pattern | Bus → Handler | — |
| **capture** | Store event in event log | Bus → Store | Always |
| **query** | Read stored events by filter | Store → Caller | — |
| **replay** | Re-emit stored events for catch-up | Store → Bus | — |

### Subscribe Patterns

Subscriptions use glob patterns on event names:

| Pattern | Matches |
| --- | --- |
| `triage.*` | `triage.started`, `triage.completed`, `triage.stale` |
| `*.completed` | `triage.completed`, `build.completed`, `automation.completed` |
| `pr.*` | All PR events |
| `*` | Everything (firehose) |
| `issue.transitioned` | Exact match only |

### Capture Policy

Not all events need persistence. The config defines capture policy per category:

```toml
[events.capture]
# Which categories to persist to the event log
persist = ["triage", "automation", "state", "sprint", "pr", "issue", "build", "branch", "system"]
# Which to fire-and-forget (high frequency, low value for replay)
transient = ["ui", "route", "timer", "app"]
# Retention
maxAge = "7d"
maxCount = 5000
```

### Event Store

| Option | Format | Pros | Cons |
| --- | --- | --- | --- |
| `.claude/events.jsonl` | Append-only JSONL | Inspectable, simple, git-diffable | No indexing, slow queries |
| SQLite (`.claude/events.db`) | Relational | Fast queries, indexed | Binary, needs driver |
| In-memory + periodic flush | Hybrid | Fast writes | Lost on crash |

Recommended: **SQLite** for production, **JSONL** for development/debugging. Config selects:

```toml
[events.store]
kind = "sqlite"          # "sqlite" | "jsonl" | "memory"
path = ".claude/events"  # Relative to workspace root
```

## Universal Config Integration

### Full `[events.*]` Section for `universal.toml`

```toml
# --- Event System ---

[events.config]
namespace = "atlassian"
capture = ["triage", "automation", "state", "sprint", "pr", "issue", "build", "branch", "system"]
transient = ["ui", "route", "timer", "app"]

[events.store]
kind = "sqlite"
path = ".claude/events"
maxAge = "7d"
maxCount = 5000

# --- Application Lifecycle ---

[events.appActivated]
id = "atlassian.app.activated"
kind = "extension"
category = "app"
capture = false

[events.appOpened]
id = "atlassian.app.opened"
kind = "webview"
category = "app"
capture = false

[events.appConnected]
id = "atlassian.app.connected"
kind = "extension"
category = "app"
capture = true

[events.appDisconnected]
id = "atlassian.app.disconnected"
kind = "extension"
category = "app"
capture = true

# --- Navigation ---

[events.routeChanged]
id = "atlassian.route.changed"
kind = "ipc"
category = "route"
capture = false

[events.stageEntered]
id = "atlassian.stage.entered"
kind = "webview"
category = "route"
capture = false

# --- Triage ---

[events.triageStarted]
id = "atlassian.triage.started"
kind = "extension"
category = "triage"
capture = true

[events.triageCompleted]
id = "atlassian.triage.completed"
kind = "extension"
category = "triage"
capture = true

[events.triageStale]
id = "atlassian.triage.stale"
kind = "timer"
category = "triage"
capture = true

# --- Issues ---

[events.issueViewed]
id = "atlassian.issue.viewed"
kind = "webview"
category = "issue"
capture = true

[events.issueTransitioned]
id = "atlassian.issue.transitioned"
kind = "external"
category = "issue"
capture = true

# --- Pull Requests ---

[events.prOpened]
id = "atlassian.pr.opened"
kind = "external"
category = "pr"
capture = true

[events.prMerged]
id = "atlassian.pr.merged"
kind = "external"
category = "pr"
capture = true

# --- Git ---

[events.branchSwitched]
id = "atlassian.branch.switched"
kind = "git"
category = "branch"
capture = true

# --- Build ---

[events.buildCompleted]
id = "atlassian.build.completed"
kind = "extension"
category = "build"
capture = true

# --- Automation ---

[events.automationTriggered]
id = "atlassian.automation.triggered"
kind = "automation"
category = "automation"
capture = true

[events.automationCompleted]
id = "atlassian.automation.completed"
kind = "automation"
category = "automation"
capture = true

# --- State ---

[events.stateWritten]
id = "atlassian.state.written"
kind = "extension"
category = "state"
capture = true

# --- Sprint ---

[events.sprintStarted]
id = "atlassian.sprint.started"
kind = "external"
category = "sprint"
capture = true

[events.sprintEnded]
id = "atlassian.sprint.ended"
kind = "external"
category = "sprint"
capture = true

# --- Timer ---

[events.timerRitual]
id = "atlassian.timer.ritual"
kind = "timer"
category = "timer"
capture = false

[events.timerStale]
id = "atlassian.timer.stale"
kind = "timer"
category = "timer"
capture = false
```

## How It Connects to the IPC Envelope

The existing envelope already supports events:

```typescript
{ kind: "event"; name: string; payload?: unknown }
```

The event system extends this with metadata without breaking the envelope:

```typescript
// Current — unchanged
type IpcEnvelope =
  | { kind: "rpc"; payload: string }
  | { kind: "event"; name: string; payload?: unknown }
  | { kind: "command"; name: string; payload?: unknown };

// New — event payload wraps AppEvent when using the event bus
// The envelope carries it; the bus unpacks and routes it
type EventEnvelopePayload = AppEvent;
```

Events published through the bus get the full `AppEvent` shape. Events sent raw through IPC (legacy) get wrapped with defaults (timestamp = now, source = sender, id = generated).

## Automation Trigger Integration

Workflows subscribe to events instead of (or in addition to) schedules:

```toml
[workflow.pr-risk-scan]
trigger = { event = "pr.opened" }

[workflow.daily-triage]
trigger = [
  { schedule = "FREQ=DAILY;BYHOUR=9" },
  { event = "app.opened", condition = "triage.stale > 1h" },
]

[workflow.context-restore]
trigger = { event = "branch.switched" }

[workflow.sprint-planning]
trigger = { event = "sprint.started" }

[workflow.weekly-summary]
trigger = [
  { event = "sprint.ended" },
  { schedule = "FREQ=WEEKLY;BYDAY=FR;BYHOUR=17" },
]

[workflow.re-triage]
trigger = { event = "issue.transitioned" }

[workflow.ship-readiness]
trigger = { event = "pr.merged", condition = "allChecksGreen" }
```

The automation runner evaluates:
1. Event fires → check subscribed workflows → evaluate conditions → execute if met
2. Schedule fires → same flow
3. Chain fires (workflow.completed event) → same flow

## Event Flow Diagram

```
Sources                    Event Bus                     Consumers
─────────                  ─────────                     ─────────
Extension ──publish──┐                              ┌──→ Workflow Engine
Webview   ──publish──┤     ┌─────────────┐          │     (trigger automations)
Git hooks ──publish──┼────→│  Route by   │──subscribe┼──→ Webview UI
Webhooks  ──publish──┤     │  pattern    │          │     (reactive rendering)
Timer     ──publish──┘     └──────┬──────┘          ├──→ State Writer
                                  │                 │     (persist to state.json)
                                  │ capture         └──→ Event Log
                                  ↓                       (query + replay)
                           ┌─────────────┐
                           │ Event Store │
                           │ (SQLite /   │
                           │  JSONL)     │
                           └─────────────┘
```

## Query API

Stored events are queryable for dashboards, debugging, and feedback loops:

| Query | Use Case | Example |
| --- | --- | --- |
| By name | "Show all triage events" | `{ name: "triage.*" }` |
| By time range | "Events in the last hour" | `{ after: Date.now() - 3600000 }` |
| By correlation | "All events in this workflow run" | `{ correlationId: "abc-123" }` |
| By category | "All sprint events" | `{ category: "sprint" }` |
| By source | "All external events" | `{ source: "external" }` |
| Count by name | "How many triages this week" | `{ name: "triage.completed", after: weekStart, mode: "count" }` |

This powers:
- **Observe stage**: event timeline, event counts, pattern detection
- **Feedback loops**: "How many times did we re-triage this sprint?" → suggests auto-triage
- **Adaptation**: confirmation rates, skip rates, usage patterns
- **Debugging**: "What happened before this error?"

## Muscle Memory Integration

Events are invisible to the user. The user interacts with **stages, lists, and actions**. Events flow underneath:

| User Action | Event Published | Automation Triggered | User Sees |
| --- | --- | --- | --- |
| Opens app | `app.opened` | Load triage (if stale) | NOW/NEXT/WAITING populated |
| Clicks Run Triage | `triage.started` → `triage.completed` | Daily focus regenerates (chain) | Buckets update, focus summary appears |
| Switches branch | `branch.switched` | Context restore | Linked issue auto-displayed |
| PR merged (background) | `pr.merged` | Ship readiness check | Ship page shows "Ready" |
| Friday 5pm | `timer.ritual` | Weekly summary | Weekly tab shows summary |

The event system is the nervous system. The UI is the skin. The user touches the skin; the nervous system handles the rest.

## Registry UI Integration

The System > Registry page should show:
- **Event catalog**: all registered events with name, category, source, capture policy
- **Live event stream**: real-time feed of recent events (firehose or filtered)
- **Event counts**: per-category counts for the current session/day/week
- **Subscription map**: which workflows subscribe to which events
- **Event log query**: search stored events by name, time, correlation

## Related Docs

| Doc | Relationship to Event System |
| --- | --- |
| `docs/reactive-workflows.md` | Workflow model that subscribes to events as triggers |
| `docs/universal-matrix.md` | Universal config contract — events are the Signals matrix |
| `docs/routing-matrix.md` | IPC envelope (`kind: "event"`) carries events across transports |
| `docs/lifecycle-ui.md` | UI stages where events surface as reactive state changes |
| `docs/automation-runner.md` | Runner evaluates event-triggered + rrule-scheduled workflows |
| `docs/external-app-matrix.md` | Jira API calls emit domain events (`issue.*`, `sprint.*`) |
| `docs/configuration-matrix.md` | Event store config, capture policy, transport settings |
| `docs/engineer-work-matrix.md` | Events power the automation→display pipeline per stage |
| `docs/project-management-matrix.md` | Lifecycle cycle feedback loops flow through events |
| `docs/reminder-ui.md` | Reminder screens consume events via persisted state sections |
