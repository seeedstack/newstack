import { beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPool } from "../src/db.js";
import { fetchBiasBar, fetchRatedCounts } from "../src/features/feed/repo.js";
import { encodeCursor } from "../src/pagination.js";
import { addCoverage, createTestSource, createTestStory, rateSource } from "./feed-helpers.js";
import { delTestCache, setTestCache } from "./redis-helpers.js";

describe("bias bar + rated counts (PRODUCT §3.3, ARCHITECTURE §10)", () => {
  let storyId: string;
  let leftSourceId: string;
  let rightLowConfSourceId: string;
  let internationalSourceId: string;
  let unratedSourceId: string;
  let hiddenSourceId: string;

  beforeAll(async () => {
    leftSourceId = await createTestSource("left");
    rightLowConfSourceId = await createTestSource("right-low");
    internationalSourceId = await createTestSource("intl");
    unratedSourceId = await createTestSource("unrated");
    hiddenSourceId = await createTestSource("hidden");

    await rateSource(leftSourceId, { biasRating: "left", confidence: "high" });
    await rateSource(rightLowConfSourceId, { biasRating: "right", confidence: "low" });
    await rateSource(internationalSourceId, { factualityOnly: true });
    await rateSource(hiddenSourceId, { biasRating: "center", confidence: "high" });
    // unratedSourceId is deliberately left with no current rating.

    const story = await createTestStory(leftSourceId);
    storyId = story.storyId;
    await addCoverage(storyId, rightLowConfSourceId);
    await addCoverage(storyId, internationalSourceId);
    await addCoverage(storyId, unratedSourceId);
    await addCoverage(storyId, hiddenSourceId, { hiddenAt: new Date() });
  });

  it("buckets left / low-confidence right / not_rated correctly, excluding hidden articles", async () => {
    const rows = await fetchBiasBar(getPool(), [storyId]);
    const byCategory = Object.fromEntries(rows.map((r) => [r.category, r]));

    expect(byCategory.left).toMatchObject({ total: 1, low_confidence: 0 });
    expect(byCategory.right).toMatchObject({ total: 1, low_confidence: 1 });
    // not_rated covers both the international (factuality-only) source and the truly unrated
    // one — §3.2: international outlets "sit outside the bar as not rated on this scale".
    expect(byCategory.not_rated).toMatchObject({ total: 2 });
    expect(byCategory["center"]).toBeUndefined(); // hidden source's article doesn't count at all
  });

  it("counts the international source as rated, but the truly unrated one as unrated", async () => {
    const [counts] = await fetchRatedCounts(getPool(), [storyId]);
    // left + right + international = 3 rated; the unrated source = 1. Hidden source excluded.
    expect(counts.rated_source_count).toBe(3);
    expect(counts.unrated_source_count).toBe(1);
  });
});

describe("GET /api/public/feed", () => {
  it("returns a correctly-shaped page and includes a just-created story first", async () => {
    const sourceId = await createTestSource("feed-http");
    const { storyId } = await createTestStory(sourceId, { lastCoverageAt: new Date() });
    await delTestCache("page:feed:home:first"); // don't let a stale cache hide this story

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/feed" });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body).toHaveProperty("items");
    expect(body).toHaveProperty("asOf");
    expect(body).toHaveProperty("nextCursor");
    expect(body).toHaveProperty("updatedCount");
    expect(body.items[0].id).toBe(storyId);
    expect(body.items[0].biasBar).toHaveProperty("notRated");
    await app.close();
  });

  it("rejects a malformed cursor with 400 invalid_cursor", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/feed?cursor=not-a-real-cursor" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_cursor" });
    await app.close();
  });

  it("rejects a cursor issued for a different feed", async () => {
    const foreignCursor = encodeCursor({ v: 1, feed: "topic:123", as_of: new Date().toISOString(), c: new Date().toISOString(), id: "x" });
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/feed?cursor=${encodeURIComponent(foreignCursor)}` });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("serves the cached body on a repeat request instead of recomputing", async () => {
    const fake = { items: [], asOf: new Date().toISOString(), nextCursor: null, updatedCount: 0, marker: "from-cache" };
    await setTestCache("page:feed:home:first", JSON.stringify(fake), 60);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/feed" });
    expect(res.json()).toEqual(fake);
    await app.close();

    await delTestCache("page:feed:home:first");
  });

  it("carries the public cache header, not the private one", async () => {
    await delTestCache("page:feed:home:first");
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/feed" });
    expect(res.headers["cache-control"]).toBe("public, max-age=30");
    await app.close();
  });
});
