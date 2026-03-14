import type { ReactNode } from "react";
import type { ShellSection } from "../lib/shell";
import { ShellRail } from "./ShellRail";
import { ShellHeader } from "./ShellHeader";
import { UrlBar } from "./UrlBar";

type ShellLayoutProps = {
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
  headerMeta?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function ShellLayout({
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
  headerMeta,
  headerActions,
  children,
}: ShellLayoutProps) {
  return (
    <div className="shell-layout">
      <ShellRail sections={sections} activeSection={activeSection} onNavigate={onNavigate} />
      <div className="shell-content">
        <UrlBar
          deepLinkUrl={deepLinkUrl}
          sectionIcon={currentSection?.icon}
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
        <ShellHeader
          section={currentSection}
          currentPath={currentPath}
          onNavigate={onNavigate}
          meta={headerMeta}
          actions={headerActions}
        />
        <main className="shell-main">{children}</main>
      </div>
    </div>
  );
}
