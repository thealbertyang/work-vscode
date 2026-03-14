import type { ReactNode } from "react";
import type { ShellSection } from "../lib/shell";
import { SubNav } from "./SubNav";

type ShellHeaderProps = {
  section: ShellSection | undefined;
  currentPath: string;
  onNavigate: (path: string) => void;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function ShellHeader({ section, currentPath, onNavigate, meta, actions }: ShellHeaderProps) {
  if (!section) {
    return null;
  }

  const subnavItems = section.subnav
    ? Object.values(section.subnav)
    : [];

  return (
    <header className="shell-header">
      <div className="shell-header-left">
        <h1 className="shell-title">{section.label}</h1>
        {subnavItems.length > 0 ? (
          <SubNav items={subnavItems} currentPath={currentPath} onNavigate={onNavigate} />
        ) : null}
      </div>
      {meta || actions ? (
        <div className="shell-header-right">
          {meta ? <div className="shell-header-meta">{meta}</div> : null}
          {actions ? <div className="shell-header-actions">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
