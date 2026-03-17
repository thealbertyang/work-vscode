type StatusDotVariant = "ok" | "warn" | "muted";

type StatusDotProps = {
  variant: StatusDotVariant;
  label?: string;
};

export function StatusDot({ variant, label }: StatusDotProps) {
  return (
    <span className="status-dot-wrap">
      <span className={`status-dot status-dot-${variant}`} />
      {label ? <span className="status-dot-label">{label}</span> : null}
    </span>
  );
}
