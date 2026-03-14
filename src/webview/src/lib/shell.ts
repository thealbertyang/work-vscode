import type { UniversalStage, UniversalSubNavItem } from "@shared/universal";

export type ShellSectionId = "now" | "work" | "agents" | "observe" | "system";

export type ShellSection = {
  id: ShellSectionId;
  label: string;
  icon: string;
  defaultRoute: string;
  subnav?: Record<string, UniversalSubNavItem>;
};

const WORK_STAGE_IDS = ["plan", "execute", "review", "ship"] as const;

const isWorkStageId = (value: string): value is (typeof WORK_STAGE_IDS)[number] =>
  (WORK_STAGE_IDS as readonly string[]).includes(value);

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

export const buildShellSections = (stages: UniversalStage[]): ShellSection[] => {
  const stageMap = new Map(stages.map((stage) => [stage.id, stage]));
  const systemStage = stageMap.get("system");

  const workSubnav: Record<string, UniversalSubNavItem> = {
    overview: { label: "Overview", path: "/work", order: 1 },
  };
  WORK_STAGE_IDS.forEach((stageId, index) => {
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

  return [
    { id: "now", label: "Now", icon: "codicon-home", defaultRoute: "/now" },
    { id: "work", label: "Work", icon: "codicon-briefcase", defaultRoute: "/work", subnav: workSubnav },
    { id: "agents", label: "Agents", icon: "codicon-hubot", defaultRoute: "/agents" },
    { id: "observe", label: "Observe", icon: "codicon-graph-line", defaultRoute: "/observe" },
    { id: "system", label: "System", icon: "codicon-gear", defaultRoute: "/system", subnav: systemSubnav },
  ];
};
