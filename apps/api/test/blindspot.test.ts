import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPool } from "../src/db.js";
import { getBlindspotFeed } from "../src/features/blindspot/service.js";
import { addCoverage, createTestSource, createTestStory, rateSource } from "./feed-helpers.js";

const BASELINE = { pLeft: 0.3, pCenter: 0.35, pRight: 0.35 };
const CURATOR_KEY = "dev-insecure-curator-key";

async function insertBaseline(asOf: Date = new Date()): Promise<void> {
  await getPool().query(
    `INSERT INTO bias_baselines (spectrum, method, appearances, p_left, p_center, p_right, computed_at)
     VALUES ('IN', 'pool', 0, $1, $2, $3, $4)`,
    [BASELINE.pLeft, BASELINE.pCenter, BASELINE.pRight, asOf]
  );
}

describe("getBlindspotFeed (PRODUCT §4)", () => {
  it("flags a story with 0 right-leaning sources at n=6 — the doc's own minimal example (§4.5)", async () => {
    await insertBaseline();
    const sources = await Promise.all(Array.from({ length: 6 }, () => createTestSource("blindspot-left")));
    await Promise.all(sources.map((s) => rateSource(s, { biasRating: "left", confidence: "high" })));

    const { storyId } = await createTestStory(sources[0]);
    await Promise.all(sources.slice(1).map((s) => addCoverage(storyId, s)));

    const result = await getBlindspotFeed(getPool(), undefined);
    const item = result.items.find((i) => i.id === storyId);
    expect(item).toBeDefined();
    expect(item?.side).toBe("R");
    expect(item?.countedLeft).toBe(6);
    expect(item?.countedRight).toBe(0);
  });

  it("does not flag a story with fewer than 6 counted sources (n_min)", async () => {
    await insertBaseline();
    const sources = await Promise.all(Array.from({ length: 5 }, () => createTestSource("blindspot-toofew")));
    await Promise.all(sources.map((s) => rateSource(s, { biasRating: "left", confidence: "high" })));

    const { storyId } = await createTestStory(sources[0]);
    await Promise.all(sources.slice(1).map((s) => addCoverage(storyId, s)));

    const result = await getBlindspotFeed(getPool(), undefined);
    expect(result.items.find((i) => i.id === storyId)).toBeUndefined();
  });

  it("does not flag balanced coverage (no side is one-sided)", async () => {
    await insertBaseline();
    const left = await Promise.all(Array.from({ length: 3 }, () => createTestSource("blindspot-bal-left")));
    const center = await Promise.all(Array.from({ length: 3 }, () => createTestSource("blindspot-bal-center")));
    const right = await Promise.all(Array.from({ length: 2 }, () => createTestSource("blindspot-bal-right")));
    await Promise.all([
      ...left.map((s) => rateSource(s, { biasRating: "left", confidence: "high" })),
      ...center.map((s) => rateSource(s, { biasRating: "center", confidence: "high" })),
      ...right.map((s) => rateSource(s, { biasRating: "right", confidence: "high" })),
    ]);

    const { storyId } = await createTestStory(left[0]);
    await Promise.all([...left.slice(1), ...center, ...right].map((s) => addCoverage(storyId, s)));

    const result = await getBlindspotFeed(getPool(), undefined);
    expect(result.items.find((i) => i.id === storyId)).toBeUndefined();
  });

  it("excludes low-confidence ratings from the counted-source tally", async () => {
    await insertBaseline();
    // 6 left sources at high confidence (flaggable per §4.5), plus a low-confidence right
    // source that must NOT count toward k_right (PRODUCT §4.3: confidence <> 'low').
    const left = await Promise.all(Array.from({ length: 6 }, () => createTestSource("blindspot-lowconf-left")));
    await Promise.all(left.map((s) => rateSource(s, { biasRating: "left", confidence: "high" })));
    const lowConfRight = await createTestSource("blindspot-lowconf-right");
    await rateSource(lowConfRight, { biasRating: "right", confidence: "low" });

    const { storyId } = await createTestStory(left[0]);
    await Promise.all(left.slice(1).map((s) => addCoverage(storyId, s)));
    await addCoverage(storyId, lowConfRight);

    const result = await getBlindspotFeed(getPool(), undefined);
    const item = result.items.find((i) => i.id === storyId);
    expect(item?.countedRight).toBe(0);
    expect(item?.side).toBe("R");
  });

  it("excludes stories whose coverage is older than the 7-day window", async () => {
    await insertBaseline();
    const sources = await Promise.all(Array.from({ length: 6 }, () => createTestSource("blindspot-old")));
    await Promise.all(sources.map((s) => rateSource(s, { biasRating: "left", confidence: "high" })));

    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const { storyId } = await createTestStory(sources[0], { lastCoverageAt: old });
    await Promise.all(sources.slice(1).map((s) => addCoverage(storyId, s, { effectiveAt: old })));

    const result = await getBlindspotFeed(getPool(), undefined);
    expect(result.items.find((i) => i.id === storyId)).toBeUndefined();
  });
});

describe("GET /api/curator/blindspot-feed", () => {
  it("rejects requests without the curator key", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/curator/blindspot-feed" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("serves the same feed the service computes, behind the curator key", async () => {
    await insertBaseline();
    const sources = await Promise.all(Array.from({ length: 6 }, () => createTestSource("blindspot-route")));
    await Promise.all(sources.map((s) => rateSource(s, { biasRating: "left", confidence: "high" })));
    const { storyId } = await createTestStory(sources[0]);
    await Promise.all(sources.slice(1).map((s) => addCoverage(storyId, s)));

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/curator/blindspot-feed",
      headers: { "x-curator-key": CURATOR_KEY },
    });
    expect(res.statusCode).toBe(200);
    const item = res.json().items.find((i: { id: string }) => i.id === storyId);
    expect(item?.side).toBe("R");
    await app.close();
  });
});
