import { describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { signAccessToken } from "../src/features/auth/jwt.js";
import {
  addCoverage,
  createTestSource,
  createTestStory,
  insertLineage,
  rateSource,
  tombstoneStory,
} from "./feed-helpers.js";
import { cleanupTestUser, createUser } from "./helpers.js";
import { delTestCache, setTestCache } from "./redis-helpers.js";

describe("GET /api/public/stories/:id", () => {
  it("groups articles by source, dedupes by content_hash, excludes hidden, and labels not_rated", async () => {
    const sourceA = await createTestSource("story-a");
    const sourceB = await createTestSource("story-hidden");
    await rateSource(sourceA, { biasRating: "left", confidence: "high" });
    // sourceB left deliberately unrated.

    const { storyId } = await createTestStory(sourceA, { title: "Primary headline" });
    // A second, duplicate-content article from the same source: should collapse into moreCount.
    await addCoverage(storyId, sourceA, { contentHash: "shared-hash", title: "Duplicate copy" });
    await addCoverage(storyId, sourceA, { contentHash: "shared-hash", title: "Another duplicate copy" });
    // A hidden article from a second source: must not appear at all.
    await addCoverage(storyId, sourceB, { hiddenAt: new Date() });

    await delTestCache(`page:story:${storyId}`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/stories/${storyId}` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe("active");
    expect(body.redirectTo).toBeNull();

    // headline article (unique hash) + the two duplicates (shared hash, collapsed to one card)
    // both live under sourceA's single left-column card.
    expect(body.biasColumns.left).toHaveLength(1);
    expect(body.biasColumns.left[0].sourceId).toBe(sourceA);
    expect(body.biasColumns.left[0].moreCount).toBe(1); // 2 distinct hashes for sourceA → 1 extra

    // sourceB's only article is hidden, so it contributes nothing — not even a not_rated card.
    expect(body.biasColumns.notRated).toHaveLength(0);
    await app.close();
  });

  it("returns 404 for a story that doesn't exist", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/stories/00000000-0000-0000-0000-000000000000" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    await app.close();
  });

  it("a tombstoned story returns redirectTo and empty bias columns", async () => {
    const sourceA = await createTestSource("redirect-old");
    const sourceB = await createTestSource("redirect-new");
    const { storyId: oldStoryId } = await createTestStory(sourceA);
    const { storyId: newStoryId } = await createTestStory(sourceB, { title: "Successor story" });
    await tombstoneStory(oldStoryId, newStoryId);

    await delTestCache(`page:story:${oldStoryId}`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/stories/${oldStoryId}` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.status).toBe("tombstoned");
    expect(body.redirectTo).toEqual({ id: newStoryId, title: "Successor story" });
    expect(body.biasColumns.left).toEqual([]);
    expect(body.biasColumns.notRated).toEqual([]);
    await app.close();
  });

  it("surfaces split notices, excluding the primary redirect target", async () => {
    const sourceA = await createTestSource("split-origin");
    const sourceB = await createTestSource("split-secondary");
    const { storyId: originId } = await createTestStory(sourceA);
    const { storyId: secondaryId } = await createTestStory(sourceB, { title: "Secondary split target" });
    await insertLineage(originId, secondaryId, 4);

    await delTestCache(`page:story:${originId}`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/stories/${originId}` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.splitNotices).toEqual([{ storyId: secondaryId, title: "Secondary split target", articleCount: 4 }]);
    await app.close();
  });

  it("serves the cached body on a repeat request", async () => {
    const sourceA = await createTestSource("story-cache");
    const { storyId } = await createTestStory(sourceA);
    const fake = { id: storyId, marker: "from-cache" };

    const app = buildApp();
    // Warm real data first so we know a genuine miss would differ from `fake`.
    await app.inject({ method: "GET", url: `/api/public/stories/${storyId}` });

    await setTestCache(`page:story:${storyId}`, JSON.stringify(fake), 60);

    const res = await app.inject({ method: "GET", url: `/api/public/stories/${storyId}` });
    expect(res.json()).toEqual(fake);
    await delTestCache(`page:story:${storyId}`);
    await app.close();
  });

  it("caps each bias column to the free-tier limit and flags premiumBreakdown.locked", async () => {
    const sources = await Promise.all([createTestSource("cap-1"), createTestSource("cap-2"), createTestSource("cap-3")]);
    for (const s of sources) await rateSource(s, { biasRating: "left", confidence: "high" });
    const { storyId } = await createTestStory(sources[0]);
    await addCoverage(storyId, sources[1]);
    await addCoverage(storyId, sources[2]);

    await delTestCache(`page:story:${storyId}`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/stories/${storyId}` });
    const body = res.json();

    expect(body.biasColumns.left).toHaveLength(2); // FREE_SOURCE_CARDS_PER_CATEGORY
    expect(body.premiumBreakdown).toEqual({ locked: true, hiddenCardCount: 1 });
    await delTestCache(`page:story:${storyId}`);
    await app.close();
  });
});

describe("GET /api/stories/:id/full-breakdown", () => {
  const EMAIL = "story-premium-test@mail.example";

  it("rejects an unauthenticated request", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/stories/00000000-0000-0000-0000-000000000000/full-breakdown" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("403s a signed-in user with no active subscription", async () => {
    await cleanupTestUser(EMAIL);
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const sourceA = await createTestSource("premium-gate");
    const { storyId } = await createTestStory(sourceA);

    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/stories/${storyId}/full-breakdown`,
      headers: { authorization: `Bearer ${token}`, origin: WEB_ORIGIN },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("subscription_required");
    await app.close();
    await cleanupTestUser(EMAIL);
  });
});
