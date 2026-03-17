type OverlayAction = {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
};

type AppOverlayActionsProps = {
  actions: OverlayAction[];
};

export function AppOverlayActions({ actions }: AppOverlayActionsProps) {
  if (actions.length === 0) return null;

  return (
    <div className="overlay-section">
      <div className="overlay-actions">
        {actions.map((action, i) => (
          <button
            key={action.label}
            type="button"
            className="overlay-action"
            style={{ "--i": i } as React.CSSProperties}
            onClick={action.onClick}
            disabled={action.disabled}
          >
            <span>{action.icon ?? ""}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
