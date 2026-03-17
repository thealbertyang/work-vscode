export const LOGGING_RULES = {
  maxPayloadLength: 2000,
  maxDepth: 6,
  redactKeys: [
    "apiToken",
    "token",
    "accessToken",
    "refreshToken",
    "authorization",
    "password",
    "secret",
    "clientSecret",
  ],
} as const;

const REDACT_KEYS = new Set<string>(LOGGING_RULES.redactKeys);
const MAX_DEPTH = LOGGING_RULES.maxDepth;
const DEFAULT_MAX_LENGTH = LOGGING_RULES.maxPayloadLength;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const redactSensitive = (value: unknown, depth = 0, seen = new WeakSet()): unknown => {
  if (depth > MAX_DEPTH) {
    return "[Truncated]";
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1, seen));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (REDACT_KEYS.has(key)) {
      output[key] = "[REDACTED]";
      continue;
    }
    output[key] = redactSensitive(raw, depth + 1, seen);
  }
  return output;
};

export const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export const formatLogPayload = (value: unknown, maxLength = DEFAULT_MAX_LENGTH): string => {
  const sanitized = redactSensitive(value);
  let text: string;
  if (typeof sanitized === "string") {
    text = sanitized;
  } else {
    try {
      // JSON.stringify can return undefined for top-level undefined/functions/symbols.
      text = JSON.stringify(sanitized) ?? String(sanitized);
    } catch {
      text = String(sanitized);
    }
  }
  if (text.length > maxLength) {
    return `${text.slice(0, maxLength)}…[truncated]`;
  }
  return text;
};
