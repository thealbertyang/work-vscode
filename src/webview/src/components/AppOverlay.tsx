import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AppOverlayPill } from "./AppOverlayPill";
import { AppOverlayActions } from "./AppOverlayActions";
import { AppOverlaySearch } from "./AppOverlaySearch";
import { DevOverlayActions } from "./DevOverlayActions";
import { DEFAULT_UNIVERSAL_CONFIG } from "@shared/universal";
import type { UniversalConfig } from "@shared/universal";
import { useAppContext } from "../contexts/app-context";
import { useHandlers } from "../hooks/use-handlers";
import { executeUniversalAction } from "../lib/execute-universal-action";

type AppOverlayProps = {
  isConnected: boolean;
  stageLabel: string;
  currentSection: string;
  currentStage: string;
  lastExtensionBuildAt?: number | null;
  isWebview: boolean;
  // Contextual action callbacks
  onNavigate: (path: string) => void;
  onCopyDeepLink: () => void;
  onOpenSettings: () => void;
  onSyncEnv: () => void;
  onRefreshIssue?: () => void;
  onOpenIssueInBrowser?: () => void;
  // Dev callbacks
  onRunDevWebview: () => void;
  onReloadWebviews: () => void;
  onReinstallExtension: () => void;
  onRestartExtensionHost: () => void;
  onStartTaskTerminal: () => void;
  onSaveToken?: () => void;
};

export function AppOverlay({
  isConnected,
  stageLabel,
  currentSection,
  currentStage,
  lastExtensionBuildAt,
  isWebview,
  onNavigate,
  onCopyDeepLink,
  onOpenSettings,
  onSyncEnv,
  onRefreshIssue,
  onOpenIssueInBrowser,
  onRunDevWebview,
  onReloadWebviews,
  onReinstallExtension,
  onRestartExtensionHost,
  onStartTaskTerminal,
  onSaveToken,
}: AppOverlayProps) {
  const handlers = useHandlers();
  const { universalConfig } = useAppContext();
  const config: UniversalConfig = universalConfig ?? DEFAULT_UNIVERSAL_CONFIG;
  const [expanded, setExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paletteInitialQuery, setPaletteInitialQuery] = useState("");
  const [faded, setFaded] = useState(false);
  const expandedBeforePaletteRef = useRef(false);
  const returnFocusToUrlBarRef = useRef(false);

  const withViewTransition = useCallback((update: () => void) => {
    const doc = document as unknown as { startViewTransition?: (cb: () => void) => void };
    if (typeof doc.startViewTransition !== "function") {
      update();
      return;
    }
    doc.startViewTransition(() => flushSync(update));
  }, []);

  const openPalette = useCallback((options?: { query?: string; returnFocus?: boolean }) => {
    expandedBeforePaletteRef.current = expanded;
    const nextQuery = typeof options?.query === "string" ? options.query : "";
    returnFocusToUrlBarRef.current = Boolean(options?.returnFocus);
    withViewTransition(() => {
      setPaletteInitialQuery(nextQuery);
      setExpanded(false);
      setSearchOpen(true);
    });
  }, [expanded, withViewTransition]);

  const closePalette = useCallback(() => {
    withViewTransition(() => {
      setSearchOpen(false);
      setExpanded(expandedBeforePaletteRef.current);
    });
    if (returnFocusToUrlBarRef.current) {
      returnFocusToUrlBarRef.current = false;
      window.dispatchEvent(new Event("work:urlBarFocus"));
    }
  }, [withViewTransition]);

  const searchItems = useMemo(() => {
    const items: { id: string; label: string; action: () => void }[] = [];

    const openDoc = (id: string, label: string) =>
      items.push({
        id: `doc:${id}`,
        label,
        action: () => onNavigate(`/system/docs?doc=${encodeURIComponent(id)}`),
      });

    items.push({
      id: "nav:registry",
      label: "Open registry",
      action: () => onNavigate("/system/registry"),
    });
    items.push({
      id: "nav:docs",
      label: "Open docs",
      action: () => onNavigate("/system/docs"),
    });

    if (currentSection === "now" || currentStage === "plan") {
      openDoc("runbooks/automation-triage.md", "Runbook: Automation triage");
      openDoc("docs/reminder-ui.md", "Doc: Reminder UI");
      openDoc("docs/engineer-work-matrix.md", "Doc: Engineer work matrix");
      openDoc("docs/project-management-matrix.md", "Doc: Project management matrix");
    }

    if (currentStage === "ship") {
      openDoc("runbooks/release-promotion.md", "Runbook: Release promotion");
    }

    if (currentStage === "observe") {
      openDoc("runbooks/observe-triage.md", "Runbook: Observe triage");
    }

    return items;
  }, [currentSection, currentStage, onNavigate]);

  // Scroll-based fade at bottom
  useEffect(() => {
    const main = document.querySelector(".stage-main");
    if (!main) return;
    const handleScroll = () => {
      const atBottom = main.scrollHeight - main.scrollTop - main.clientHeight < 20;
      setFaded(atBottom && main.scrollHeight > main.clientHeight);
    };
    main.addEventListener("scroll", handleScroll, { passive: true });
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  // Global '/' key to open search
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName ?? "";
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        Boolean((active as unknown as { isContentEditable?: boolean } | null)?.isContentEditable);

      if (e.key === "/" && !searchOpen && !isTyping) {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") {
        if (searchOpen) {
          e.preventDefault();
          closePalette();
          return;
        }
        if (expanded) {
          e.preventDefault();
          setExpanded(false);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closePalette, expanded, openPalette, searchOpen]);

  // Allow pages to open the command palette without requiring the '/' keyboard shortcut.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { query?: string; returnFocus?: boolean } | undefined;
      openPalette({ query: detail?.query, returnFocus: detail?.returnFocus });
    };
    window.addEventListener("work:commandPalette", handler);
    return () =>
      window.removeEventListener(
        "work:commandPalette",
        handler,
      );
  }, [openPalette]);

  const buildContextActions = useCallback(() => {
    const actions: { label: string; icon?: string; onClick: () => void; disabled?: boolean }[] = [];

    if (currentSection === "now") {
      actions.push({ label: "Refresh", icon: "\u{1F504}", onClick: () => onNavigate("/now") });
    }
    if (currentSection === "work" && currentStage === "plan") {
      actions.push({ label: "Refresh", icon: "\u{1F504}", onClick: () => onNavigate("/plan") });
    }
    if (currentSection === "work" && currentStage === "execute") {
      actions.push({ label: "Refresh", icon: "\u{1F504}", onClick: () => onNavigate("/execute") });
    }
    if (currentSection === "work" && currentStage === "review") {
      if (onOpenIssueInBrowser) {
        actions.push({ label: "Open Browser", icon: "\u{1F517}", onClick: onOpenIssueInBrowser });
      }
      if (onRefreshIssue) {
        actions.push({ label: "Refresh", icon: "\u{1F504}", onClick: onRefreshIssue });
      }
    }
    if (currentSection === "system") {
      if (!isConnected && onSaveToken) {
        actions.push({ label: "Connect", icon: "\u{1F50C}", onClick: onSaveToken });
      }
      actions.push({ label: "Sync .env", icon: "\u{1F4C2}", onClick: onSyncEnv });
    }

    // Persistent
    actions.push({ label: "Settings", icon: "\u2699\uFE0F", onClick: onOpenSettings });
    actions.push({ label: "Copy Link", icon: "\u{1F517}", onClick: onCopyDeepLink });

    return actions;
  }, [
    currentStage,
    currentSection,
    isConnected,
    onNavigate,
    onCopyDeepLink,
    onOpenSettings,
    onSyncEnv,
    onRefreshIssue,
    onOpenIssueInBrowser,
    onSaveToken,
  ]);

  const handleExecuteCommand = useCallback(
    (actionId: string) => {
      void executeUniversalAction(actionId, { config, handlers, onNavigate });
    },
    [config, handlers, onNavigate],
  );

  if (!isWebview) return null;

  return (
    <>
      {searchOpen ? (
        <AppOverlaySearch
          isOpen={searchOpen}
          onClose={closePalette}
          onExecute={handleExecuteCommand}
          onNavigate={onNavigate}
          extraItems={searchItems}
          initialQuery={paletteInitialQuery}
        />
      ) : null}

      <div className={`app-overlay${faded ? " overlay-faded" : ""}${searchOpen ? " overlay-hidden" : ""}`}>
        {expanded && !searchOpen && (
        <DevOverlayActions
          onRunDevWebview={onRunDevWebview}
          onReloadWebviews={onReloadWebviews}
          onReinstallExtension={onReinstallExtension}
          onRestartExtensionHost={onRestartExtensionHost}
          onStartTaskTerminal={onStartTaskTerminal}
          lastExtensionBuildAt={lastExtensionBuildAt}
          disabled={!isWebview}
        />
        )}

        {expanded && !searchOpen ? <AppOverlayActions actions={buildContextActions()} /> : null}

        {!searchOpen ? (
          <AppOverlayPill
            isConnected={isConnected}
            stageLabel={stageLabel}
            onClick={() => setExpanded(!expanded)}
          />
        ) : null}
      </div>
    </>
  );
}
