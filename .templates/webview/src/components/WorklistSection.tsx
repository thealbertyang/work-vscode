import type { ReactNode } from "react";

type WorklistSectionProps = {
  title: string;
  children?: ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
};

export function WorklistSection({ title, children, emptyMessage, isEmpty }: WorklistSectionProps) {
  return (
    <div className="worklist-section">
      <div className="section-label">{title}</div>
      {isEmpty ? (
        <div className="worklist-empty">{emptyMessage ?? "Nothing here."}</div>
      ) : (
        children
      )}
    </div>
  );
}
