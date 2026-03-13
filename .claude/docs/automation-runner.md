# Automation Runner

This is a repo-local runner that discovers `automation.toml` files, evaluates schedules, and executes tasks by type. It is separate from `~/.codex/automations` and can target any directory.

**Why This Exists**

- Keep automations versioned in your repo.
- Support multiple automation types (command, runbook, prompt).
- Avoid duplicating scripts by executing runbook code blocks directly.

**Quick Start**

```sh
node scripts/automation-runner.mjs --root . --list
node scripts/automation-runner.mjs --root . --once
node scripts/automation-runner.mjs --root . --tick --interval 60
```

**Discovery Rules**

- `automation.toml`
- `*.automation.toml`

**Supported Types**

| Type | Description |
| --- | --- |
| `command` | Run a shell command |
| `runbook` | Run a named block from a Markdown runbook |
| `prompt` | Print a prompt (or run a configured runner command) |

**Common Fields**

```toml
id = "triage"
name = "Issues Triage"
type = "runbook"
status = "ACTIVE"
rrule = "FREQ=HOURLY;INTERVAL=6;BYMINUTE=0"
cwd = "/Users/albertyang/Developer"
cwds = ["/Users/albertyang/Developer", "/Users/albertyang/Other"]
```

**Type: command**

```toml
type = "command"
command = "bun run lint"
cwd = "/Users/albertyang/Developer/repos/vscode/extensions/atlassian"
```

**Type: runbook**

```toml
type = "runbook"
runbook = "docs/runbooks/automation-triage.md"
block = "triage-refresh"
cwd = "/Users/albertyang/Developer/repos/vscode/extensions/atlassian"
```

**Type: prompt**

```toml
type = "prompt"
prompt = "Summarize issues and draft next actions."
runner = "codex" # optional
```

**RRULE Support (Lite)**

Supported fields:
- `FREQ=HOURLY|DAILY|WEEKLY`
- `INTERVAL`
- `BYMINUTE`
- `BYHOUR`
- `BYDAY`

Defaults:
- HOURLY: minute 0
- DAILY/WEEKLY: 09:00 local time

**State Tracking**

By default the runner stores last-run timestamps at:

```
.automation-runner/state.json
```

Override with:

```sh
node scripts/automation-runner.mjs --state /path/to/state.json
```

**Event-Triggered Automations (Future)**

In addition to rrule scheduling, automations can be triggered by events from the universal event system (`docs/event-system-matrix.md`). The runner subscribes to event patterns and evaluates conditions:

```toml
[workflow.pr-risk-scan]
trigger = { event = "pr.opened" }
type = "prompt"
prompt = "Review this PR for risks and generate a checklist."

[workflow.re-triage]
trigger = { event = "issue.transitioned" }
type = "runbook"
runbook = "docs/runbooks/automation-triage.md"
block = "triage-refresh"

[workflow.daily-triage]
trigger = [
  { schedule = "FREQ=DAILY;BYHOUR=9" },
  { event = "app.opened", condition = "triage.stale > 1h" },
]
type = "command"
command = "bun run triage"
```

Three trigger types:

| Type | When | Example |
| --- | --- | --- |
| `schedule` | Rrule cadence | `FREQ=DAILY;BYHOUR=9` |
| `event` | Something happened | `pr.opened`, `branch.switched` |
| `chain` | Previous workflow completed | `daily-triage` → `daily-focus` |

Automations also emit lifecycle events: `automation.triggered`, `automation.completed`, `automation.failed`, `automation.skipped`.

**Recommended Pattern**

- Put automations in repo folders.
- Run them in CI or locally with the runner.
- Use `type=runbook` to avoid duplicate scripts.
- Use event triggers for responsive work, rrule for periodic rituals.

