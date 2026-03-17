import { parseAnyLink } from "@shared/link";

/**
 * Parses a user-entered string into an internal navigation target for the webview router.
 *
 * @deprecated Use `parseAnyLink` from `@shared/link` instead.
 * This thin wrapper exists only for backwards compatibility.
 */
export const parseNavTarget = (raw: string): string | null => {
  const result = parseAnyLink(raw);
  return result?.to ?? null;
};
