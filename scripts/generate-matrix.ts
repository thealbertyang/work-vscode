#!/usr/bin/env bun
/**
 * Generates `docs/agents/app-matrix.md` — the full surface matrix of the app.
 *
 * Reads TypeScript contracts, TOML config, settings registry, universal defaults,
 * and the .claude/ filesystem to produce a complete inventory matching the
 * Registry UI (System > Registry).
 *
 * Surfaces covered:
 *   1. Matrix of matrices (summary card counts matching the UI)
 *   2. Identity / Namespaces
 *   3. Lifecycle Stages + subnav
 *   4. Entry points (link format examples)
 *   5. Platforms + Environments
 *   6. Navigation (routes) with deep link / component / action cross-refs
 *   7. Intents (actions cross-reference)
 *   8. Operations (unified: VS Code commands + RPC methods + IPC commands)
 *   9. Signals (IPC events)
 *  10. Preferences (settings registry with types, env keys, descriptions)
 *  11. Persistence (storage targets)
 *  12. URL State params
 *  13. Intent kinds
 *  14. Deep link matrix
 *  15. Runtime matrix
 *  16. .claude inventory (docs, runbooks, plans, skills)
 *  17. Coverage gaps
 *  18. Module ownership (proposed)
 *
 * Usage:
 *   bun run scripts/generate-matrix.ts
 *   bun run scripts/generate-matrix.ts --json
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf-8");

// ═══════════════════════════════════════════════════════════════════
// Parse contract sources
// ═══════════════════════════════════════════════════════════════════

const kvRe = /(\w+):\s*"([^"]+)"/g;

// -- Routes --
const routesSrc = read("src/shared/contracts/routes.ts");
type RouteEntry = { id: string; path: string; stage?: string; tabLabel?: string; tabHidden?: boolean; redirect?: string };
const routeEntries: RouteEntry[] = [];
const routeMetaSection = routesSrc.match(/export const ROUTE_META = \{([\s\S]*?)\} as const/)?.[1] ?? "";
for (const m of routeMetaSection.matchAll(/(\w+):\s*\{([^}]+)\}/g)) {
  const body = m[2];
  const get = (key: string) => body.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1];
  routeEntries.push({
    id: get("id") ?? m[1],
    path: get("path") ?? "",
    stage: get("stage"),
    tabLabel: get("tabLabel"),
    tabHidden: body.includes("tabHidden: true"),
    redirect: get("redirect"),
  });
}

// -- VS Code commands --
const commandsSrc = read("src/shared/contracts/commands.ts");
const vscodeCommands: { key: string; id: string }[] = [];
for (const m of (commandsSrc.match(/export const VSCODE_COMMANDS = \{([\s\S]*?)\} as const/)?.[1] ?? "").matchAll(kvRe))
  vscodeCommands.push({ key: m[1], id: m[2] });

// -- RPC methods --
const rpcMethods: { key: string; id: string }[] = [];
for (const m of (commandsSrc.match(/export const RPC_METHODS = \{([\s\S]*?)\} as const/)?.[1] ?? "").matchAll(kvRe))
  rpcMethods.push({ key: m[1], id: m[2] });

// -- Actions --
type ActionEntry = { key: string; id: string; vscode?: string; rpc?: string; route?: string };
const actions: ActionEntry[] = [];
for (const m of (commandsSrc.match(/export const ACTIONS = \{([\s\S]*?)\} as const satisfies/)?.[1] ?? "").matchAll(/(\w+):\s*\{([^}]+)\}/g)) {
  const body = m[2];
  const get = (key: string) => {
    const s = body.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1];
    if (s) return s;
    const vr = body.match(new RegExp(`${key}:\\s*VSCODE_COMMANDS\\.(\\w+)`))?.[1];
    if (vr) return vscodeCommands.find((c) => c.key === vr)?.id;
    const rr = body.match(new RegExp(`${key}:\\s*RPC_METHODS\\.(\\w+)`))?.[1];
    if (rr) return rpcMethods.find((r) => r.key === rr)?.id;
    return undefined;
  };
  actions.push({ key: m[1], id: get("id") ?? "", vscode: get("vscode"), rpc: get("rpc"), route: get("route") });
}

// -- IPC events + commands --
const ipcSrc = read("src/shared/contracts/ipc.ts");
const ipcEvents: { key: string; id: string }[] = [];
for (const m of (ipcSrc.match(/export const IPC_EVENTS = \{([\s\S]*?)\} as const/)?.[1] ?? "").matchAll(kvRe))
  ipcEvents.push({ key: m[1], id: m[2] });
const ipcCommands: { key: string; id: string }[] = [];
for (const m of (ipcSrc.match(/export const IPC_COMMANDS = \{([\s\S]*?)\} as const/)?.[1] ?? "").matchAll(kvRe))
  ipcCommands.push({ key: m[1], id: m[2] });

// -- Settings keys --
const settingsSrc = read("src/shared/contracts/settings.ts");
const settingsKeys: { key: string; id: string }[] = [];
for (const m of (settingsSrc.match(/export const SETTINGS_KEYS = \{([\s\S]*?)\} as const/)?.[1] ?? "").matchAll(kvRe))
  settingsKeys.push({ key: m[1], id: m[2] });

// -- Settings registry (detailed) --
const settingsRegSrc = read("src/shared/contracts/settings-registry.ts");
type SettingsRegEntry = { id: string; key: string; type: string; description: string; sensitive: boolean; envKeys: string[] };
const settingsRegistry: SettingsRegEntry[] = [];
// Parse each block in SETTINGS_REGISTRY
const regBlocks = settingsRegSrc.match(/\[SETTINGS_KEYS\.\w+\]:\s*\{[\s\S]*?\},/g) ?? [];
for (const block of regBlocks) {
  const id = block.match(/id:\s*fullKey\(SETTINGS_KEYS\.(\w+)\)/)?.[1];
  const keyMatch = block.match(/key:\s*SETTINGS_KEYS\.(\w+)/)?.[1];
  const key = keyMatch ? settingsKeys.find((s) => s.key === keyMatch)?.id ?? "" : "";
  const type = block.match(/type:\s*"(\w+)"/)?.[1] ?? "string";
  const description = block.match(/description:\s*"([^"]+)"/)?.[1] ?? "";
  const sensitive = block.includes("sensitive: true");
  const envKeysMatch = block.match(/envKeys:\s*\[([^\]]*)\]/)?.[1] ?? "";
  const envKeys = [...envKeysMatch.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (key) settingsRegistry.push({ id: `work.${key}`, key, type, description, sensitive, envKeys });
}

// -- Intent kinds --
const intentSrc = read("src/shared/contracts/intent.ts");
const intentKinds: string[] = [];
for (const m of (intentSrc.match(/export const UNIVERSAL_INTENT_KINDS = \[([\s\S]*?)\] as const/)?.[1] ?? "").matchAll(/"(\w+)"/g))
  intentKinds.push(m[1]);

// -- TOML config: namespaces, stages, platforms, environments, storage, urlState --
const tomlSrc = read("config/universal.toml");
type Namespace = { id: string; prefix: string };
const namespaces: Namespace[] = [];
const nsBlock = tomlSrc.match(/\[namespaces\]\n([\s\S]*?)(?=\n\[)/)?.[1] ?? "";
for (const kv of nsBlock.matchAll(/(\w+)\s*=\s*"([^"]+)"/g))
  namespaces.push({ id: kv[1], prefix: kv[2] });
// Fallback if TOML parsing didn't get them
if (namespaces.length === 0) {
  for (const ns of ["app", "actions", "commands", "events", "routes", "settings"])
    namespaces.push({ id: ns, prefix: "work" });
}

type Stage = { id: string; label: string; icon: string; order: number; defaultRoute: string; subnav: { label: string; path: string }[] };
const stages: Stage[] = [];
for (const m of tomlSrc.matchAll(/\[stages\.(\w+)\]\n([\s\S]*?)(?=\n\[stages\.\w+\]|\n# |\n\[(?!stages))/g)) {
  const id = m[1];
  const body = m[2];
  const label = body.match(/label\s*=\s*"([^"]+)"/)?.[1] ?? id;
  const icon = body.match(/icon\s*=\s*"([^"]+)"/)?.[1] ?? "";
  const order = Number(body.match(/order\s*=\s*(\d+)/)?.[1] ?? "99");
  const defaultRoute = body.match(/defaultRoute\s*=\s*"([^"]+)"/)?.[1] ?? `/${id}`;
  const subnav: { label: string; path: string }[] = [];
  for (const s of body.matchAll(/(\w+)\s*=\s*\{\s*label\s*=\s*"([^"]+)",\s*path\s*=\s*"([^"]+)"/g))
    subnav.push({ label: s[2], path: s[3] });
  stages.push({ id, label, icon, order, defaultRoute, subnav });
}
stages.sort((a, b) => a.order - b.order);

type Platform = { id: string; kind: string; description: string };
const platforms: Platform[] = [];
for (const m of tomlSrc.matchAll(/\[platforms\.(\w+)\]\nkind\s*=\s*"([^"]+)"\ndescription\s*=\s*"([^"]+)"/g))
  platforms.push({ id: m[1], kind: m[2], description: m[3] });

type Environment = { id: string; kind: string; description: string };
const environments: Environment[] = [];
for (const m of tomlSrc.matchAll(/\[environments\.(\w+)\]\nkind\s*=\s*"([^"]+)"\ndescription\s*=\s*"([^"]+)"/g))
  environments.push({ id: m[1], kind: m[2], description: m[3] });

type StorageTarget = { id: string; kind: string; scope: string; description?: string };
const storageTargets: StorageTarget[] = [];
// Parse from defaults.ts for descriptions
const defaultsSrc = read("src/shared/universal/defaults.ts");
for (const m of defaultsSrc.matchAll(/(\w+):\s*\{\s*id:\s*"(\w+)",\s*kind:\s*"(\w+)",\s*scope:\s*"(\w+)",\s*description:\s*"([^"]+)"/g))
  storageTargets.push({ id: m[2], kind: m[3], scope: m[4], description: m[5] });

type UrlStateParam = { id: string; type: string; description: string; history: string; values?: string[] };
const urlStateParams: UrlStateParam[] = [];
for (const m of tomlSrc.matchAll(/\[urlState\.(\w+)\]\n([\s\S]*?)(?=\n\[|\n$)/g)) {
  const id = m[1];
  const body = m[2];
  const type = body.match(/type\s*=\s*"([^"]+)"/)?.[1] ?? "string";
  const description = body.match(/description\s*=\s*"([^"]+)"/)?.[1] ?? "";
  const history = body.match(/history\s*=\s*"([^"]+)"/)?.[1] ?? "replace";
  const valuesMatch = body.match(/values\s*=\s*\[([^\]]*)\]/)?.[1];
  const values = valuesMatch ? [...valuesMatch.matchAll(/"([^"]+)"/g)].map((v) => v[1]) : undefined;
  urlStateParams.push({ id, type, description, history, values });
}

// -- Webview route files --
const routeDir = join(ROOT, "src/webview/src/routes");
const webviewRouteFiles: string[] = [];
function walk(dir: string) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name));
    else if (e.name.endsWith(".tsx")) webviewRouteFiles.push(relative(routeDir, join(dir, e.name)));
  }
}
walk(routeDir);

// -- Handler modules --
const handlerIndex = read("src/extension/handlers/index.ts");
const handlerModules: string[] = [];
for (const m of handlerIndex.matchAll(/create(\w+)Handlers/g)) handlerModules.push(m[1].toLowerCase());
// Deduplicate
const uniqueHandlerModules = [...new Set(handlerModules)];

// -- .claude inventory --
type AgentsInventory = { docs: string[]; runbooks: string[]; plans: string[]; skills: string[] };
const agentsInventory: AgentsInventory = { docs: [], runbooks: [], plans: [], skills: [] };
function listMd(dir: string): string[] {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f !== "README.md");
}
agentsInventory.docs = listMd("docs/agents");
agentsInventory.runbooks = listMd(".claude/runbooks");
agentsInventory.plans = listMd(".claude/plans");
function listSkills(dir: string): string[] {
  const full = join(ROOT, dir);
  if (!existsSync(full)) return [];
  return readdirSync(full, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}
agentsInventory.skills = listSkills(".claude/skills");
const agentsTotal = agentsInventory.docs.length + agentsInventory.runbooks.length + agentsInventory.plans.length + agentsInventory.skills.length;

// ═══════════════════════════════════════════════════════════════════
// Cross-reference analysis
// ═══════════════════════════════════════════════════════════════════

const routeFileSet = new Set(webviewRouteFiles.map((f) => f.replace(/\.tsx$/, "").replace(/\\/g, "/")));
const routesWithComponents = routeEntries.map((r) => {
  const seg = r.path.replace(/^\//, "").replace(/:(\w+)/g, "\\$$1");
  const has = routeFileSet.has(seg) || routeFileSet.has(`${seg}/index`) || routeFileSet.has(seg.replace(/\/\$\w+$/, "/\\$key"));
  return { ...r, hasComponent: has || r.redirect != null };
});
const rpcReferencedByActions = new Set(actions.filter((a) => a.rpc).map((a) => a.rpc));
const orphanedRpc = rpcMethods.filter((r) => !rpcReferencedByActions.has(r.id));
const vscReferencedByActions = new Set(actions.filter((a) => a.vscode).map((a) => a.vscode));
const orphanedVscCommands = vscodeCommands.filter((c) => !vscReferencedByActions.has(c.id));
const primaryRoutes = routeEntries.filter((r) => !r.redirect && !r.tabHidden);
const allRoutes = routeEntries.filter((r) => !r.redirect);
const totalOperations = vscodeCommands.length + rpcMethods.length + ipcCommands.length;


// ═══════════════════════════════════════════════════════════════════
// Space topology: derive from shared topology config
// ═══════════════════════════════════════════════════════════════════

import { DEFAULT_UNIVERSAL_CONFIG } from "../src/shared/universal/defaults";
import { deriveDomain, getLayers, moduleToLayer as _moduleToLayer } from "../src/shared/universal/topology";

const topology = DEFAULT_UNIVERSAL_CONFIG.topology!;
const SPACES = getLayers(topology).map((layer) => ({
  id: layer.id,
  label: layer.label,
  concern: layer.concern ?? "",
  currentModules: layer.modules,
}));
type SpaceDef = (typeof SPACES)[number];

// Map current modules → space
const moduleToSpace = new Map<string, string>();
for (const space of SPACES) for (const m of space.currentModules) moduleToSpace.set(m, space.id);

// Aggregate surfaces per space from the proposed module ownership
type SpaceAgg = SpaceDef & {
  routes: string[]; commands: string[]; rpc: string[]; actions: string[];
  events: string[]; settings: string[]; total: number;
};

// Build module ownership first (same logic as before)
type Mod = { id: string; routes: string[]; commands: string[]; rpc: string[]; actions: string[]; events: string[]; settings: string[] };
const mods = new Map<string, Mod>();
const mod = (id: string) => { if (!mods.has(id)) mods.set(id, { id, routes: [], commands: [], rpc: [], actions: [], events: [], settings: [] }); return mods.get(id)!; };

for (const r of routeEntries) { if (r.redirect) continue; mod(r.stage ?? r.id.split(/(?=[A-Z])/)[0].toLowerCase()).routes.push(r.id); }
for (const a of actions) { const p = a.id.split("."); mod(p.length >= 3 ? p[1] : p[1] ?? "app").actions.push(a.id); }

const rpcMap: Record<string, string> = {
  getTheme: "theme", setTheme: "theme", onThemeChange: "theme",
  registerChannel: "messages", unregisterChannel: "messages", sendMessage: "messages", addMessageListener: "messages", rmMessageListener: "messages",
  axiosGet: "http", axiosPost: "http", axiosPut: "http", axiosDelete: "http",
  saveApiToken: "auth", disconnect: "auth",
  getIssue: "issues", listIssues: "issues", openIssueInBrowser: "issues",
  getTriageState: "triage", runTriage: "triage",
  getDocsIndex: "docs", getDocContent: "docs", revealDocAsset: "docs", openDocInEditor: "docs",
  openSettings: "settings", syncEnvToSettings: "dev", reinstallExtension: "dev", runDevWebview: "dev",
  restartExtensionHost: "dev", reloadWebviews: "dev", startTaskTerminal: "dev",
  buildExtension: "dev", buildWebview: "dev",
  getAutomations: "automations", getAutomationRuns: "automations",
  getUniversalConfig: "universal", getFullConfig: "config",
  showInformation: "app", execCommand: "app", getState: "app", onDidOpenTextDocument: "app",
};
for (const r of rpcMethods) mod(rpcMap[r.id] ?? "app").rpc.push(r.id);
for (const c of vscodeCommands) {
  const s = c.id.replace("work.", "");
  const m = s.match(/issue/i) ? "issues" : s.match(/dev|webview|reinstall|restart|reload|sync/i) ? "dev" : s.match(/login|logout/i) ? "auth" : "app";
  mod(m).commands.push(c.id);
}
for (const e of ipcEvents) mod("app").events.push(e.id);
const setMap: Record<string, string> = { baseUrl: "auth", jiraUrl: "issues", email: "auth", apiToken: "auth", jql: "issues", maxResults: "issues", docsPath: "docs", webviewPath: "dev", webviewServerUrl: "dev" };
for (const s of settingsKeys) mod(setMap[s.id] ?? "app").settings.push(`work.${s.id}`);

const allModsSorted = [...mods.values()];

// Aggregate into spaces
const spaceAggs: SpaceAgg[] = SPACES.map((space) => {
  const modIds = new Set(space.currentModules);
  const spaceMods = allModsSorted.filter((m) => modIds.has(m.id));
  const agg = {
    ...space,
    routes: spaceMods.flatMap((m) => m.routes),
    commands: spaceMods.flatMap((m) => m.commands),
    rpc: spaceMods.flatMap((m) => m.rpc),
    actions: spaceMods.flatMap((m) => m.actions),
    events: spaceMods.flatMap((m) => m.events),
    settings: spaceMods.flatMap((m) => m.settings),
    total: 0,
  };
  agg.total = agg.routes.length + agg.commands.length + agg.rpc.length + agg.actions.length + agg.events.length + agg.settings.length;
  return agg;
});

// Proposed naming convention mapping
const proposedNames: { current: string; proposed: string; space: string }[] = [
  // kernel
  { current: "work.openApp", proposed: "work.kernel.app.open", space: "kernel" },
  { current: "work.refresh", proposed: "work.kernel.app.refresh", space: "kernel" },
  { current: "showInformation", proposed: "kernel.app.showInformation", space: "kernel" },
  { current: "execCommand", proposed: "kernel.app.execCommand", space: "kernel" },
  { current: "getState", proposed: "kernel.app.getState", space: "kernel" },
  { current: "registerChannel", proposed: "kernel.messaging.register", space: "kernel" },
  { current: "sendMessage", proposed: "kernel.messaging.send", space: "kernel" },
  // identity
  { current: "work.login", proposed: "work.identity.login", space: "identity" },
  { current: "work.logout", proposed: "work.identity.logout", space: "identity" },
  { current: "saveApiToken", proposed: "identity.token.save", space: "identity" },
  { current: "disconnect", proposed: "identity.disconnect", space: "identity" },
  // data
  { current: "axiosGet", proposed: "data.http.get", space: "data" },
  { current: "axiosPost", proposed: "data.http.post", space: "data" },
  // domain
  { current: "work.openIssue", proposed: "work.domain.issue.open", space: "domain" },
  { current: "getIssue", proposed: "domain.issue.get", space: "domain" },
  { current: "listIssues", proposed: "domain.issue.list", space: "domain" },
  { current: "runTriage", proposed: "domain.triage.run", space: "domain" },
  { current: "getAutomations", proposed: "domain.automation.list", space: "domain" },
  // ui
  { current: "getTheme", proposed: "ui.theme.get", space: "ui" },
  { current: "setTheme", proposed: "ui.theme.set", space: "ui" },
  // system
  { current: "openSettings", proposed: "system.settings.open", space: "system" },
  { current: "work.runDevWebview", proposed: "work.system.dev.runWebview", space: "system" },
  { current: "getDocsIndex", proposed: "system.docs.getIndex", space: "system" },
  { current: "getUniversalConfig", proposed: "system.config.get", space: "system" },
];

// ═══════════════════════════════════════════════════════════════════
// Generate markdown
// ═══════════════════════════════════════════════════════════════════

const L: string[] = [];
const h = (level: number, text: string) => L.push(`${"#".repeat(level)} ${text}\n`);
const p = (text: string) => L.push(`${text}\n`);
const table = (headers: string[], rows: string[][]) => {
  L.push(`| ${headers.join(" | ")} |`);
  L.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) L.push(`| ${row.join(" | ")} |`);
  L.push("");
};
const mermaid = (content: string) => { L.push("```mermaid"); L.push(content); L.push("```\n"); };

h(1, "App Surface Matrix");
p("*Auto-generated by `bun run scripts/generate-matrix.ts` — do not edit manually.*\n");
p(`Generated: ${new Date().toISOString().slice(0, 10)}\n`);

// ──────────────────────────────────────────────────────────────
// 1. TOPOLOGY OVERVIEW
// ──────────────────────────────────────────────────────────────

h(2, "Topology");
p("7 canonical **spaces** organize all app surfaces into a consistent, navigable architecture.\n");

mermaid(`graph TB
  K["<b>kernel</b><br/>lifecycle · transport<br/>routing · messaging · intent"]
  I["<b>identity</b><br/>auth · credentials"]
  D["<b>data</b><br/>http · state"]
  DOM["<b>domain</b><br/>issues · triage · automations"]
  UI["<b>ui</b><br/>theme · layout · url-state"]
  W["<b>work</b><br/>plan · execute · review<br/>ship · observe"]
  S["<b>system</b><br/>settings · docs · dev<br/>registry · config"]

  K --> I & D & UI & S
  D --> DOM
  UI --> W
  S -.->|configures| K & I & D & DOM & UI & W`);

table(
  ["Space", "Concern", "Surfaces"],
  spaceAggs.map((s) => [
    `**${s.label}**`,
    s.concern,
    `${s.total} (${[
      s.routes.length && `${s.routes.length} routes`,
      s.commands.length && `${s.commands.length} cmds`,
      s.rpc.length && `${s.rpc.length} rpc`,
      s.actions.length && `${s.actions.length} actions`,
      s.events.length && `${s.events.length} events`,
      s.settings.length && `${s.settings.length} settings`,
    ].filter(Boolean).join(", ")})`,
  ]),
);

// ──────────────────────────────────────────────────────────────
// 2. GRAMMAR
// ──────────────────────────────────────────────────────────────

h(2, "Grammar");
p("The vocabulary of the app surface system:\n");

table(
  ["Term", "Definition", "Example"],
  [
    ["**Space**", "A bounded functionality domain", "`kernel`, `work`, `system`"],
    ["**Intent**", "A canonical meaning URL (`app://`).", "`app://work/route/plan`"],
    ["**Action**", "A resolved intent with concrete effect target(s)", "`{ id: \"work.identity.login\", vscode: \"work.login\" }`"],
    ["**Envelope**", "Transport-agnostic message wrapper", "`{ kind: \"rpc\", method: \"getIssue\" }`"],
    ["**Route**", "A navigation target in the webview router", "`{ path: \"/plan\", stage: \"plan\" }`"],
    ["**Command**", "An imperative operation on the extension host", "`work.openApp`"],
    ["**RPC**", "A request/response method across the IPC bridge", "`getIssue` → `IpcEnvelope{kind:\"rpc\"}`"],
    ["**Signal**", "An observable event emitted from webview", "`work.webview.ready`"],
    ["**Setting**", "A typed configuration knob with env-key binding", "`work.baseUrl` → `WORK_BASE_URL`"],
    ["**Storage**", "A persistence target with kind + scope", "`{ id: \"secrets\", kind: \"secrets\", scope: \"global\" }`"],
    ["**Stage**", "A lifecycle phase in the app", "`plan → execute → review → ship → observe`"],
  ],
);

// ──────────────────────────────────────────────────────────────
// 3. NAMING CONVENTIONS
// ──────────────────────────────────────────────────────────────

h(2, "Naming Conventions");
p("Consistent `<space>.<noun>.<verb>` pattern:\n");
p("```");
p("Commands:  work.<space>.<noun>.<verb>     e.g. work.kernel.app.open");
p("Actions:   work.<space>.<noun>.<verb>     e.g. work.identity.login");
p("RPC:       <space>.<noun>.<verb>               e.g. domain.issue.get");
p("Events:    work.<noun>.<event>             e.g. work.webview.ready");
p("Settings:  work.<key>                      e.g. work.baseUrl");
p("Routes:    /<stage>/<sub>                       e.g. /plan/weekly");
p("Intents:   app://work/<kind>/<path>        e.g. app://work/route/plan");
p("```\n");

h(3, "Proposed Renames (sample)");
table(
  ["Current", "Proposed", "Space"],
  proposedNames.map((n) => [`\`${n.current}\``, `\`${n.proposed}\``, n.space]),
);

// ──────────────────────────────────────────────────────────────
// 4. CURRENT → COALESCED MAPPING
// ──────────────────────────────────────────────────────────────

h(2, "Current → Coalesced Mapping");
p(`18 current modules → 7 canonical spaces:\n`);

const moduleRows: string[][] = [];
for (const space of SPACES) {
  for (const modId of space.currentModules) {
    const m = mods.get(modId);
    if (!m) { moduleRows.push([`\`${modId}\``, `**${space.label}**`, "-"]); continue; }
    const surfaces = [
      m.routes.length && `${m.routes.length} routes`,
      m.commands.length && `${m.commands.length} cmds`,
      m.rpc.length && `${m.rpc.length} rpc`,
      m.actions.length && `${m.actions.length} actions`,
      m.events.length && `${m.events.length} events`,
      m.settings.length && `${m.settings.length} settings`,
    ].filter(Boolean).join(", ") || "-";
    moduleRows.push([`\`${modId}\``, `**${space.label}**`, surfaces]);
  }
}
table(["Current Module", "→ Space", "Surfaces"], moduleRows);

// ──────────────────────────────────────────────────────────────
// 5. PER-SPACE DETAIL
// ──────────────────────────────────────────────────────────────

for (const space of spaceAggs) {
  h(2, `Space: ${space.label} (${space.total} surfaces)`);
  p(`*${space.concern}*\n`);
  p(`Modules: ${space.currentModules.map((m) => `\`${m}\``).join(", ")}\n`);

  if (space.routes.length) {
    h(3, "Routes");
    table(
      ["ID", "Path", "Stage", "Tab"],
      space.routes.map((rid) => {
        const r = routeEntries.find((re) => re.id === rid);
        return r ? [`\`${r.id}\``, `\`${r.path}\``, r.stage ?? "-", r.tabLabel ?? (r.tabHidden ? "hidden" : "-")] : [rid, "-", "-", "-"];
      }),
    );
  }

  if (space.commands.length) {
    h(3, "Commands");
    table(
      ["Key", "Command ID"],
      space.commands.map((cid) => {
        const c = vscodeCommands.find((vc) => vc.id === cid);
        return c ? [`\`${c.key}\``, `\`${c.id}\``] : ["-", `\`${cid}\``];
      }),
    );
  }

  if (space.rpc.length) {
    h(3, "RPC Methods");
    table(
      ["Method", "Has Action"],
      space.rpc.map((rid) => {
        const hasAction = rpcReferencedByActions.has(rid);
        return [`\`${rid}\``, hasAction ? "yes" : "orphan"];
      }),
    );
  }

  if (space.actions.length) {
    h(3, "Actions");
    table(
      ["Action ID", "Route", "VS Code Cmd", "RPC"],
      space.actions.map((aid) => {
        const a = actions.find((ac) => ac.id === aid);
        return a ? [`\`${a.id}\``, a.route ? `\`${a.route}\`` : "-", a.vscode ? `\`${a.vscode}\`` : "-", a.rpc ? `\`${a.rpc}\`` : "-"] : [`\`${aid}\``, "-", "-", "-"];
      }),
    );
  }

  if (space.events.length) {
    h(3, "Signals");
    table(
      ["Event ID", "Direction"],
      space.events.map((eid) => {
        const e = ipcEvents.find((ie) => ie.id === eid);
        return [`\`${e?.id ?? eid}\``, "webview → ext"];
      }),
    );
  }

  if (space.settings.length) {
    h(3, "Settings");
    table(
      ["Setting", "Type", "Sensitive", "Env Keys"],
      space.settings.map((sid) => {
        const sr = settingsRegistry.find((s) => s.id === sid);
        return sr
          ? [`\`${sr.id}\``, sr.type, sr.sensitive ? "yes" : "-", sr.envKeys.length ? sr.envKeys.map((k) => `\`${k}\``).join(", ") : "-"]
          : [`\`${sid}\``, "-", "-", "-"];
      }),
    );
  }
}

// ──────────────────────────────────────────────────────────────
// 6. MERMAID DIAGRAMS
// ──────────────────────────────────────────────────────────────

h(2, "Diagrams");

h(3, "Intent Resolution Flow");
mermaid(`sequenceDiagram
  participant U as User / Link
  participant K as kernel
  participant A as Action Resolver
  participant T as Target

  U->>K: app://work/action/issue/open
  K->>K: parseUniversalIntentUrl()
  K->>A: resolveIntentToAction()
  alt has vscode command
    A->>T: vscode.commands.executeCommand()
  else has rpc method
    A->>T: IpcEnvelope{kind:"rpc", method}
  else has route
    A->>T: navigate(routePath)
  end`);

h(3, "Runtime Topology");
mermaid(`graph LR
  subgraph EXT["Extension Host · Node.js"]
    CMD[Commands]
    RPCH[RPC Handlers]
    STORE[(Storage)]
    SETS[Settings]
  end
  subgraph WV["Webview · Browser"]
    RTR[Router]
    TH[Theme]
    EVT[Events]
    URLS[URL State]
  end
  subgraph BR["Bridge"]
    PM[postMessage]
    WS[WebSocket]
  end

  CMD <-->|IpcEnvelope| PM
  RPCH <-->|JSON-RPC| PM
  PM <--> RTR
  PM <--> EVT
  WS <-.->|dev mode| PM`);

h(3, "Lifecycle Flow");
mermaid(`graph LR
  P["🗓 Plan"] --> E["▶ Execute"] --> R["👁 Review"] --> S["🚀 Ship"] --> O["📊 Observe"]
  O -.->|feedback| P
  SYS["⚙ System"] -.->|settings · tools| P & E & R & S & O`);

h(3, "Data Flow");
mermaid(`flowchart TD
  INT["Intent URL<br/>app://work/..."] --> KER["kernel<br/>parse + resolve"]
  KER --> ACT{Action}
  ACT -->|command| CMD["Extension Host<br/>vscode.commands"]
  ACT -->|rpc| RPC["IPC Bridge<br/>IpcEnvelope"]
  ACT -->|route| NAV["Webview<br/>TanStack Router"]
  CMD --> STORE[("Storage<br/>secrets · state · fs · sqlite")]
  RPC --> WV["Webview<br/>useHandlers()"]
  WV -->|signals| RPC
  RPC -->|events| CMD`);

h(3, "Space Dependency Graph");
mermaid(`graph TD
  K[kernel] -->|auth flows| I[identity]
  K -->|fetch calls| D[data]
  K -->|renders| UI[ui]
  K -->|configures| S[system]
  D -->|queries| DOM[domain]
  UI -->|mounts| W[work]
  I -.->|credentials| D
  DOM -.->|displays in| W
  S -.->|settings for| K & I & D & DOM & UI & W`);

// ──────────────────────────────────────────────────────────────
// 7. CROSS-CUTTING SURFACES
// ──────────────────────────────────────────────────────────────

h(2, "Cross-Cutting Surfaces");

h(3, "Identity (Namespaces)");
table(
  ["Namespace", "Prefix"],
  namespaces.map((n) => [`\`${n.id}\``, `\`${n.prefix}\``]),
);

h(3, "Lifecycle Stages");
table(
  ["Stage", "Icon", "Default Route", "Subnav"],
  stages.map((s) => [
    `**${s.label}** (\`${s.id}\`)`,
    s.icon,
    `\`${s.defaultRoute}\``,
    s.subnav.length ? s.subnav.map((n) => `${n.label} → \`${n.path}\``).join(", ") : "-",
  ]),
);

h(3, "Entry Points");
p("Link format examples for `/plan`:\n");
table(
  ["Format", "Example"],
  [
    ["Canonical intent", "`app://work/route/plan`"],
    ["Dispatcher (/app)", "`vscode-insiders://ext/app/work/route/plan`"],
    ["Web URL (hash)", "`http://localhost:5173/#/app/work/route/plan`"],
    ["Legacy deep link", "`vscode-insiders://ext/open/plan`"],
    ["IPC", "`webview.postMessage` (JSON-RPC + IpcEnvelope)"],
    ["WS bridge", "`ws://127.0.0.1:5174/?token=...`"],
  ],
);

h(3, "Platforms + Environments");
table(
  ["ID", "Kind", "Description"],
  [...platforms.map((p) => [`\`${p.id}\``, p.kind, p.description]), ...environments.map((e) => [`\`${e.id}\``, e.kind, e.description])],
);

h(3, "Persistence (Storage Targets)");
table(
  ["ID", "Kind", "Scope", "Description"],
  storageTargets.map((t) => [`\`${t.id}\``, t.kind, t.scope, t.description ?? ""]),
);

h(3, "URL State Params");
table(
  ["Param", "Type", "History", "Values", "Description"],
  urlStateParams.map((u) => [
    `\`${u.id}\``,
    u.type,
    u.history,
    u.values ? u.values.map((v) => `\`${v}\``).join(", ") : "-",
    u.description,
  ]),
);

h(3, "Universal Intent Kinds");
const intentExamples: Record<string, string> = {
  route: "app://work/route/plan", doc: "app://work/doc/docs/routing-matrix.md",
  runbook: "app://work/runbook/release-promotion", plan: "app://work/plan/2026-02-06-universal-config-plan",
  skill: "app://work/skill/release-promotion", automation: "app://work/automation/skill-triage",
  command: "app://work/command/openApp", rpc: "app://work/rpc/getUniversalConfig",
  action: "app://work/action/app/open",
};
const intentRuntimes: Record<string, string> = {
  route: "webview", doc: "webview", runbook: "webview", plan: "webview", skill: "webview",
  automation: "extension", command: "extension", rpc: "extension", action: "extension → resolved",
};
table(
  ["Kind", "Example", "Runtime"],
  intentKinds.map((k) => [`\`${k}\``, `\`${intentExamples[k] ?? ""}\``, intentRuntimes[k] ?? "both"]),
);

// ──────────────────────────────────────────────────────────────
// 8. FULL REFERENCE: OPERATIONS
// ──────────────────────────────────────────────────────────────

h(2, `Operations Reference (${totalOperations} total)`);

h(3, `VS Code Commands (${vscodeCommands.length})`);
table(
  ["Key", "Command ID", "Space", "Has Action"],
  vscodeCommands.map((c) => {
    const modName = c.id.replace("work.", "");
    const modId = modName.match(/issue/i) ? "issues" : modName.match(/dev|webview|reinstall|restart|reload|sync/i) ? "dev" : modName.match(/login|logout/i) ? "auth" : "app";
    return [`\`${c.key}\``, `\`${c.id}\``, moduleToSpace.get(modId) ?? "?", vscReferencedByActions.has(c.id) ? "yes" : "no"];
  }),
);

h(3, `RPC Methods (${rpcMethods.length})`);
table(
  ["Key", "Method", "Space", "Has Action"],
  rpcMethods.map((r) => {
    const modId = rpcMap[r.id] ?? "app";
    return [`\`${r.key}\``, `\`${r.id}\``, moduleToSpace.get(modId) ?? "?", rpcReferencedByActions.has(r.id) ? "yes" : "orphan"];
  }),
);

h(3, `IPC Commands (${ipcCommands.length})`);
table(
  ["Key", "Command ID", "Direction"],
  ipcCommands.map((c) => [`\`${c.key}\``, `\`${c.id}\``, "ext → webview"]),
);

h(3, `IPC Events / Signals (${ipcEvents.length})`);
table(
  ["Key", "Event ID", "Direction"],
  ipcEvents.map((e) => [`\`${e.key}\``, `\`${e.id}\``, "webview → ext"]),
);

// ──────────────────────────────────────────────────────────────
// 9. FULL REFERENCE: NAVIGATION
// ──────────────────────────────────────────────────────────────

h(2, `Navigation Reference (${routeEntries.length} routes)`);

table(
  ["ID", "Path", "Stage", "Space", "Redirect", "Deep Linkable"],
  routesWithComponents.map((r) => [
    `\`${r.id}\``,
    `\`${r.path}\``,
    r.stage ?? "-",
    moduleToSpace.get(r.stage ?? r.id.split(/(?=[A-Z])/)[0].toLowerCase()) ?? "?",
    r.redirect ? `\`${r.redirect}\`` : "-",
    !r.redirect && !r.tabHidden ? "yes" : r.redirect ? "redirect" : "hidden",
  ]),
);

h(3, "Deep Link Matrix");
p("Non-redirect routes with all link formats:\n");
table(
  ["Route", "Hash URL", "Dispatcher Path", "Canonical Intent"],
  allRoutes.map((r) => {
    const path = r.path.replace(/:(\w+)/g, "{$1}");
    return [`\`${r.id}\``, `\`#${path}\``, `\`/app/work/route${path}\``, `\`app://work/route${path}\``];
  }),
);

// ──────────────────────────────────────────────────────────────
// 10. FULL REFERENCE: PREFERENCES
// ──────────────────────────────────────────────────────────────

h(2, `Preferences Reference (${settingsRegistry.length})`);
table(
  ["Setting ID", "Type", "Space", "Sensitive", "Env Keys", "Description"],
  settingsRegistry.map((s) => [
    `\`${s.id}\``,
    s.type,
    moduleToSpace.get(setMap[s.key] ?? "app") ?? "?",
    s.sensitive ? "yes" : "-",
    s.envKeys.length ? s.envKeys.map((k) => `\`${k}\``).join(", ") : "-",
    s.description,
  ]),
);

// ──────────────────────────────────────────────────────────────
// 11. RUNTIME MATRIX
// ──────────────────────────────────────────────────────────────

h(2, "Runtime Matrix");
table(
  ["Surface", "Extension Host (Node.js)", "Webview (Browser)", "WS Bridge", "HTTP App Router"],
  [
    ["Routes", "-", "TanStack Router", "IPC NAVIGATE", "302 redirect"],
    ["VS Code Commands", "`vscode.commands`", "-", "IPC command", "HTTP POST"],
    ["RPC Methods", "JSON-RPC handler", "`useHandlers()`", "JSON-RPC over WS", "HTTP POST"],
    ["Actions", "resolves → cmd/rpc/route", "resolves → navigate/rpc", "resolves via bridge", "HTTP POST"],
    ["IPC Events", "receives + captures", "emits", "forwarded", "-"],
    ["IPC Commands", "sends", "receives + acts", "forwarded", "-"],
    ["Settings", "`vscode.workspace`", "reads via RPC", "-", "-"],
    ["Storage", "Node.js fs/sqlite/secrets", "localStorage/IDB/state", "-", "-"],
    ["Deep Links", "URI handler → resolve", "hash router", "-", "app router classify"],
  ],
);

// ──────────────────────────────────────────────────────────────
// 12. _AGENTS INVENTORY
// ──────────────────────────────────────────────────────────────

h(2, `.claude Inventory (${agentsTotal})`);
table(["Group", "Count", "Files"], [
  ["docs", String(agentsInventory.docs.length), agentsInventory.docs.join(", ")],
  ["runbooks", String(agentsInventory.runbooks.length), agentsInventory.runbooks.join(", ")],
  ["plans", String(agentsInventory.plans.length), agentsInventory.plans.join(", ")],
  ["skills", String(agentsInventory.skills.length), agentsInventory.skills.join(", ")],
]);

// ──────────────────────────────────────────────────────────────
// 13. COVERAGE GAPS (per space)
// ──────────────────────────────────────────────────────────────

h(2, "Coverage Gaps");

h(3, "Orphaned RPC Methods (no action references them)");
if (orphanedRpc.length === 0) p("None.\n");
else {
  table(
    ["RPC Method", "Space", "Suggested Action"],
    orphanedRpc.map((r) => {
      const modId = rpcMap[r.id] ?? "app";
      const sp = moduleToSpace.get(modId) ?? "?";
      return [`\`${r.id}\``, sp, `\`work.${sp}.${r.id}\``];
    }),
  );
}

h(3, "Routes Without Webview Components");
const routesMissingComponents = routesWithComponents.filter((r) => !r.hasComponent && !r.redirect);
if (routesMissingComponents.length === 0) p("None.\n");
else table(["Route", "Path", "Space"], routesMissingComponents.map((r) => {
  const sp = moduleToSpace.get(r.stage ?? r.id.split(/(?=[A-Z])/)[0].toLowerCase()) ?? "?";
  return [`\`${r.id}\``, `\`${r.path}\``, sp];
}));

h(3, "Primary Routes Missing Actions");
const routesRefByActions = new Set(actions.filter((a) => a.route).map((a) => a.route));
const routesMissingActions = allRoutes.filter((r) => !r.redirect && !r.tabHidden && !routesRefByActions.has(r.id));
if (routesMissingActions.length === 0) p("None.\n");
else table(["Route", "Path", "Space"], routesMissingActions.map((r) => {
  const sp = moduleToSpace.get(r.stage ?? r.id) ?? "work";
  return [`\`${r.id}\``, `\`${r.path}\``, sp];
}));

h(3, "Spaces with Route-Only Surface (no extension host presence)");
const routeOnlySpaces = spaceAggs.filter((s) => s.routes.length > 0 && s.commands.length === 0 && s.rpc.length === 0 && s.actions.length === 0);
if (routeOnlySpaces.length === 0) p("None.\n");
else table(
  ["Space", "Routes", "Gap"],
  routeOnlySpaces.map((s) => [s.label, String(s.routes.length), "No commands, RPC, or actions defined"]),
);

// ═══════════════════════════════════════════════════════════════════
// Output
// ═══════════════════════════════════════════════════════════════════

const markdown = L.join("\n");

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    spaces: spaceAggs.map((s) => ({ id: s.id, label: s.label, concern: s.concern, currentModules: s.currentModules, routes: s.routes, commands: s.commands, rpc: s.rpc, actions: s.actions, events: s.events, settings: s.settings, total: s.total })),
    namespaces, stages, platforms, environments, storageTargets, urlStateParams,
    routes: routeEntries, vscodeCommands, rpcMethods, actions, ipcEvents, ipcCommands,
    settingsRegistry, intentKinds, handlerModules: uniqueHandlerModules, webviewRouteFiles,
    agentsInventory, orphanedRpc: orphanedRpc.map((r) => r.id),
    proposedNames, totalOperations,
  }, null, 2));
} else {
  const outPath = join(ROOT, "docs/agents/app-matrix.md");
  await Bun.write(outPath, markdown);
  console.log(`Written to ${outPath}`);
  console.log(`  Spaces: ${spaceAggs.map((s) => `${s.label}(${s.total})`).join(" · ")}`);
  console.log(`  Total: ${spaceAggs.reduce((sum, s) => sum + s.total, 0)} surfaces across ${SPACES.length} spaces`);
  console.log(`  Gaps: ${orphanedRpc.length} orphaned RPC, ${routesMissingComponents.length} routes missing components, ${routesMissingActions.length} routes missing actions`);
}
