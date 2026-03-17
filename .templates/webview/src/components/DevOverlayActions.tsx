import { formatBuildAge } from "../lib/build-status";

type DevOverlayActionsProps = {
  onRunDevWebview: () => void;
  onReloadWebviews: () => void;
  onReinstallExtension: () => void;
  onRestartExtensionHost: () => void;
  onStartTaskTerminal: () => void;
  lastExtensionBuildAt?: number | null;
  disabled?: boolean;
};

export function DevOverlayActions({
  onRunDevWebview,
  onReloadWebviews,
  onReinstallExtension,
  onRestartExtensionHost,
  onStartTaskTerminal,
  lastExtensionBuildAt,
  disabled,
}: DevOverlayActionsProps) {
  const devActions = [
    { label: "Reload WebViews", icon: "\u{1F504}", onClick: onReloadWebviews, tooltip: "Reload all webview panels" },
    { label: "Restart Extension Hosts", icon: "\u{1F501}", onClick: onRestartExtensionHost, tooltip: "Restart ALL extensions (workbench.action.restartExtensionHost)" },
    { label: "Dev:web", icon: "\u{25B6}\uFE0F", onClick: onRunDevWebview, tooltip: "Start Vite dev server with HMR" },
    { label: "Reinstall", icon: "\u{1F4E6}", onClick: onReinstallExtension, tooltip: "Build + package + install vsix (reload window after)" },
    { label: "Terminal", icon: "\u{1F5A5}\uFE0F", onClick: onStartTaskTerminal, tooltip: "Open a dev task terminal" },
  ];

  return (
    <div className="overlay-dev-section">
      <div className="overlay-actions">
        {devActions.map((action, i) => (
          <button
            key={action.label}
            type="button"
            className="overlay-action tooltip-wrap"
            style={{ "--i": i } as React.CSSProperties}
            onClick={action.onClick}
            disabled={disabled}
            data-tooltip={action.tooltip}
          >
            <span>{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
      <div className="overlay-build-status">
        <span className="overlay-action-icon">{"\u{1F528}"}</span>
        <span>Built {formatBuildAge(lastExtensionBuildAt)}</span>
      </div>
    </div>
  );
}

export { formatBuildAge };
