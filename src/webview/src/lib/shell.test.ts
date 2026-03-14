import { describe, expect, test } from "bun:test";
import type { UniversalStage } from "@shared/universal";
import { buildShellSections, resolveShellSection, resolveWorkStage } from "./shell";

const STAGES: UniversalStage[] = [
  { id: "plan", label: "Plan", order: 1, defaultRoute: "/plan" },
  { id: "execute", label: "Execute", order: 2, defaultRoute: "/execute" },
  { id: "review", label: "Review", order: 3, defaultRoute: "/review" },
  { id: "ship", label: "Ship", order: 4, defaultRoute: "/ship" },
  {
    id: "system",
    label: "System",
    order: 99,
    defaultRoute: "/system/settings",
    subnav: {
      settings: { label: "Settings", path: "/system/settings", order: 1 },
      docs: { label: "Docs", path: "/system/docs", order: 2 },
    },
  },
];

describe("shell navigation model", () => {
  test("groups lifecycle routes under Work", () => {
    expect(resolveShellSection("/plan")).toBe("work");
    expect(resolveShellSection("/execute")).toBe("work");
    expect(resolveShellSection("/review/issues/CSO-1")).toBe("work");
    expect(resolveShellSection("/ship")).toBe("work");
  });

  test("keeps dedicated top-level routes distinct", () => {
    expect(resolveShellSection("/now")).toBe("now");
    expect(resolveShellSection("/work")).toBe("work");
    expect(resolveShellSection("/agents")).toBe("agents");
    expect(resolveShellSection("/observe")).toBe("observe");
    expect(resolveShellSection("/system")).toBe("system");
  });

  test("derives the active work subview", () => {
    expect(resolveWorkStage("/now")).toBe("plan");
    expect(resolveWorkStage("/work")).toBe("plan");
    expect(resolveWorkStage("/review/issues/CSO-99")).toBe("review");
    expect(resolveWorkStage("/ship")).toBe("ship");
  });

  test("builds Work and System subnav from stage config", () => {
    const sections = buildShellSections(STAGES);
    const work = sections.find((section) => section.id === "work");
    const system = sections.find((section) => section.id === "system");

    expect(work?.subnav?.overview.path).toBe("/work");
    expect(work?.subnav?.plan.label).toBe("Plan");
    expect(work?.subnav?.review.path).toBe("/review");

    expect(system?.subnav?.overview.path).toBe("/system");
    expect(system?.subnav?.settings.order).toBe(2);
    expect(system?.subnav?.docs.order).toBe(3);
  });
});
