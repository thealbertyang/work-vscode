export const toSearchParams = (value: unknown): URLSearchParams => {
  if (value instanceof URLSearchParams) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return new URLSearchParams(trimmed.startsWith("?") ? trimmed.slice(1) : trimmed);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)] as [string, string]);
    return new URLSearchParams(entries);
  }

  return new URLSearchParams();
};

