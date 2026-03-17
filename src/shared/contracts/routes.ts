// Re-export from work-shared — platform-agnostic route contracts
// See: repos/work/shared/contracts/routes.ts for the canonical source
export {
  type RouteName,
  type RouteHint,
  type RouteMeta,
  type HashState,
  type DeepLinkInput,
  ROUTE_META,
  DEFAULT_ROUTE_PATH,
  normalizeRoutePath,
  extractIssueKey,
  routeHintToPath,
  stageFromPath,
  sectionFromPath,
  parseRouteHash,
  buildRouteHash,
  buildDeepLinkBase,
  buildDeepLinkUrl,
  buildAppDispatcherPath,
  isAppDispatcherPath,
  resolveRouteFromDeepLink,
} from "work-shared/contracts/routes";
