import type { ShellSection } from "../lib/shell";

type ShellRailProps = {
  sections: ShellSection[];
  activeSection: string;
  onNavigate: (path: string) => void;
};

function ShellIcon({ icon, fallback }: { icon?: string; fallback: string }) {
  if (icon) return <span className={`shell-rail-icon codicon ${icon}`} aria-hidden="true" />;
  return <span className="shell-rail-icon">{fallback}</span>;
}

export function ShellRail({ sections, activeSection, onNavigate }: ShellRailProps) {
  return (
    <nav className="shell-rail" aria-label="Primary navigation">
      <div className="shell-rail-main">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            className={`shell-rail-item${activeSection === section.id ? " shell-rail-active" : ""}`}
            onClick={() => onNavigate(section.defaultRoute)}
            title={section.label}
            aria-current={activeSection === section.id ? "page" : undefined}
          >
            <ShellIcon icon={section.icon} fallback={section.label[0]} />
            <span className="shell-rail-label" data-label={section.label}>{section.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
