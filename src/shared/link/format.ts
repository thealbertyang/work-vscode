import { normalizeRoutePath, buildRouteHash } from "../contracts/routes";
import type { ParsedLink } from "./parse-any-link";

export type LinkFormat = "canonical" | "dispatcher" | "deepLink" | "webHash";

export interface FormatOptions {
  /** App identifier for intent URLs. Default: `"work"`. */
  appId?: string;
  /** URI scheme for canonical intent URLs. Default: `"app"`. */
  scheme?: string;
  /** Extension identifier for VS Code deep links. Default: `"albertyang.work"`. */
  extensionId?: string;
}

const DEFAULT_APP_ID = "work";
const DEFAULT_SCHEME = "app";
const DEFAULT_EXTENSION_ID = "albertyang.work";

const buildSearchString = (search: Record<string, string>): string => {
  const entries = Object.entries(search);
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(search).toString()}`;
};

/**
 * Formats a `ParsedLink` into one of the supported output formats.
 *
 * - `canonical`:   `app://work/route/plan?view=compact`
 * - `dispatcher`:  `/app/work/route/plan?view=compact`
 * - `deepLink`:    `vscode://albertyang.work/app/work/route/plan?view=compact`
 * - `webHash`:     `#/plan?view=compact`
 */
export const formatLink = (
  parsed: ParsedLink,
  format: LinkFormat,
  opts?: FormatOptions,
): string => {
  const appId = opts?.appId ?? DEFAULT_APP_ID;
  const scheme = opts?.scheme ?? DEFAULT_SCHEME;
  const extensionId = opts?.extensionId ?? DEFAULT_EXTENSION_ID;

  const path = normalizeRoutePath(parsed.to);
  const qs = buildSearchString(parsed.search);

  switch (format) {
    case "canonical":
      // app://work/route<path>?...
      return `${scheme}://${appId}/route${path}${qs}`;

    case "dispatcher":
      // /app/work/route<path>?...
      return `/app/${appId}/route${path}${qs}`;

    case "deepLink":
      // vscode://extensionId/app/work/route<path>?...
      return `${extensionId.includes("://") ? extensionId : `vscode://${extensionId}`}/app/${appId}/route${path}${qs}`;

    case "webHash":
      // #/plan?view=compact
      return buildRouteHash(path, parsed.search);
  }
};
