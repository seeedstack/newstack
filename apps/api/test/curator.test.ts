import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPool } from "../src/db.js";
import { createTestSource, createTestStory } from "./feed-helpers.js";

const CURATOR_KEY = "dev-insecure-curator-key";

function post(app: ReturnType<typeof buildApp>, path: string, body: unknown) {
  return app.inject({
    method: "POST",
    url: `/api/curator${path}`,
    headers: { "content-type": "application/json", "x-curator-key": CURATOR_KEY },
    payload: body as object,
  });
}

function get(app: ReturnType<typeof buildApp>, path: string) {
  return app.inject({
    method: "GET",
    url: `/api/curator${path}`,
    headers: { "x-curator-key": CURATOR_KEY },
  });
}

describe("curator auth", () => {
  it("rejects every curator route without the key", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/curator/sources",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("POST /api/curator/sources", () => {
  it("onboards a new source", async () => {
    const app = buildApp();
    const res = await post(app, "/sources", {
      name: "Curator Test Source",
      domain: `curator-onboard-${Date.now()}.example`,
      countryCode: "IN",
      language: "en",
      feedTimezone: "Asia/Kolkata",
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("rejects a missing required field", async () => {
    const app = buildApp();
    const res = await post(app, "/sources", { name: "Missing fields" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe("POST /api/curator/topics", () => {
  it("normalizes keywords: casefold, trim, collapse whitespace, drop duplicates", async () => {
    const app = buildApp();
    const res = await post(app, "/topics", {
      name: `Normalize test ${Date.now()}`,
      keywords: ["  AI  ", "ai", "C++", "  "],
      createdBy: "curator-1",
    });
    expect(res.statusCode).toBe(201);

    const row = await getPool().query("SELECT keywords FROM topics WHERE id = $1", [res.json().id]);
    expect(row.rows[0].keywords).toEqual(["ai", "c++"]);
    await app.close();
  });

  it("rejects a non-Latin-script keyword", async () => {
    const app = buildApp();
    const res = await post(app, "/topics", {
      name: `Script test ${Date.now()}`,
      keywords: ["चुनाव"],
      createdBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_keyword_script" });
    await app.close();
  });

  it("rejects more than 20 keywords", async () => {
    const app = buildApp();
    const res = await post(app, "/topics", {
      name: `Too many ${Date.now()}`,
      keywords: Array.from({ length: 21 }, (_, i) => `keyword${i}`),
      createdBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_keyword_count" });
    await app.close();
  });
});

describe("POST /api/curator/articles/:id/hide", () => {
  it("hides an article with a valid reason", async () => {
    const sourceId = await createTestSource("curator-hide-article");
    const { headlineArticleId } = await createTestStory(sourceId);
    const app = buildApp();

    const res = await post(app, `/articles/${headlineArticleId}/hide`, { reason: "takedown" });
    expect(res.statusCode).toBe(204);

    const row = await getPool().query("SELECT hidden_at, hidden_reason FROM articles WHERE id = $1", [headlineArticleId]);
    expect(row.rows[0].hidden_at).not.toBeNull();
    expect(row.rows[0].hidden_reason).toBe("takedown");
    await app.close();
  });

  it("rejects an invalid reason", async () => {
    const sourceId = await createTestSource("curator-hide-bad-reason");
    const { headlineArticleId } = await createTestStory(sourceId);
    const app = buildApp();
    const res = await post(app, `/articles/${headlineArticleId}/hide`, { reason: "not-a-real-reason" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 for an article that doesn't exist", async () => {
    const app = buildApp();
    const res = await post(app, "/articles/00000000-0000-0000-0000-000000000000/hide", { reason: "takedown" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/curator/stories/:id/hide", () => {
  it("hides an active story", async () => {
    const sourceId = await createTestSource("curator-hide-story");
    const { storyId } = await createTestStory(sourceId);
    const app = buildApp();

    const res = await post(app, `/stories/${storyId}/hide`, {});
    expect(res.statusCode).toBe(204);

    const row = await getPool().query("SELECT hidden_at FROM stories WHERE id = $1", [storyId]);
    expect(row.rows[0].hidden_at).not.toBeNull();
    await app.close();
  });
});

describe("POST /api/curator/cluster-reports", () => {
  it("records a wrong_merge report", async () => {
    const sourceId = await createTestSource("curator-cluster-report");
    const { storyId, headlineArticleId } = await createTestStory(sourceId);
    const app = buildApp();

    const res = await post(app, "/cluster-reports", {
      kind: "wrong_merge",
      storyId,
      articleId: headlineArticleId,
      reportedBy: "curator-1",
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("rejects wrong_merge without an articleId", async () => {
    const sourceId = await createTestSource("curator-cluster-missing-article");
    const { storyId } = await createTestStory(sourceId);
    const app = buildApp();
    const res = await post(app, "/cluster-reports", { kind: "wrong_merge", storyId, reportedBy: "curator-1" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "wrong_merge_needs_article_id" });
    await app.close();
  });

  it("records a should_merge report referencing another story", async () => {
    const sourceA = await createTestSource("curator-cluster-a");
    const sourceB = await createTestSource("curator-cluster-b");
    const { storyId } = await createTestStory(sourceA);
    const { storyId: otherStoryId } = await createTestStory(sourceB);
    const app = buildApp();

    const res = await post(app, "/cluster-reports", {
      kind: "should_merge",
      storyId,
      otherStoryId,
      reportedBy: "curator-1",
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("returns 404 for a story that doesn't exist", async () => {
    const app = buildApp();
    const res = await post(app, "/cluster-reports", {
      kind: "should_merge",
      storyId: "00000000-0000-0000-0000-000000000000",
      otherStoryId: "00000000-0000-0000-0000-000000000001",
      reportedBy: "curator-1",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("GET /api/curator/cluster-reports", () => {
  it("rejects without the curator key", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/curator/cluster-reports" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("lists a filed report with the story/article titles resolved", async () => {
    const sourceId = await createTestSource("curator-cluster-list");
    const { storyId, headlineArticleId } = await createTestStory(sourceId);
    const app = buildApp();

    const filed = await post(app, "/cluster-reports", {
      kind: "wrong_merge",
      storyId,
      articleId: headlineArticleId,
      reportedBy: "curator-list-1",
    });
    const { id } = filed.json();

    const res = await get(app, "/cluster-reports");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
    const item = body.items.find((r: { id: string }) => r.id === id);
    expect(item).toMatchObject({
      kind: "wrong_merge",
      storyId,
      articleId: headlineArticleId,
      reportedBy: "curator-list-1",
      resolvedAt: null,
    });
    expect(typeof item.storyTitle).toBe("string");
    expect(typeof item.articleTitle).toBe("string");
    await app.close();
  });

  it("filters by resolved=false, excluding nothing since nothing resolves reports yet", async () => {
    const sourceId = await createTestSource("curator-cluster-list-unresolved");
    const { storyId, headlineArticleId } = await createTestStory(sourceId);
    const app = buildApp();

    const filed = await post(app, "/cluster-reports", {
      kind: "wrong_merge",
      storyId,
      articleId: headlineArticleId,
      reportedBy: "curator-list-2",
    });
    const { id } = filed.json();

    const res = await get(app, "/cluster-reports?resolved=false");
    expect(res.statusCode).toBe(200);
    expect(res.json().items.some((r: { id: string }) => r.id === id)).toBe(true);
    await app.close();
  });

  it("rejects an invalid resolved value", async () => {
    const app = buildApp();
    const res = await get(app, "/cluster-reports?resolved=maybe");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_resolved" });
    await app.close();
  });

  it("rejects an out-of-range limit", async () => {
    const app = buildApp();
    const res = await get(app, "/cluster-reports?limit=1000");
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_limit" });
    await app.close();
  });
});
