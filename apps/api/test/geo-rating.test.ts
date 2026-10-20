import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestSource } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

const CURATOR_KEY = "dev-insecure-curator-key";

function postRating(
  app: ReturnType<typeof buildApp>,
  sourceId: string,
  topicCode: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return app.inject({
    method: "POST",
    url: `/api/curator/sources/${sourceId}/geo/${topicCode}`,
    headers: { "content-type": "application/json", "x-curator-key": CURATOR_KEY, ...headers },
    payload: body as object,
  });
}

describe("GET /api/public/sources/:id/geo", () => {
  it("returns all 8 topics, unrated, for a fresh source", async () => {
    const sourceId = await createTestSource("geo-unrated");
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/geo` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body)).toHaveLength(8);
    expect(body.IN_PAK).toEqual({ current: null, history: [] });
    expect(body.INDOPAC).toEqual({ current: null, history: [] });
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/public/sources/00000000-0000-0000-0000-000000000000/geo",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/curator/sources/:id/geo/:topicCode", () => {
  it("rejects a request without the curator key", async () => {
    const sourceId = await createTestSource("geo-no-key");
    const app = buildApp();
    const res = await postRating(app, sourceId, "IN_PAK", { stance: "leans_minus", method: "internal-classifier-v1", ratedBy: "x" }, {
      "x-curator-key": "wrong",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an invalid topic code", async () => {
    const sourceId = await createTestSource("geo-bad-topic");
    const app = buildApp();
    const res = await postRating(app, sourceId, "IN_BRAZIL", {
      stance: "leans_minus",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_topic_code" });
    await app.close();
  });

  it("rejects an invalid stance", async () => {
    const sourceId = await createTestSource("geo-bad-stance");
    const app = buildApp();
    const res = await postRating(app, sourceId, "IN_PAK", { stance: "neutral", method: "internal-classifier-v1", ratedBy: "x" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_stance" });
    await app.close();
  });

  it("creates a rating for one topic, then supersedes it atomically on revision, leaving other topics untouched", async () => {
    const sourceId = await createTestSource("geo-revision");
    const app = buildApp();

    const first = await postRating(app, sourceId, "IN_PAK", {
      stance: "leans_minus",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().id;

    await delTestCache(`page:source-geo:${sourceId}`);
    const second = await postRating(app, sourceId, "IN_PAK", {
      stance: "strongly_minus",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().supersedes).toBe(firstId);

    const getRes = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/geo` });
    const body = getRes.json();
    expect(body.IN_PAK.current.id).toBe(second.json().id);
    expect(body.IN_PAK.current.stance).toBe("strongly_minus");
    expect(body.IN_PAK.history).toHaveLength(2);
    expect(body.IN_CHN).toEqual({ current: null, history: [] });
    await app.close();
  });

  it("rejects manual-curation without a second rater", async () => {
    const sourceId = await createTestSource("geo-manual-missing");
    const app = buildApp();
    const res = await postRating(app, sourceId, "DEFSEC", {
      stance: "mixed_or_issue_dependent",
      method: "manual-curation",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "manual_needs_second_rater" });
    await app.close();
  });

  it("accepts manual-curation with two raters, rubric scores, and 3+ evidence entries", async () => {
    const sourceId = await createTestSource("geo-manual-ok");
    const app = buildApp();
    const res = await postRating(app, sourceId, "MULTILAT", {
      stance: "leans_plus",
      method: "manual-curation",
      ratedBy: "curator-1",
      secondRater: "curator-2",
      rubricScores: { g1: 1 },
      evidence: [{ url: "a" }, { url: "b" }, { url: "c" }],
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await postRating(app, "00000000-0000-0000-0000-000000000000", "IN_PAK", {
      stance: "leans_minus",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
