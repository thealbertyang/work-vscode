import type { UniversalStage } from "@shared/universal";

type StageRailProps = {
  stages: UniversalStage[];
  activeStage: string;
  onNavigate: (path: string) => void;
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

function StageIcon({ icon, fallback }: { icon?: string; fallback: string }) {
  const cls = icon ? STAGE_ICONS[icon] : undefined;
  if (cls) return <span className={`stage-rail-icon codicon ${cls}`} aria-hidden="true" />;
  return <span className="stage-rail-icon">{fallback}</span>;
}

export function StageRail({ stages, activeStage, onNavigate }: StageRailProps) {
  const mainStages = stages.filter((s) => s.id !== "system").sort((a, b) => a.order - b.order);
  const systemStage = stages.find((s) => s.id === "system");

  return (
    <nav className="stage-rail" aria-label="Stage navigation">
      <div className="stage-rail-main">
        {mainStages.map((stage) => (
          <button
            key={stage.id}
            type="button"
            className={`stage-rail-item${activeStage === stage.id ? " stage-rail-active" : ""}`}
            onClick={() => onNavigate(stage.defaultRoute)}
            title={stage.label}
            aria-current={activeStage === stage.id ? "page" : undefined}
          >
            <StageIcon icon={stage.icon} fallback={stage.label[0]} />
            <span className="stage-rail-label" data-label={stage.label}>{stage.label}</span>
          </button>
        ))}
      </div>
      {systemStage ? (
        <div className="stage-rail-footer">
          <div className="stage-rail-divider" />
          <button
            type="button"
            className={`stage-rail-item${activeStage === "system" ? " stage-rail-active" : ""}`}
            onClick={() => onNavigate(systemStage.defaultRoute)}
            title={systemStage.label}
            aria-current={activeStage === "system" ? "page" : undefined}
          >
            <StageIcon icon="gear" fallback="S" />
            <span className="stage-rail-label" data-label={systemStage.label}>{systemStage.label}</span>
          </button>
        </div>
      ) : null}
    </nav>
  );
}
