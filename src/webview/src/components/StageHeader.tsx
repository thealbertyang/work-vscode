import type { ReactNode } from "react";
import type { ShellSection } from "../lib/shell";
import { SubNav } from "./SubNav";

type StageHeaderProps = {
  section: ShellSection | undefined;
  currentPath: string;
  onNavigate: (path: string) => void;
  actions?: ReactNode;
};

export function StageHeader({ section, currentPath, onNavigate, actions }: StageHeaderProps) {
  if (!section) {
    return null;
  }

  const subnavItems = section.subnav
    ? Object.values(section.subnav)
    : [];

  return (
    <header className="stage-header">
      <div className="stage-header-left">
        <h1 className="stage-title">{section.label}</h1>
        {subnavItems.length > 0 ? (
          <SubNav items={subnavItems} currentPath={currentPath} onNavigate={onNavigate} />
        ) : null}
      </div>
      {actions ? <div className="stage-header-actions">{actions}</div> : null}
    </header>
  );
}
