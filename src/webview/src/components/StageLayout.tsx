import type { ReactNode } from "react";
import type { UniversalStage } from "@shared/universal";
import { StageRail } from "./StageRail";
import { StageHeader } from "./StageHeader";
import { UrlBar } from "./UrlBar";

type StageLayoutProps = {
  stages: UniversalStage[];
  activeStage: string;
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

const STAGE_ICONS: Record<string, string> = {
  calendar: "codicon-calendar",
  play: "codicon-play",
  eye: "codicon-eye",
  rocket: "codicon-rocket",
  pulse: "codicon-graph-line",
  book: "codicon-book",
  gear: "codicon-gear",
};

export function StageLayout({
  stages,
  activeStage,
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
  const currentStageConfig = stages.find((s) => s.id === activeStage);
  const stageIcon = currentStageConfig?.icon ? (STAGE_ICONS[currentStageConfig.icon] ?? "") : "";

  return (
    <div className="stage-layout">
      <StageRail stages={stages} activeStage={activeStage} onNavigate={onNavigate} />
      <div className="stage-content">
        <UrlBar
          deepLinkUrl={deepLinkUrl}
          stageIcon={stageIcon}
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
          stage={currentStageConfig}
          currentPath={currentPath}
          onNavigate={onNavigate}
          actions={headerActions}
        />
        <main className="stage-main">{children}</main>
      </div>
    </div>
  );
}
