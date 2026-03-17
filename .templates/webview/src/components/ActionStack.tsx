import type { ReactNode } from "react";

type ActionStackAction = {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
};

type ActionStackProps = {
  actions: ActionStackAction[];
  context?: ReactNode;
};

export function ActionStack({ actions, context }: ActionStackProps) {
  return (
    <div className="action-stack">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={action.primary ? "action-stack-primary" : "action-stack-secondary"}
          onClick={action.onClick}
          disabled={action.disabled}
        >
          {action.label}
        </button>
      ))}
      {context ? <div className="action-stack-context">{context}</div> : null}
    </div>
  );
}
