import { isInternalWrapperQueryKey } from "@shared/link/wrapper-keys";

export { isInternalWrapperQueryKey };

export const sanitizeSearchParams = (params: URLSearchParams): URLSearchParams => {
  const out = new URLSearchParams();
  for (const [k, v] of params.entries()) {
    if (isInternalWrapperQueryKey(k)) continue;
    out.append(k, v);
  }
  return out;
};

export const sanitizeQueryRecord = (
  query?: Record<string, string>,
): Record<string, string> | undefined => {
  if (!query) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (isInternalWrapperQueryKey(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

export const sanitizeSearchString = (search: string): string => {
  const trimmed = String(search ?? "").trim();
  if (!trimmed) return "";
  const raw = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
  const params = sanitizeSearchParams(new URLSearchParams(raw));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

