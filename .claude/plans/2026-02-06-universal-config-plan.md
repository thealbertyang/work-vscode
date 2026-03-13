# Universal Config + Matrix System Plan

## Intro
This task introduces a universal, config-driven contract layer ("universal") for the Atlassian VS Code extension. The goal is to make actions, commands, routes, events, storage, datasets, and view surfaces centrally defined and overrideable via a single TOML file, enabling modular, low-coupling behavior changes without rewriting code.

## Background
We centralized contracts in `src/shared/contracts` (actions, routes, commands, events, settings, logging, state) and wired universal logging for UI actions. We also updated multiple "matrix" docs to reflect configuration/storage surfaces. The next step is to generalize these contracts into a reusable "universal" registry that can be loaded from TOML and merged with defaults, then exposed to extension + webview.

## Context
Current repo state includes:
- Shared contracts at `src/shared/contracts/*`.
- UI action logging for all webview RPC calls.
- A dev task terminal and task logging.
- New universal scaffolding:
  - `src/shared/universal/*` (types, defaults, merge, registry).
  - `config/universal.toml` (initial config).
  - `UniversalConfigService` (extension loads TOML).
  - RPC `getUniversalConfig`.
  - Webview applies `styles.cssVariables` and uses config to override tab labels/orders.

The user wants:
- A generic "universal" library for configuration, settings, custom values, custom files, datasets, storage (local, db, SQLite, IndexedDB), and namespaces.
- A complete matrix of matrices (meta-matrix describing interactions).
- A central config (TOML) to change app behavior, styles, rules, routes, commands, actions, events, etc.
- Extension + webview to operate around these common grouped actions/commands/events/deep links and support dynamic rulebooks/rulesets.

## What (Scope of Work)
1. **Universal Config Library (Shared):**
   - Types for actions, commands, events, routes, views, objects, datasets, storage targets, rules, rulesets, platforms, environments.
   - Defaults derived from existing contracts.
   - Merge and normalization utilities (TOML overrides merged with defaults).

2. **Config Source + Loader (Extension):**
   - TOML file resolution and parsing.
   - Normalization of config shapes (`id` fields, namespace flattening, map conversions).
   - Expose `getUniversalConfig` via RPC.

3. **Webview Consumption:**
   - Fetch `UniversalConfig`.
   - Apply `styles.cssVariables` to the DOM.
   - Override tab labels/orders/hidden status based on universal routes/views config.

4. **Docs + Matrices:**
   - `docs/universal-matrix.md` as the "matrix of matrices".
   - Update all "matrix" docs to include storage surfaces (settings, secrets, state, file, localStorage, IndexedDB, SQLite, remote DB).

## Why
- Enables centralized control over behavior and UI without scattering constants.
- Ensures strict alignment across extension, webview, IPC, and routing.
- Supports fast iteration: swap config for custom deployments.
- Prepares for future multi-platform usage (web/desktop/remote) with consistent semantics.

## How (Implementation Outline)
1. **Shared Universal Library**
   - `src/shared/universal/types.ts`: all shared types including storage kinds (settings, secrets, state, file, localStorage, indexeddb, sqlite, remoteDb).
   - `src/shared/universal/defaults.ts`: derive defaults from existing contracts (`ROUTE_META`, `ACTIONS`, `RPC_METHODS`, `VSCODE_COMMANDS`, `IPC_EVENTS`).
   - `src/shared/universal/merge.ts`: deep merge for overrides.
   - `src/shared/universal/registry.ts`: `createUniversalRegistry(override?)`.

2. **Config Loader**
   - `src/extension/service/universal-config-service.ts`:
     - Resolve config path (workspace then extension fallback).
     - Parse simple TOML (same style as `automation-runner`).
     - Normalize sectioned TOML into `UniversalConfig`.
   - Expose via handler `getUniversalConfig`.

3. **Extension + Webview Integration**
   - RPC addition: `getUniversalConfig`.
   - Webview: fetch config on load; apply CSS tokens and tab overrides.

4. **Docs**
   - Create `docs/universal-matrix.md`.
   - Update `docs/configuration-matrix.md`, `docs/routing-matrix.md`, and other matrix docs to include the full storage surfaces.
   - Update `.claude/plans/luminous-jingling-thompson.md` to include local storage/IndexedDB/SQLite/remote DB.

## Status (Already Done in Repo)
- Universal config scaffolding added.
- TOML config file added: `config/universal.toml`.
- `getUniversalConfig` RPC handler wired.
- Webview uses universal styles + tab overrides.
- Universal matrix doc created.
- All matrix docs updated with storage surfaces.

## Next Steps (For a Future Agent)
- Decide how far to push config-driven behavior (commands/routes/actions) beyond label/order overrides.
- Add full TOML parsing dependency if needed (`@iarna/toml`).
- Wire routing/action definitions to be fully registry-driven.
- Add rule evaluation engine if we want dynamic rulesets.
