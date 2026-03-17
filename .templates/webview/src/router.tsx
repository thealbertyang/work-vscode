import { createRouter as createRouterCore } from "@tanstack/react-router";
import { createBrowserHistory, createMemoryHistory, parseHref } from "@tanstack/history";
import { routeTree } from "./routeTree.gen";

const isBrowser = typeof window !== "undefined";

// TanStack's createHashHistory mixes `window.location.search` (base document query)
// into the router search state. In VS Code webviews, the base query contains internal
// parameters (id/parentId/origin/etc.) which should be preserved in the URL but must
// not leak into the app router's search params.
const createHistory = () => {
  if (!isBrowser) {
    return createMemoryHistory({ initialEntries: ["/"] });
  }

  const win = window as any;
  return createBrowserHistory({
    window: win,
    parseLocation: () => {
      // Hash format: "#/path?query#anchor"
      const hashSplit = String(win.location.hash ?? "").split("#").slice(1);
      const pathPart = hashSplit[0] ?? "/";
      const hashEntries = hashSplit.slice(1);
      const hashPart = hashEntries.length === 0 ? "" : `#${hashEntries.join("#")}`;

      // Intentionally ignore `win.location.search` here.
      const href = `${pathPart}${hashPart}`;
      return parseHref(href, win.history.state);
    },
    createHref: (href) => `${win.location.pathname}${win.location.search}#${href}`,
  });
};

export const createAppRouter = () =>
  createRouterCore({
    routeTree,
    history: createHistory(),
    defaultPreload: "intent",
  });

export type AppRouter = ReturnType<typeof createAppRouter>;

export const createRouterInstance = (): AppRouter => createAppRouter();

export const createRouter = createRouterInstance;

export const getRouter = async (): Promise<AppRouter> => createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}
