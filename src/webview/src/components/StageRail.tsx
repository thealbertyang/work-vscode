import type { ShellSection } from "../lib/shell";

type StageRailProps = {
  sections: ShellSection[];
  activeSection: string;
  onNavigate: (path: string) => void;
};

function StageIcon({ icon, fallback }: { icon?: string; fallback: string }) {
  if (icon) return <span className={`stage-rail-icon codicon ${icon}`} aria-hidden="true" />;
  return <span className="stage-rail-icon">{fallback}</span>;
}

export function StageRail({ sections, activeSection, onNavigate }: StageRailProps) {
  return (
    <nav className="stage-rail" aria-label="Primary navigation">
      <div className="stage-rail-main">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`stage-rail-item${activeSection === section.id ? " stage-rail-active" : ""}`}
            onClick={() => onNavigate(section.defaultRoute)}
            title={section.label}
            aria-current={activeSection === section.id ? "page" : undefined}
          >
            <StageIcon icon={section.icon} fallback={section.label[0]} />
            <span className="stage-rail-label" data-label={section.label}>{section.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
