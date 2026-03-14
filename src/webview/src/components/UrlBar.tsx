import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { parseNavTarget } from "../lib/parse-nav-target";

type UrlBarProps = {
  deepLinkUrl: string;
  sectionIcon?: string;
  onNavigate: (path: string) => void;
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
  deepLinkUrl,
  sectionIcon,
  onNavigate,
  onCopy,
  onRefresh,
  onOpenPalette,
  disabled,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: UrlBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const handleFocusRequest = () => {
      if (disabled) return;
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("work:urlBarFocus", handleFocusRequest);
    return () => window.removeEventListener("work:urlBarFocus", handleFocusRequest);
  }, [disabled]);

  const handleClick = useCallback(() => {
    if (!editing) {
      inputRef.current?.select();
    }
  }, [editing]);

  const handleFocus = useCallback(() => {
    setEditing(true);
    setDraft(deepLinkUrl);
  }, [deepLinkUrl]);

  const handleBlur = useCallback(() => {
    setEditing(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (!disabled && onOpenPalette && (e.key === "ArrowDown" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k"))) {
        e.preventDefault();
        onOpenPalette(draft);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const target = parseNavTarget(draft);
        if (!target) return;
        onNavigate(target);
        inputRef.current?.blur();
      }
      if (e.key === "Escape") {
        setEditing(false);
        setDraft(deepLinkUrl);
        inputRef.current?.blur();
      }
    },
    [disabled, draft, deepLinkUrl, onNavigate, onOpenPalette],
  );

  return (
    <div className="url-bar">
      <div className="url-bar-nav">
        <button
          type="button"
          className="url-bar-nav-btn"
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
          className="url-bar-nav-btn"
          disabled={!canGoForward}
          onClick={onGoForward}
          title="Go forward"
          aria-label="Go forward"
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M4.5 2L8.5 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        </button>
      </div>
      <span className="url-bar-nav-sep" />
      {sectionIcon ? <span className={`url-bar-icon codicon ${sectionIcon}`} aria-hidden="true" /> : null}
      <input
        ref={inputRef}
        type="text"
        className="url-bar-input"
        value={editing ? draft : deepLinkUrl}
        onChange={(e) => setDraft(e.target.value)}
        onClick={handleClick}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        readOnly={disabled}
        spellCheck={false}
        aria-label="Deep link URL"
      />
      <button
        type="button"
        className="url-bar-copy"
        onClick={() => onRefresh?.()}
        disabled={disabled}
        title="Refresh page"
        aria-label="Refresh page"
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
          type="button"
          className="url-bar-copy"
          onClick={() => onOpenPalette(editing ? draft : "")}
          disabled={disabled}
          title="Open command palette"
          aria-label="Open command palette"
        >
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
        className="url-bar-copy"
        onClick={onCopy}
        disabled={disabled}
        title="Copy link"
        aria-label="Copy link"
      >
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z"
          />
        </svg>
      </button>
    </div>
  );
}
