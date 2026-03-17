import type { AnyRoute } from "@tanstack/react-router";

type RouteModule = {
  Route?: AnyRoute;
};

export type TabRoute = {
  segment: string;
  path: string;
  label: string;
  order: number;
};

const routeModules = import.meta.glob("./routes/*/index.tsx", { eager: true }) as Record<
  string,
  RouteModule
>;

const extractSegment = (filePath: string): string | undefined => {
  const match = filePath.match(/\/routes\/([^/]+)\/index\.tsx$/);
  if (match?.[1]) {
    return match[1];
  }
  const altMatch = filePath.match(/\.\/routes\/([^/]+)\/index\.tsx$/);
  return altMatch?.[1];
};

const toPath = (segment: string, route?: AnyRoute): string => {
  const rawPath = route?.options?.fullPath ?? route?.options?.path;
  if (rawPath) {
    return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  }
  return `/${segment}`;
};

const titleCase = (value: string): string =>
  value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

function computeTabs(): TabRoute[] {
  return Object.entries(routeModules)
    .map(([filePath, module]) => {
      const segment = extractSegment(filePath);
      if (!segment) {
        return null;
      }
      const meta = module.Route?.options?.staticData as
        | { tabLabel?: string; tabHidden?: boolean; tabOrder?: number }
        | undefined;
      if (meta?.tabHidden) {
        return null;
      }
      const label = meta?.tabLabel ?? titleCase(segment);
      const order = meta?.tabOrder ?? 0;
      return {
        segment,
        path: toPath(segment, module.Route),
        label,
        order,
      } as TabRoute;
    })
    .filter((value): value is TabRoute => Boolean(value))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export const TAB_ROUTES: TabRoute[] = computeTabs();

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (newModule) {
      window.dispatchEvent(
        new CustomEvent("hmr:tab-routes", { detail: newModule.TAB_ROUTES }),
      );
    }
  });
}
