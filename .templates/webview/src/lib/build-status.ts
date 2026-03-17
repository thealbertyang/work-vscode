export const formatBuildAge = (timestamp: number | null | undefined): string => {
  if (!timestamp) return "unknown";
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "<1m ago";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`;
  return `${Math.round(diff / 86400000)}d ago`;
};

export const buildStatusVariant = (timestamp: number | null | undefined): "ok" | "warn" | "muted" => {
  if (!timestamp) return "muted";
  const diff = Date.now() - timestamp;
  if (diff < 300000) return "ok"; // < 5 min = green
  if (diff < 1800000) return "warn"; // < 30 min = amber
  return "muted";
};
