import type { UniversalSubNavItem } from "@shared/universal";

type SubNavProps = {
  items: UniversalSubNavItem[];
  currentPath: string;
  onNavigate: (path: string) => void;
};

export function SubNav({ items, currentPath, onNavigate }: SubNavProps) {
  const sorted = [...items].sort((a, b) => a.order - b.order);

  return (
    <nav className="sub-nav" aria-label="Sub navigation">
      {sorted.map((item) => {
        const isActive = currentPath === item.path;
        return (
          <button
            key={item.path}
            type="button"
            className={`sub-nav-item${isActive ? " sub-nav-active" : ""}`}
            data-label={item.label}
            onClick={() => onNavigate(item.path)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
