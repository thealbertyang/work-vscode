type PillVariant = "ok" | "warn" | "muted";

type StatusPillProps = {
  variant: PillVariant;
  label: string;
};

export function StatusPill({ variant, label }: StatusPillProps) {
  return <span className={`pill pill-${variant}`}>{label}</span>;
}

type ConnectionPillProps = {
  isConnected: boolean;
};

export function ConnectionPill({ isConnected }: ConnectionPillProps) {
  return (
    <StatusPill
      variant={isConnected ? "ok" : "warn"}
      label={isConnected ? "Connected" : "Not connected"}
    />
  );
}
