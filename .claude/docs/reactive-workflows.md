# Reactive Workflows and Muscle Memory

This document defines the reactive automation model and muscle memory interaction patterns. It replaces the "individual rrule scheduling" model with a hybrid event + schedule + chain system that maps to how engineers actually work.

**Core Insight**

Rrule scheduling handles rituals (daily triage, weekly summary). But real work is event-driven. The system needs three trigger types:

| Trigger Type | When | Examples |
| --- | --- | --- |
| Event | Something happened | PR opened, issue transitioned, branch switched, file saved |
| Schedule | Time-based ritual | Daily triage at 9am, weekly summary Friday 5pm |
| Chain | Automation output triggers another | Triage completes → daily focus regenerates → notification |

Individual automations are the wrong unit. **Workflows** are the right unit: a trigger → a sequence of steps → state written → UI updated → optional human gate.

## Missing Matrices

### 1. Decision and Problem-Solving Matrix

How the system helps you decide what to do next.

| Situation | Signal | System Response | Human Gate | Muscle Memory |
| --- | --- | --- | --- | --- |
| Start of day | App opens | Load triage, show NOW bucket | Confirm top task | `1` → Plan, `Enter` → Start |
| Stuck on task | No commits in 30min | Suggest: break down, pair, switch | Choose action | `Shift+Enter` → secondary action |
| Bug found | Test failure or user report | Classify (auth/data/transport/routing), suggest runbook | Confirm classification | `5` → Observe, `Enter` → Triage |
| Blocked | Issue marked blocked | Surface in WAITING, notify blocker owner | Escalate or switch | `1` → Plan, see WAITING bucket |
| PR feedback | Review comments arrive | Summarize feedback, suggest fixes | Apply or revise | `3` → Review, `Enter` → Address |
| Deploy decision | All checks green | Show readiness checklist, draft notes | Approve publish | `4` → Ship, `Enter` → Release |
| Incident | Alert or report | Classify severity, suggest runbook | Confirm action | `5` → Observe, `Enter` → Respond |

**Decision Tree (on app open)**

```
Is there a blocked issue?
  → Yes → Show WAITING first, suggest unblock action
  → No →
    Is there an in-progress issue?
      → Yes → Show NOW first, suggest "Resume"
      → No →
        Is there a triaged NEXT item?
          → Yes → Show NEXT, suggest "Start"
          → No → Run triage, then show results
```

### 2. Communication Channels Matrix

Maps situation → channel → content → automation.

| Situation | Channel | Content | Automation | Muscle Memory |
| --- | --- | --- | --- | --- |
| Daily status | Standup / Slack | What I did, doing, blocked | Draft from triage state | Review draft → send |
| PR ready | GitHub PR | Summary, test plan, risk | Draft from diff + context | Review draft → create PR |
| Blocked | Slack DM / issue comment | What's blocked, who can unblock | Draft from issue + blocker | Review → send |
| Weekly update | Email / doc | Wins, misses, risks | Draft from weekly summary state | Review → send |
| Incident update | Slack channel | Status, impact, next steps | Draft from observe state | Review → post |
| Release announcement | Slack / email | What shipped, impact | Draft from release notes state | Review → send |

**Key Principle**: The system drafts, the human sends. Never auto-post to external channels.

### 3. Collaboration and Handoff Matrix

How work flows between people.

| Handoff | From | To | Trigger | System Support | Artifact |
| --- | --- | --- | --- | --- | --- |
| Task assignment | Lead | IC | Sprint planning | Triage + rank suggestions | Prioritized backlog |
| Code review | Author | Reviewer | PR opened | Risk scan + checklist | Review checklist |
| Review feedback | Reviewer | Author | Comments posted | Summarize + suggest fixes | Fix suggestions |
| Pair request | IC | IC | Stuck signal (30min no commit) | Suggest pair, surface context | Context summary |
| Escalation | IC | Lead | Blocker >24h | Auto-flag in WAITING, notify | Blocker summary |
| Release handoff | IC | Ops/Lead | All PRs merged | Readiness checklist | Release notes |
| Incident handoff | On-call | IC | Alert classified | Route to owner with context | Incident brief |

### 4. Feedback Loops Matrix

How output from later stages feeds back into earlier stages.

```
Observe → Plan: Incident patterns → risk list for next sprint
Review → Execute: PR feedback patterns → code quality rules
Ship → Plan: Release frequency → capacity planning
Career → Plan: Growth gaps → stretch work allocation
Weekly → Daily: Missed items → higher priority next week
```

| Loop | From Stage | To Stage | Signal | State Written | When |
| --- | --- | --- | --- | --- | --- |
| Incident → Prevention | Observe | Plan | Recurring incident type | `riskPatterns[]` | After incident close |
| Review → Quality | Review | Execute | Repeated PR feedback | `qualityRules[]` | After PR merge |
| Velocity → Capacity | Ship | Plan | Release frequency trend | `velocityTrend` | After each release |
| Growth → Allocation | Career | Plan | No stretch work >60d | `growthFlags[]` | Monthly check |
| Carry-over → Priority | Weekly | Daily | Unfinished items | `carriedOver[]` | End of week |

### 5. Context Switching Matrix

How the system preserves and restores context.

| Switch Type | Trigger | Context Lost | System Preserves | Restore Action |
| --- | --- | --- | --- | --- |
| Branch switch | `git checkout` | Active issue, mental model | Branch → issue mapping, last file, last action | Auto-show linked issue on switch |
| Meeting interrupt | Calendar event | Current task state | Snapshot: open files, issue, branch | "Resume" button restores snapshot |
| Day boundary | Next morning | Yesterday's context | Triage state persisted, NOW bucket | Auto-load on app open |
| Sprint boundary | Sprint end | Previous sprint context | Weekly summary persisted | Weekly review screen |
| Incident interrupt | Alert fires | Current task | Push current context to stack | "Back to task" after resolution |

**Muscle Memory**: `1` → Plan always shows where you left off. The NOW bucket is your "current stack."

### 6. AI Interaction Patterns Matrix

How to work with Codex/Claude effectively.

| Pattern | When | Prompt Shape | Trust Level | Gate |
| --- | --- | --- | --- | --- |
| Summarize | Triage, status update | "Given these issues, rank by…" | High — factual | Confirm ranking |
| Draft | PR, release notes, status | "Given this diff, draft…" | Medium — needs editing | Review + edit |
| Classify | Bug triage, signal routing | "Given this error, classify as…" | Medium — may misclassify | Confirm classification |
| Suggest | Stuck, code review | "Given this code, suggest…" | Low — needs judgment | Choose or reject |
| Execute | Small code change, test | "Given this spec, implement…" | Low — needs review | Review + test |
| Decide | Architecture, security | Never | None — human only | Human decides |

**Automation Mode Escalation**

```
Assist (default) → Guided (after 3 confirmed assists) → Auto (explicit opt-in per task type)
```

Trust is earned per task type, not globally. The system tracks confirmation rate per pattern and suggests mode upgrades when confidence is high.

## Reactive Workflow Model

### Why Not Just Schedules

| Model | Good For | Bad For |
| --- | --- | --- |
| Rrule schedule | Periodic rituals (daily triage, weekly review) | Responsive work (PR opened, issue changed) |
| Event-driven | Responsive work | Periodic rituals |
| Chain | Multi-step workflows | Simple one-shots |
| **Hybrid (all three)** | **Everything** | — |

### Workflow Definition

A workflow is: **trigger** → **steps** → **state** → **display** → **gate**.

```toml
# Example: PR Risk Scan workflow
[workflow.pr-risk-scan]
trigger = { event = "pr.opened" }
steps = [
  { action = "diff.summarize", output = "summary" },
  { action = "risk.classify", input = "summary", output = "risks" },
  { action = "checklist.generate", input = "risks", output = "checklist" },
]
state = { section = "prRiskCheck", key = "pr.{number}" }
display = { stage = "review", component = "RiskChecklist" }
gate = "review"  # human must review before posting
```

```toml
# Example: Daily Triage workflow (hybrid: schedule + event)
[workflow.daily-triage]
trigger = [
  { schedule = "FREQ=DAILY;BYHOUR=9" },
  { event = "app.opened", condition = "triage.stale > 1h" },
]
steps = [
  { action = "jira.fetchSprintIssues", output = "issues" },
  { action = "triage.categorize", input = "issues", output = "triaged" },
]
state = { section = "triage" }
display = { stage = "plan", component = "WorklistSection" }
gate = "confirm"
chain = ["daily-focus"]  # triggers daily focus after triage
```

```toml
# Example: Daily Focus workflow (chained from triage)
[workflow.daily-focus]
trigger = { chain = "daily-triage" }
steps = [
  { action = "ai.summarize", input = "triage", prompt = "Top 3 priorities and blockers" },
]
state = { section = "dailyFocus" }
display = { stage = "plan", component = "FocusSummary" }
gate = "confirm"
```

### Event Catalog

The full event catalog (~40 events across 13 categories) is defined in `docs/event-system-matrix.md`. Key events for workflow triggers:

| Event | Source | Typical Workflow | Category |
| --- | --- | --- | --- |
| `app.opened` | Webview mount | Load triage, restore context | `app` |
| `issue.transitioned` | Jira webhook or poll | Re-categorize in triage | `issue` |
| `pr.opened` | GitHub webhook or poll | Risk scan + checklist | `pr` |
| `pr.merged` | GitHub webhook or poll | Update velocity, trigger release check | `pr` |
| `branch.switched` | Git hook | Restore linked issue context | `branch` |
| `build.completed` | CI webhook or poll | Update ship readiness | `build` |
| `triage.completed` | Extension | Chain: daily focus regenerates | `triage` |
| `timer.stale` | Internal clock | Re-run stale automation | `timer` |
| `timer.ritual` | Internal clock | Morning/weekly rituals | `timer` |
| `sprint.started` | Jira webhook | Full triage + planning | `sprint` |
| `sprint.ended` | Jira webhook | Weekly summary + carry-over | `sprint` |
| `automation.completed` | Automation runner | Chain to next workflow | `automation` |
| `state.written` | Extension | Notify webview of state change | `state` |

Events support glob-pattern subscriptions (`triage.*`, `*.completed`), capture policies (persist or transient), and queryable storage. The event bus is the nervous system connecting all workflows.

### State Lifecycle

```
Event fires
  → Workflow triggered
  → Steps execute (AI assist where needed)
  → State section written to .claude/state.json
  → File watcher detects change
  → Extension reads state, pushes to webview
  → UI component re-renders
  → Human gate (confirm / review / approve)
  → Optional: chain triggers next workflow
```

## Muscle Memory Design

Muscle memory means: **the same gesture always does the same thing, everywhere.**

### Spatial Consistency

| Zone | Position | Always Contains | Never Changes |
| --- | --- | --- | --- |
| Stage Rail | Left edge | Plan/Execute/Review/Ship/Observe | Position, order |
| Worklist | Center | NOW/NEXT/WAITING (or stage equivalent) | Three-bucket layout |
| Action Stack | Right edge | Primary + 1-3 secondary actions | Position, primary on top |
| Context | Below or right of worklist | Details for selected item | Expand/collapse behavior |
| AI Assist | Inline or overlay | Suggestions, drafts | Always dismissable |

### Gesture Consistency

| Gesture | Always Does | Stage-Specific Variation |
| --- | --- | --- |
| `1-5` | Switch stage | — |
| `Enter` | Run primary action | Plan: Start task. Execute: Resume. Review: Address. Ship: Release. Observe: Respond. |
| `Shift+Enter` | Run secondary action | Context-dependent |
| `Escape` | Dismiss / go back | Close detail, dismiss AI suggestion, cancel action |
| Click item | Select + show detail | Issue row → issue detail. PR row → PR detail. Alert row → alert detail. |
| Click item again | Navigate to full view | `/review/issues/{KEY}`, external link, etc. |

### Interaction Rhythm

Every stage follows the same rhythm:

```
1. See the list (auto-loaded, never empty after first use)
2. Pick an item (click or keyboard)
3. See the detail (context expands)
4. Take the action (Enter = primary)
5. See the result (state updates, list refreshes)
```

This is the **See → Pick → Detail → Act → Result** loop. It repeats identically across all stages. The content changes; the rhythm never does.

### Progressive Trust

Automations follow the same muscle memory escalation:

```
First time:  System drafts → User reviews every detail → Confirm
After 5x:   System drafts → User skims → Confirm
After 20x:  System drafts → User glances → Auto-approve available
Opt-in:     System executes → User notified after
```

The user's interaction pattern stays the same (see draft → confirm). What changes is how much attention they need to pay. Trust is earned per workflow, tracked in state.

### Ritual Anchoring

Rituals create temporal muscle memory:

| Time | Ritual | Gesture | Duration |
| --- | --- | --- | --- |
| Morning | Open app → triage loads → pick top task | `1` → scan NOW → `Enter` | 2 min |
| Mid-day | Check progress → address blockers | `1` → scan WAITING → act | 1 min |
| End of day | Quick review → note carry-over | `3` → scan PRs → close | 2 min |
| Friday | Weekly review auto-generated → approve | `1` → Weekly tab → review → send | 5 min |
| Sprint start | Full triage → plan sprint | `1` → Run Triage → sequence | 15 min |

**The system trains the ritual by making the first gesture always available.** Open the app → your current state is there. No setup, no clicks to get to "ready."

## Attribution Model

How automations map to the dynamic processes they serve:

| Process | Ritual | Workflows Involved | State Sections | Display |
| --- | --- | --- | --- | --- |
| Daily execution | Morning triage + evening review | `daily-triage` → `daily-focus` | `triage`, `dailyFocus` | Plan daily |
| Code quality | PR review cycle | `pr-risk-scan` → `review-feedback` | `prRiskCheck` | Review page |
| Team communication | Standup, async updates | `status-draft` | `statusDraft` | Communication overlay |
| Sprint management | Planning, grooming, retro | `sprint-triage` → `weekly-summary` | `triage`, `weeklyReview` | Plan weekly |
| Release management | Ship cycle | `release-readiness` → `release-notes` | `releaseNotes`, `shipReadiness` | Ship page |
| Incident response | Alert → triage → resolve | `alert-classify` → `incident-route` | `activeIncident` | Observe page |
| Career growth | Monthly reflection | `growth-check` | `careerGrowth` | Career page |

Each process is not a single automation — it is a **workflow chain** composed of reactive steps. The user doesn't think about automations. They think about rituals and the system handles the rest.

## Adaptive AI System

### Why Static Schedules Are Not Enough

Work is cyclical but not clockwork. Sprints vary. Some weeks have incidents. Some days have no PRs. A unified AI system must adapt to the actual rhythm, not a prescribed one.

**The three problems with pure scheduling:**

1. **Waste**: Running daily-focus at 9am when you didn't work yesterday produces noise.
2. **Lag**: Waiting for the weekly summary on Friday misses a mid-week blocker escalation.
3. **Rigidity**: Rrule can't express "after triage AND before standup AND only if there are blocked items."

### Dynamic Process Model

Instead of scheduling automations, the system models **processes** that have phases, transitions, and conditions.

```
Process: Daily Execution
  Phase 1: Orient (morning)
    Condition: app opened OR triage stale >1h
    Action: run triage, generate focus
    Transition: → Phase 2 when user picks a task

  Phase 2: Execute (working hours)
    Condition: active task exists
    Action: track context, watch for stuck signals
    Transition: → Phase 3 when PR opened OR end of day

  Phase 3: Close (evening)
    Condition: end of day OR all tasks done
    Action: generate carry-over, update weekly state
    Transition: → Phase 1 next morning
```

```
Process: Sprint Cycle
  Phase 1: Plan (sprint start)
    Condition: new sprint detected
    Action: full triage, capacity check, generate sprint focus
    Transition: → Phase 2 after planning

  Phase 2: Execute (mid-sprint)
    Condition: sprint active
    Action: daily processes run, track velocity
    Transition: → Phase 3 at 80% sprint elapsed

  Phase 3: Close (sprint end)
    Condition: sprint ending
    Action: generate weekly summary, flag carry-over, prep retro data
    Transition: → Phase 1 next sprint
```

### Unified AI Agent Model

The system is not a collection of automations. It is a **single AI agent** that understands:

| What It Knows | How It Knows | What It Does |
| --- | --- | --- |
| Current phase of each process | State file + event stream | Runs the right workflow at the right time |
| What you're working on | Branch → issue mapping, active task | Provides relevant context, not generic suggestions |
| What's blocked | Triage state, WAITING bucket | Surfaces blockers proactively |
| What changed since last check | Event log, state diffs | Only shows what's new, not what you've seen |
| Your patterns | Confirmation rate, action timing | Adapts automation mode (assist → guided → auto) |
| The team's rhythm | Sprint cadence, standup time, PR velocity | Times its outputs to match team rituals |

### Adaptive Triggers

Replace rigid rrule with conditions:

| Instead Of | Use |
| --- | --- |
| `FREQ=DAILY;BYHOUR=9` | `app.opened AND triage.stale > 1h` |
| `FREQ=WEEKLY;BYDAY=FR` | `sprint.daysRemaining <= 1 OR friday AND hasActivity` |
| `FREQ=DAILY` for focus | `triage.completed AND NOT dailyFocus.fresh` |
| Fixed interval PR check | `pr.opened OR pr.updated` |
| Fixed interval deploy check | `pr.merged AND allChecksGreen` |

The system still supports rrule as a fallback ("run at least once a day even if no events fire"), but events are the primary trigger.

### Learning Loop

The AI system improves over time by observing the user's behavior:

```
Observe: User always edits the daily focus summary before confirming
  → Learn: Daily focus prompt needs refinement
  → Adapt: Adjust prompt to match user's editing patterns

Observe: User ignores PR risk checklist for small PRs (<50 lines)
  → Learn: Small PRs don't need risk scan
  → Adapt: Only trigger risk scan for PRs > threshold

Observe: User always re-triages after standup
  → Learn: Standup is the natural triage trigger
  → Adapt: Auto-triage after standup time window

Observe: User drags issues between NOW/NEXT/WAITING
  → Learn: User's priority differs from status-based bucketing
  → Adapt: Persist manual overrides, factor into future triage
```

State tracks these adaptations:

```json
{
  "adaptations": {
    "dailyFocus": { "confirmRate": 0.6, "avgEdits": 2.1, "mode": "assist" },
    "prRiskScan": { "confirmRate": 0.95, "skipThreshold": 50, "mode": "guided" },
    "triage": { "preferredTime": "10:15", "manualOverrides": 3, "mode": "assist" }
  }
}
```

### The Unified Loop

Everything connects in one adaptive cycle:

```
Events fire (git, Jira, GitHub, time, user action)
  → Process engine evaluates: which process, which phase, which condition met?
  → Workflow executes: steps run, AI assists where needed
  → State updates: .claude/state.json gets new section data
  → UI reacts: webview re-renders the affected stage
  → User acts: confirm, edit, dismiss, or ignore
  → System learns: update confirmation rates, adapt triggers
  → Cycle continues
```

The user never thinks about automations, schedules, or triggers. They open the app, see their current state, act on it, and the system adapts. That's the muscle memory: **open → see → act → done.**

## Related Docs

- `docs/lifecycle-ui.md` — UI zones and stage layout
- `docs/reminder-ui.md` — Wireframes for reminder screens
- `docs/engineer-work-matrix.md` — Daily job matrix and Codex capability
- `docs/project-management-matrix.md` — Cadence layers and communication
- `docs/automation-runner.md` — TOML-based automation execution engine
