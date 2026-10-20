import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestSource } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

const CURATOR_KEY = "dev-insecure-curator-key";

function postRating(app: ReturnType<typeof buildApp>, sourceId: string, body: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/curator/sources/${sourceId}/sensationalism`,
    headers: { "content-type": "application/json", "x-curator-key": CURATOR_KEY, ...headers },
    payload: body as object,
  });
}

describe("GET /api/public/sources/:id/sensationalism", () => {
  it("returns null current and empty history for an unrated source", async () => {
    const sourceId = await createTestSource("sens-unrated");
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/sensationalism` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ current: null, history: [] });
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/public/sources/00000000-0000-0000-0000-000000000000/sensationalism",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/curator/sources/:id/sensationalism", () => {
  it("rejects a request without the curator key", async () => {
    const sourceId = await createTestSource("sens-no-key");
    const app = buildApp();
    const res = await postRating(app, sourceId, { level: "low", method: "internal-classifier-v1", ratedBy: "x" }, {
      "x-curator-key": "wrong",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("creates a rating, then supersedes it atomically on revision", async () => {
    const sourceId = await createTestSource("sens-revision");
    const app = buildApp();

    const first = await postRating(app, sourceId, {
      level: "low",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().id;

    await delTestCache(`page:source-sensationalism:${sourceId}`);
    const second = await postRating(app, sourceId, {
      level: "high",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().supersedes).toBe(firstId);

    const getRes = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/sensationalism` });
    const body = getRes.json();
    expect(body.current.id).toBe(second.json().id);
    expect(body.current.level).toBe("high");
    expect(body.history).toHaveLength(2);
    expect(body.history.find((r: { id: string }) => r.id === firstId).supersededAt).not.toBeNull();
    await app.close();
  });

  it("rejects an invalid level", async () => {
    const sourceId = await createTestSource("sens-invalid-level");
    const app = buildApp();
    const res = await postRating(app, sourceId, { level: "extreme", method: "internal-classifier-v1", ratedBy: "x" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_level" });
    await app.close();
  });

  it("rejects manual-curation without a second rater", async () => {
    const sourceId = await createTestSource("sens-manual-missing");
    const app = buildApp();
    const res = await postRating(app, sourceId, {
      level: "medium",
      method: "manual-curation",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "manual_needs_second_rater" });
    await app.close();
  });

  it("accepts manual-curation with two raters, rubric scores, and 3+ evidence entries", async () => {
    const sourceId = await createTestSource("sens-manual-ok");
    const app = buildApp();
    const res = await postRating(app, sourceId, {
      level: "medium",
      method: "manual-curation",
      ratedBy: "curator-1",
      secondRater: "curator-2",
      rubricScores: { s1: 1, s2: 2, s3: 0 },
      evidence: [{ url: "a" }, { url: "b" }, { url: "c" }],
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await postRating(app, "00000000-0000-0000-0000-000000000000", {
      level: "low",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
