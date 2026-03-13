---
paths:
  - "src/shared/contracts/routes.ts"
  - "src/shared/contracts/intent.ts"
  - "src/shared/link/**"
---

- Never pass a dispatcher path (e.g., `/app/atlassian/route/plan`) to `normalizeRoutePath()`. It only handles route paths like `/plan` or `/review/issues/ABC-123`.
- Always check `isAppDispatcherPath(path)` before calling `buildAppDispatcherPath()` to avoid double-wrapping a path that is already in `/app/{appId}/{kind}/...` format.
- `buildDeepLinkUrl()` performs no normalization or validation. Callers must supply a well-formed path (either a route path or a dispatcher path from `buildAppDispatcherPath()`).
- `resolveRouteFromDeepLink()` strips the `/app/{appId}/{kind}/...` dispatcher wrapper and normalizes internally. Do not pre-normalize its input.
- `buildAppDispatcherPath()` calls `normalizeRoutePath()` internally. Do not normalize before passing a route path to it.
- Route paths always start with `/` and never have a trailing slash. Use `normalizeRoutePath()` to enforce this.
- `APP_DISPATCH_KINDS` in routes.ts and `UNIVERSAL_INTENT_KINDS` in intent.ts must stay in sync. When adding a new kind, update both.
