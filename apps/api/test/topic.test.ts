import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { encodeCursor } from "../src/pagination.js";
import { addCoverage, createTestSource, createTestStory, createTestTopic } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

describe("GET /api/public/topics", () => {
  it("lists a newly created topic", async () => {
    const topicId = await createTestTopic("Elections", ["election"]);
    await delTestCache("page:topics:list");

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/topics" });
    expect(res.statusCode).toBe(200);
    const ids = res.json().map((t: { id: string }) => t.id);
    expect(ids).toContain(topicId);
    await app.close();
  });
});

describe("GET /api/public/topics/:id/feed", () => {
  it("matches whole-word keyword hits, not substrings (AI vs AIIMS)", async () => {
    const topicId = await createTestTopic("AI coverage", ["AI"]);
    const sourceId = await createTestSource("topic-match");

    const { storyId: matching } = await createTestStory(sourceId, { title: "New AI rules announced" });
    const { storyId: notMatching } = await createTestStory(sourceId, { title: "AIIMS opens new wing" });

    await delTestCache(`page:topic:${topicId}:first`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/topics/${topicId}/feed` });
    expect(res.statusCode).toBe(200);

    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).toContain(matching);
    expect(ids).not.toContain(notMatching);
    await app.close();
  });

  it("matches against a visible member article's title, not just the headline", async () => {
    const topicId = await createTestTopic("Cricket", ["cricket"]);
    const sourceA = await createTestSource("topic-headline");
    const sourceB = await createTestSource("topic-member");
    const { storyId } = await createTestStory(sourceA, { title: "Unrelated headline" });
    await addCoverage(storyId, sourceB, { title: "Cricket match ends in a draw" });

    await delTestCache(`page:topic:${topicId}:first`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/topics/${topicId}/feed` });
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).toContain(storyId);
    await app.close();
  });

  it("excludes a match whose only matching article is hidden", async () => {
    const topicId = await createTestTopic("Budget", ["budget"]);
    const sourceA = await createTestSource("topic-hidden-headline");
    const sourceB = await createTestSource("topic-hidden-member");
    const { storyId } = await createTestStory(sourceA, { title: "Unrelated headline" });
    await addCoverage(storyId, sourceB, { title: "Union budget announced today", hiddenAt: new Date() });

    await delTestCache(`page:topic:${topicId}:first`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/topics/${topicId}/feed` });
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(storyId);
    await app.close();
  });

  it("excludes stories whose coverage is older than the 14-day window", async () => {
    const topicId = await createTestTopic("Monsoon", ["monsoon"]);
    const sourceId = await createTestSource("topic-old");
    const { storyId } = await createTestStory(sourceId, {
      title: "Monsoon arrives early this year",
      lastCoverageAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    });

    await delTestCache(`page:topic:${topicId}:first`);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/topics/${topicId}/feed` });
    const ids = res.json().items.map((i: { id: string }) => i.id);
    expect(ids).not.toContain(storyId);
    await app.close();
  });

  it("returns 404 for a topic that doesn't exist", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/topics/00000000-0000-0000-0000-000000000000/feed" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("rejects a cursor minted for a different topic (feed binding)", async () => {
    const topicA = await createTestTopic("Topic A", ["alpha"]);
    const topicB = await createTestTopic("Topic B", ["beta"]);
    await delTestCache(`page:topic:${topicA}:first`);

    const app = buildApp();
    const firstRes = await app.inject({ method: "GET", url: `/api/public/topics/${topicA}/feed` });
    // No items yet for a brand-new topic means no next_cursor to steal — build one manually
    // bound to topicA, then try to use it against topicB.
    const foreignCursor = encodeCursor({
      v: 1,
      feed: `topic:${topicA}`,
      as_of: firstRes.json().asOf,
      c: new Date().toISOString(),
      id: "x",
    });

    const res = await app.inject({
      method: "GET",
      url: `/api/public/topics/${topicB}/feed?cursor=${encodeURIComponent(foreignCursor)}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_cursor" });
    await app.close();
  });
});
