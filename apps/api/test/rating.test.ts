import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestSource } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

const CURATOR_KEY = "dev-insecure-curator-key";

function postRating(app: ReturnType<typeof buildApp>, sourceId: string, body: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/curator/sources/${sourceId}/ratings`,
    headers: { "content-type": "application/json", "x-curator-key": CURATOR_KEY, ...headers },
    payload: body as object,
  });
}

describe("GET /api/public/sources/:id/ratings", () => {
  it("returns null current and empty history for an unrated source", async () => {
    const sourceId = await createTestSource("rating-unrated");
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/ratings` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ current: null, history: [] });
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/public/sources/00000000-0000-0000-0000-000000000000/ratings",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/curator/sources/:id/ratings", () => {
  it("rejects a request without the curator key", async () => {
    const sourceId = await createTestSource("rating-no-key");
    const app = buildApp();
    const res = await postRating(app, sourceId, { factuality: "high", method: "internal-classifier-v1", ratedBy: "x" }, {
      "x-curator-key": "wrong",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("is not CSRF-gated: no Origin header required", async () => {
    const sourceId = await createTestSource("rating-no-origin");
    const app = buildApp();
    const res = await postRating(app, sourceId, {
      factuality: "high",
      confidence: "high",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("creates a rating, then supersedes it atomically on revision", async () => {
    const sourceId = await createTestSource("rating-revision");
    const app = buildApp();

    const first = await postRating(app, sourceId, {
      spectrum: "IN",
      biasRating: "left",
      factuality: "high",
      confidence: "high",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(first.statusCode).toBe(201);
    const firstId = first.json().id;

    await delTestCache(`page:source-ratings:${sourceId}`);
    const second = await postRating(app, sourceId, {
      spectrum: "IN",
      biasRating: "center",
      factuality: "high",
      confidence: "high",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(second.statusCode).toBe(201);
    expect(second.json().supersedes).toBe(firstId);

    const getRes = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/ratings` });
    const body = getRes.json();
    expect(body.current.id).toBe(second.json().id);
    expect(body.current.biasRating).toBe("center");
    expect(body.history).toHaveLength(2);
    expect(body.history.find((r: { id: string }) => r.id === firstId).supersededAt).not.toBeNull();
    await app.close();
  });

  it("rejects bias_rating without a spectrum (bias_needs_spectrum)", async () => {
    const sourceId = await createTestSource("rating-bias-no-spectrum");
    const app = buildApp();
    const res = await postRating(app, sourceId, {
      biasRating: "left",
      factuality: "high",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bias_needs_spectrum" });
    await app.close();
  });

  it("rejects manual-curation without a second rater", async () => {
    const sourceId = await createTestSource("rating-manual-missing");
    const app = buildApp();
    const res = await postRating(app, sourceId, {
      factuality: "high",
      method: "manual-curation",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "manual_needs_second_rater" });
    await app.close();
  });

  it("accepts manual-curation with two raters, rubric scores, and 3+ evidence entries", async () => {
    const sourceId = await createTestSource("rating-manual-ok");
    const app = buildApp();
    const res = await postRating(app, sourceId, {
      spectrum: "IN",
      biasRating: "center",
      factuality: "high",
      confidence: "high",
      method: "manual-curation",
      ratedBy: "curator-1",
      secondRater: "curator-2",
      rubricScores: { d1: 3, d2: 4 },
      evidence: [{ url: "a" }, { url: "b" }, { url: "c" }],
    });
    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await postRating(app, "00000000-0000-0000-0000-000000000000", {
      factuality: "high",
      method: "internal-classifier-v1",
      ratedBy: "curator-1",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
