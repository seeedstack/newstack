import { describe, expect, it } from "vitest";

import { loadBlindspotConfig } from "../src/features/blindspot/config.js";

describe("loadBlindspotConfig (PRODUCT §4.4)", () => {
  it("reads the real config/product/blindspot.yaml, not hardcoded defaults", () => {
    const params = loadBlindspotConfig();
    expect(params).toEqual({
      nMin: 6,
      materiality: 0.5,
      z: 1.645,
      baselineWindowDays: 30,
      poolCutoverAppearances: 500,
    });
  });

  it("throws if a required key is missing, rather than silently defaulting", async () => {
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "blindspot-")), "blindspot.yaml");
    await fs.writeFile(tmpFile, "n_min: 6\nmateriality: 0.5\n");
    expect(() => loadBlindspotConfig(tmpFile)).toThrow(/missing required key/);
  });
});
