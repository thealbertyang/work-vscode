import type { ReactNode } from "react";

type SectionProps = {
  children: ReactNode;
  className?: string;
};

export function Section({ children, className }: SectionProps) {
  return <div className={`section${className ? ` ${className}` : ""}`}>{children}</div>;
}
