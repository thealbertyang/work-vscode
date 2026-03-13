# Reminder UI Wireframes

These wireframes define the reminder screens for daily, weekly, monthly, quarterly, and career views. The goal is to make the next action obvious and build muscle memory.

**Layout Rules**

1. Primary action is always top-right.
2. Stage rail is always left.
3. Top row shows time horizon and status.

**Daily Focus**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Daily Focus                                        [Start Top Task]  │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ Plan/Exec/Rev │ Now                                │ Action Stack    │
│ Ship/Observe  │ - Fix failing tests                │ 1. Resume Task  │
│               │ - Review PR #124                   │ 2. Run Tests    │
│               │ - Reply to blocker                 │ 3. Open PR      │
│               │                                    │                 │
│               │ Next                               │ Context         │
│               │ - Draft release notes              │ Selected task   │
│               │ - Triage new issues                │ details here    │
│               │                                    │                 │
│               │ Waiting                            │                 │
│               │ - Awaiting review                  │                 │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

**Weekly Review**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Weekly Review                                     [Plan Next Week]   │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ Plan/Exec/Rev │ Wins                               │ Action Stack    │
│ Ship/Observe  │ - Closed 12 issues                 │ 1. Set Goals    │
│               │ - Shipped feature X                │ 2. Groom Backlog│
│               │                                    │ 3. Update Stake │
│               │ Misses                             │                 │
│               │ - Milestone slipped                │ Risks           │
│               │ - Blocker unresolved               │ Top 3 risks     │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

**Monthly Check‑in**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Monthly Check‑in                                   [Re‑align Scope]  │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ Plan/Exec/Rev │ Initiative Progress                │ Action Stack    │
│ Ship/Observe  │ - Initiative A: 70%                │ 1. Adjust Plan  │
│               │ - Initiative B: 40%                │ 2. Move Resources|
│               │                                    │ 3. Update Notes │
│               │ Drift Signals                      │                 │
│               │ - KPI down 2 cycles                │ Context         │
│               │ - Milestone missed                 │ Root causes     │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

**Quarterly Reset**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Quarterly Reset                                   [Commit Next Bets] │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ Plan/Exec/Rev │ KPI Review                         │ Action Stack    │
│ Ship/Observe  │ - Reliability +2.1%                │ 1. Choose Bets  │
│               │ - Activation -0.4%                 │ 2. Set OKRs     │
│               │                                    │ 3. Share Plan   │
│               │ Initiative Scorecard               │                 │
│               │ - A: Green                         │ Risks           │
│               │ - B: Yellow                        │ Biggest gaps    │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

**Career Growth**

```
┌──────────────────────────────────────────────────────────────────────┐
│ Career Growth                                      [Update Goals]    │
├───────────────┬────────────────────────────────────┬─────────────────┤
│ Plan/Exec/Rev │ Skills In Motion                   │ Action Stack    │
│ Ship/Observe  │ - System design                    │ 1. Pick Stretch │
│               │ - Incident response                │ 2. Request Ment |
│               │                                    │ 3. Log Progress |
│               │ Growth Signals                     │                 │
│               │ - No stretch work in 60 days       │ Context         │
│               │ - Limited cross‑team impact        │ Next milestone  │
└───────────────┴────────────────────────────────────┴─────────────────┘
```

**Reactive Data Sources**

Each reminder screen is backed by a state section in `.claude/state.json`. Automations write these sections; the UI reads them reactively.

| Screen | State Section | Data Source | Staleness Rule |
| --- | --- | --- | --- |
| Daily Focus | `triage` | `runTriage()` → Jira sprint issues | Show "Stale" if >1h old |
| Weekly Review | `weeklyReview` | Automation: merged PRs, closed issues, carried-over work | Regenerate end-of-week |
| Monthly Check-in | `monthlyCheckin` | Automation: initiative progress from Jira epics | Regenerate month-end |
| Quarterly Reset | `quarterlyReset` | Automation: KPI data + initiative scoring | Regenerate quarter-end |
| Career Growth | `careerGrowth` | Manual input + automation: stretch work detection | Flag if >60 days stale |

**Reactive Loading Behavior**

All reminder screens follow the same pattern:

1. **Mount**: Read cached state from `.claude/state.json` — display immediately (no empty state).
2. **Staleness check**: Compare `lastUpdatedAt` against threshold. Show subtle indicator if stale.
3. **Refresh**: User clicks "Refresh" or automation writes new data. UI updates via event push.
4. **Empty state**: Only shown when user genuinely has zero data (e.g., no sprint issues after first triage).

**Implemented (Daily Focus)**

The Plan daily page currently implements this pattern:
- Auto-loads persisted triage on mount via `getTriageState()`
- "Run Triage" fetches fresh from Jira, categorizes via `statusToBucket()`, persists to state
- Issues render in NOW/NEXT/WAITING `WorklistSection` components
- Clicking any issue navigates to `/review/issues/{KEY}`

**Keyboard Consistency**

| Key           | Action               |
| ------------- | -------------------- |
| `1`           | Plan                 |
| `2`           | Execute              |
| `3`           | Review               |
| `4`           | Ship                 |
| `5`           | Observe              |
| `Enter`       | Run primary action   |
| `Shift+Enter` | Run secondary action |
| `Escape`      | Dismiss / go back    |

**Muscle Memory Rituals**

Each reminder screen anchors to a temporal ritual. The gesture is always the same:

| Time | Ritual | Gesture | Duration |
| --- | --- | --- | --- |
| Morning | Open app → triage loaded → pick top task | `1` → scan NOW → `Enter` | 2 min |
| Mid-day | Check progress → address blockers | `1` → scan WAITING → act | 1 min |
| End of day | Quick review → note carry-over | `3` → scan PRs → close | 2 min |
| Friday | Weekly review auto-generated → approve | `1` → Weekly tab → review → send | 5 min |
| Sprint start | Full triage → plan sprint | `1` → Run Triage → sequence NEXT | 15 min |

The system trains the ritual by making the first gesture always available. Open the app → your current state is there. No setup required.

**Cyclical Data Flow**

Each reminder screen is both a consumer and producer of state:

```
Daily Focus reads: triage, dailyFocus
Daily Focus produces: carry-over items → feeds into Weekly Review

Weekly Review reads: weeklyReview, carry-over
Weekly Review produces: velocity trend → feeds into Monthly Check-in

Monthly Check-in reads: monthlyCheckin, velocity
Monthly Check-in produces: initiative drift → feeds into Quarterly Reset
```

See `docs/reactive-workflows.md` for the full reactive model.

**Related Docs**

- `docs/reactive-workflows.md` — Reactive automation model and muscle memory patterns
- `docs/project-management-matrix.md` — Cadence layers and communication
- `docs/lifecycle-ui.md` — UI zones and stage layout

