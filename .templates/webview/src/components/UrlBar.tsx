import { useEffect, useRef } from "react";

type UrlBarProps = {
  currentPath: string;
  sectionIcon?: string;
  onCopy: () => void;
  onRefresh?: () => void;
  onOpenPalette?: (initialQuery?: string) => void;
  disabled?: boolean;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
};

export function UrlBar({
  currentPath,
  sectionIcon,
  onCopy,
  onRefresh,
  onOpenPalette,
  disabled,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: UrlBarProps) {
  const paletteButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleFocusRequest = () => {
      if (disabled) return;
      paletteButtonRef.current?.focus();
    };
    window.addEventListener("work:urlBarFocus", handleFocusRequest);
    return () => window.removeEventListener("work:urlBarFocus", handleFocusRequest);
  }, [disabled]);

  return (
    <div className="shell-utility-bar">
      <div className="shell-utility-context">
        {sectionIcon ? <span className={`shell-utility-icon codicon ${sectionIcon}`} aria-hidden="true" /> : null}
        <div className="shell-route-chip" aria-label="Current route">
          <span className="shell-route-chip-label">Route</span>
          <code className="shell-route-chip-value">{currentPath}</code>
        </div>
      </div>
      <div className="shell-utility-actions">
        <button
          type="button"
          className="shell-utility-btn"
          disabled={!canGoBack}
          onClick={onGoBack}
          title="Go back"
          aria-label="Go back"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M7.5 2L3.5 6l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
        <button
          type="button"
          className="shell-utility-btn"
          disabled={!canGoForward}
          onClick={onGoForward}
          title="Go forward"
          aria-label="Go forward"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M4.5 2L8.5 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
        <span className="shell-utility-separator" aria-hidden="true" />
        <button
          type="button"
          className="shell-utility-btn"
          onClick={() => onRefresh?.()}
          disabled={disabled}
          title="Refresh"
          aria-label="Refresh"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M13.65 2.35A7.96 7.96 0 008 0C3.58 0 .01 3.58.01 8S3.58 16 8 16c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 018 14 6 6 0 012 8a6 6 0 016-6c1.66 0 3.14.69 4.22 1.78L9 7h7V0l-2.35 2.35z"
            />
          </svg>
        </button>
        {onOpenPalette ? (
          <button
            ref={paletteButtonRef}
            type="button"
            className="shell-utility-btn shell-utility-btn-label"
            onClick={() => onOpenPalette("")}
            disabled={disabled}
            title="Open palette"
            aria-label="Open palette"
          >
            <span className="shell-utility-btn-label-text">Palette</span>
            <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8.5 2a6.5 6.5 0 104.03 11.6l3.43 3.44a1 1 0 001.42-1.42l-3.44-3.43A6.5 6.5 0 008.5 2zm0 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"
              />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          className="shell-utility-btn shell-utility-btn-label"
          onClick={onCopy}
          disabled={disabled}
          title="Copy deep link"
          aria-label="Copy deep link"
        >
          <span className="shell-utility-btn-label-text">Copy link</span>
          <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
