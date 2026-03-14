import type { UniversalShellConfig, UniversalStage, UniversalSubNavItem } from "@shared/universal";

export type ShellSectionId = "now" | "work" | "agents" | "observe" | "system";

export type ShellSection = {
  id: ShellSectionId;
  label: string;
  icon: string;
  defaultRoute: string;
  subnav?: Record<string, UniversalSubNavItem>;
};

const WORK_STAGE_IDS = ["plan", "execute", "review", "ship"] as const;

const SECTION_ICON_MAP: Record<string, string> = {
  pulse: "codicon-pulse",
  briefcase: "codicon-briefcase",
  hubot: "codicon-hubot",
  gear: "codicon-gear",
  home: "codicon-home",
  "graph-line": "codicon-graph-line",
};

const isWorkStageId = (value: string): value is (typeof WORK_STAGE_IDS)[number] =>
  (WORK_STAGE_IDS as readonly string[]).includes(value);

const shellIcon = (icon?: string, fallback = "codicon-circle-large-outline"): string => {
  if (!icon) return fallback;
  if (icon.startsWith("codicon-")) return icon;
  return SECTION_ICON_MAP[icon] ?? `codicon-${icon}`;
};

export const resolveShellSection = (pathname: string): ShellSectionId => {
  const head = pathname.split("/").filter(Boolean)[0] || "now";
  if (head === "now") return "now";
  if (head === "work") return "work";
  if (head === "agents") return "agents";
  if (head === "observe") return "observe";
  if (head === "system" || head === "app") return "system";
  if (isWorkStageId(head)) return "work";
  return "now";
};

export const resolveWorkStage = (pathname: string): string => {
  const head = pathname.split("/").filter(Boolean)[0] || "plan";
  return isWorkStageId(head) ? head : "plan";
};

export const buildShellSections = (
  shellConfig: UniversalShellConfig | null | undefined,
  stages: UniversalStage[],
): ShellSection[] => {
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const systemStage = stageMap.get("system");
  const sectionEntries = Object.values(shellConfig?.sections ?? {}).sort((left, right) => left.order - right.order);
  const workStageIds = sectionEntries.find((section) => section.id === "work")?.stageIds ?? [...WORK_STAGE_IDS];

  const workSubnav: Record<string, UniversalSubNavItem> = {
    overview: { label: "Overview", path: "/work", order: 1 },
  };
  workStageIds.forEach((stageId, index) => {
    const stage = stageMap.get(stageId);
    if (!stage) {
      return;
    }
    workSubnav[stageId] = {
      label: stage.label,
      path: stage.defaultRoute,
      order: index + 2,
    };
  });

  const systemSubnav: Record<string, UniversalSubNavItem> = {
    overview: { label: "Overview", path: "/system", order: 1 },
  };
  if (systemStage?.subnav) {
    Object.entries(systemStage.subnav).forEach(([id, item]) => {
      systemSubnav[id] = {
        ...item,
        order: item.order + 1,
      };
    });
  }

  return sectionEntries.map((section) => ({
    id: section.id as ShellSectionId,
    label: section.label,
    icon: shellIcon(
      section.icon,
      section.id === "now"
        ? "codicon-home"
        : section.id === "observe"
          ? "codicon-graph-line"
          : "codicon-circle-large-outline",
    ),
    defaultRoute: section.defaultRoute,
    subnav:
      section.id === "work"
        ? workSubnav
        : section.id === "system"
          ? systemSubnav
          : undefined,
  }));
};
