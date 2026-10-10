import { describe, expect, it } from "vitest";

import { checkLimit } from "../src/rate-limit.js";

describe("checkLimit", () => {
  it("allows up to the limit, then rejects within the window", async () => {
    const spec = { key: `test-${Date.now()}`, limit: 3, windowSeconds: 60 };
    expect(await checkLimit(spec)).toBe(true);
    expect(await checkLimit(spec)).toBe(true);
    expect(await checkLimit(spec)).toBe(true);
    expect(await checkLimit(spec)).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const a = { key: `test-a-${Date.now()}`, limit: 1, windowSeconds: 60 };
    const b = { key: `test-b-${Date.now()}`, limit: 1, windowSeconds: 60 };
    expect(await checkLimit(a)).toBe(true);
    expect(await checkLimit(b)).toBe(true);
    expect(await checkLimit(a)).toBe(false);
  });
});
