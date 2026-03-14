import type { ReactNode } from "react";
import type { ShellSection } from "../lib/shell";
import { StageRail } from "./StageRail";
import { StageHeader } from "./StageHeader";
import { UrlBar } from "./UrlBar";

type StageLayoutProps = {
  sections: ShellSection[];
  activeSection: string;
  currentSection: ShellSection | undefined;
  currentPath: string;
  deepLinkUrl: string;
  onNavigate: (path: string) => void;
  onCopy: () => void;
  onRefresh?: () => void;
  onOpenPalette?: (initialQuery?: string) => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function StageLayout({
  sections,
  activeSection,
  currentSection,
  currentPath,
  deepLinkUrl,
  onNavigate,
  onCopy,
  onRefresh,
  onOpenPalette,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  headerActions,
  children,
}: StageLayoutProps) {
  return (
    <div className="stage-layout">
      <StageRail sections={sections} activeSection={activeSection} onNavigate={onNavigate} />
      <div className="stage-content">
        <UrlBar
          deepLinkUrl={deepLinkUrl}
          stageIcon={currentSection?.icon}
          onNavigate={onNavigate}
          onCopy={onCopy}
          onRefresh={onRefresh}
          onOpenPalette={onOpenPalette}
          // Keep the omnibox functional in browser/WS-bridge mode. Only RPC/commands
          // should be gated behind connectivity, not navigation.
          disabled={false}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
        />
        <StageHeader
          section={currentSection}
          currentPath={currentPath}
          onNavigate={onNavigate}
          actions={headerActions}
        />
        <main className="stage-main">{children}</main>
      </div>
    </div>
  );
}
