/**
 * Reads CONTRACTS from the Work extension and emits surface.json.
 *
 * Usage: bun run repos/work/vscode/scripts/generate-surface.ts
 * Output: repos/work/vscode/surface.json
 */
import { CONTRACTS } from "../src/shared/contracts/index";
import { APP_NAMESPACE } from "../src/shared/app-identity";
import type { SurfaceEntry } from "work-shared/surface";

const PROJECT = APP_NAMESPACE;
const entries: SurfaceEntry[] = [];

// -- VS Code Commands ---------------------------------------------------------
for (const [_key, id] of Object.entries(CONTRACTS.commands)) {
  entries.push({
    id: id as string,
    layer: "interface",
    domain: "app",
    kind: "command",
    project: PROJECT,
    source: "src/shared/contracts/commands.ts",
    deliveries: ["ui-control"],
    spec: "contract",
    access: { scope: "global", visibility: "public", platforms: ["vscode"] },
  });
}

// -- RPC Methods --------------------------------------------------------------
for (const [_key, method] of Object.entries(CONTRACTS.rpc)) {
  entries.push({
    id: `${APP_NAMESPACE}.rpc.${method as string}`,
    layer: "interface",
    domain: "app",
    kind: "rpc",
    project: PROJECT,
    source: "src/shared/contracts/commands.ts",
    spec: "contract",
    access: { scope: "session", visibility: "internal", platforms: ["server", "client"] },
  });
}

// -- Actions ------------------------------------------------------------------
for (const [_key, action] of Object.entries(CONTRACTS.actions)) {
  const a = action as { id: string; rpc?: string; vscode?: string; route?: string };
  entries.push({
    id: a.id,
    layer: "interface",
    domain: "app",
    kind: "action",
    project: PROJECT,
    source: "src/shared/contracts/commands.ts",
    spec: "contract",
    resolves: a.rpc ? `${APP_NAMESPACE}.rpc.${a.rpc}` : a.vscode,
    access: { scope: "global", visibility: "public", platforms: ["vscode"] },
  });
}

// -- IPC Events ---------------------------------------------------------------
for (const [_key, name] of Object.entries(CONTRACTS.ipc.events)) {
  entries.push({
    id: name as string,
    layer: "protocol",
    domain: "ipc",
    kind: "signal",
    project: PROJECT,
    source: "src/shared/contracts/ipc.ts",
    spec: "contract",
    access: { scope: "session", visibility: "internal", platforms: ["server", "client"] },
  });
}

// -- IPC Commands -------------------------------------------------------------
for (const [_key, name] of Object.entries(CONTRACTS.ipc.commands)) {
  entries.push({
    id: name as string,
    layer: "protocol",
    domain: "ipc",
    kind: "command",
    project: PROJECT,
    source: "src/shared/contracts/ipc.ts",
    spec: "contract",
    access: { scope: "session", visibility: "internal", platforms: ["server", "client"] },
  });
}

// -- Routes -------------------------------------------------------------------
for (const [_key, route] of Object.entries(CONTRACTS.routes)) {
  const r = route as { id: string; path: string; stage?: string; tabLabel?: string };
  entries.push({
    id: `${APP_NAMESPACE}.route.${r.id}`,
    layer: "interface",
    domain: "view",
    kind: "route",
    project: PROJECT,
    source: "src/shared/contracts/routes.ts",
    stage: r.stage as SurfaceEntry["stage"],
    spec: "contract",
    meta: { path: r.path, tabLabel: r.tabLabel },
    access: { scope: "session", visibility: "public", platforms: ["vscode", "web"] },
  });
}

// -- Settings -----------------------------------------------------------------
for (const [_key, setting] of Object.entries(CONTRACTS.settings.registry)) {
  const s = setting as { id: string; key: string; type: string; sensitive?: boolean; envKeys?: string[] };
  entries.push({
    id: s.id,
    layer: "store",
    domain: "config",
    kind: "setting",
    project: PROJECT,
    source: "src/shared/contracts/settings-registry.ts",
    spec: "schema",
    access: {
      scope: "workspace",
      visibility: "public",
      platforms: ["vscode"],
      sensitive: s.sensitive,
    },
    meta: { type: s.type, envKeys: s.envKeys },
  });
}

// -- Write output -------------------------------------------------------------
const outPath = new URL("../surface.json", import.meta.url).pathname;
await Bun.write(outPath, JSON.stringify(entries, null, 2) + "\n");
console.log(`Wrote ${entries.length} entries to ${outPath}`);
