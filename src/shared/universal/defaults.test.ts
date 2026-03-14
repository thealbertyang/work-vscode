import { describe, expect, test } from "bun:test";

import { DEFAULT_UNIVERSAL_CONFIG } from "./defaults";

describe("DEFAULT_UNIVERSAL_CONFIG", () => {
  test("uses the universal shell as the top-level navigation model", () => {
    expect(DEFAULT_UNIVERSAL_CONFIG.app.defaultRoute).toBe("/");
    expect(DEFAULT_UNIVERSAL_CONFIG.shell?.defaultSection).toBe("now");
    expect(Object.keys(DEFAULT_UNIVERSAL_CONFIG.shell?.sections ?? {})).toEqual([
      "now",
      "work",
      "agents",
      "observe",
      "system",
    ]);
  });

  test("keeps lifecycle stages nested under Work", () => {
    expect(DEFAULT_UNIVERSAL_CONFIG.shell?.sections.work?.stageIds).toEqual([
      "plan",
      "execute",
      "review",
      "ship",
    ]);
    expect(DEFAULT_UNIVERSAL_CONFIG.stages?.plan?.defaultRoute).toBe("/plan");
    expect(DEFAULT_UNIVERSAL_CONFIG.stages?.execute?.defaultRoute).toBe("/execute");
  });
});
