type AppOverlayPillProps = {
  isConnected: boolean;
  shellLabel: string;
  onClick: () => void;
};

export function AppOverlayPill({
  isConnected,
  shellLabel,
  onClick,
}: AppOverlayPillProps) {
  return (
    <button type="button" className="overlay-pill" onClick={onClick}>
      <span className="overlay-action-icon">{isConnected ? "\u{1F7E2}" : "\u{1F7E1}"}</span>
      <span>{isConnected ? "Connected" : "Disconnected"}</span>
      <span className="overlay-pill-label">{shellLabel}</span>
    </button>
  );
}
