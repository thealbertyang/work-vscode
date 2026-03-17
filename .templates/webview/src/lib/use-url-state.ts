import {
  createParser,
  parseAsString,
  parseAsStringEnum,
  useQueryState,
  type UseQueryStateReturn,
} from "nuqs";
import type {
  UrlStateConfig,
  UrlStateParam,
  UrlStateHistoryMode,
} from "@shared/universal/types";

/**
 * Build a nuqs parser from a UrlStateParam definition.
 */
function parserForParam(param: UrlStateParam) {
  switch (param.type) {
    case "enum":
      if (param.values && param.values.length > 0) {
        return parseAsStringEnum(param.values as [string, ...string[]]);
      }
      return parseAsString;
    case "boolean":
      return parseAsStringEnum(["true", "false"]);
    case "number":
      // Keep as string in the URL; consumers cast as needed.
      return parseAsString;
    case "string":
    default:
      return parseAsString;
  }
}

/**
 * Dot-separated list parser (e.g. "matrix.entrypoints" <-> ["matrix", "entrypoints"]).
 * Reusable for any param that stores a set of tokens in the URL.
 */
export const parseAsSectionList = createParser({
  parse(query) {
    if (!query) return [];
    return String(query)
      .split(/[.,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
  },
  serialize(values) {
    const items = Array.isArray(values) ? values : [values];
    return items.map((s) => String(s).trim()).filter(Boolean).join(".");
  },
  eq(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  },
});

/**
 * Registry-driven hook for a single URL state parameter.
 *
 * Reads the parameter definition from the `UrlStateConfig` and returns a
 * `useQueryState`-compatible tuple `[value, setValue]`.
 *
 * ```ts
 * const [view, setView] = useUrlParam("view", config.urlState);
 * ```
 */
export function useUrlParam(
  key: string,
  config: UrlStateConfig | undefined,
): UseQueryStateReturn<string, string> {
  const param: UrlStateParam | undefined = config?.[key];
  const parser = param ? parserForParam(param) : parseAsString;
  const defaultValue = param?.default ?? "";
  const history: UrlStateHistoryMode = param?.history ?? "replace";

  return useQueryState(
    key,
    parser.withDefault(defaultValue).withOptions({ history }),
  );
}
