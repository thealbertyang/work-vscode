import { describe, expect, test } from "bun:test";

import {
  DEFAULT_ROUTE_PATH,
  normalizeRoutePath,
  sectionFromPath,
  stageFromPath,
} from "./routes";

describe("route shell mapping", () => {
  test("defaults to the Now surface", () => {
    expect(DEFAULT_ROUTE_PATH).toBe("/now");
    expect(normalizeRoutePath("")).toBe("/now");
    expect(sectionFromPath("/")).toBe("now");
    expect(sectionFromPath("/now")).toBe("now");
    expect(sectionFromPath("/legacy-surface")).toBe("now");
  });

  test("maps lifecycle routes into the Work shell section", () => {
    expect(sectionFromPath("/work")).toBe("work");
    expect(sectionFromPath("/plan")).toBe("work");
    expect(sectionFromPath("/execute")).toBe("work");
    expect(sectionFromPath("/review/issues/DEV-0001")).toBe("work");
    expect(stageFromPath("/review/issues/DEV-0001")).toBe("review");
    expect(stageFromPath("/work")).toBe("plan");
  });

  test("maps dedicated sections directly", () => {
    expect(sectionFromPath("/agents")).toBe("agents");
    expect(sectionFromPath("/observe")).toBe("observe");
    expect(sectionFromPath("/system/settings")).toBe("system");
  });
});
