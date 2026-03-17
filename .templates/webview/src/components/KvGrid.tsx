export type KvItem = {
  label: string;
  value: string;
  muted?: boolean;
  onCopy?: () => void;
};

type KvGridProps = {
  items: KvItem[];
  variant?: "grid" | "list";
};

export function KvGrid({ items, variant = "grid" }: KvGridProps) {
  if (variant === "list") {
    return (
      <div className="kv-list">
        {items.map((item) => (
          <div key={item.label} className="kv-row">
            <span className="kv-row-label">{item.label}</span>
            <span className={`kv-row-value ${item.muted ? "kv-muted" : ""}`}>
              {item.value}
              {item.onCopy ? (
                <button
                  type="button"
                  className="kv-copy"
                  onClick={item.onCopy}
                  aria-label={`Copy ${item.label}`}
                >
                  copy
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="kv-grid">
      {items.map((item) => (
        <div key={item.label} className="kv">
          <div className="kv-label">{item.label}</div>
          <div className={`kv-value ${item.muted ? "kv-muted" : ""}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
