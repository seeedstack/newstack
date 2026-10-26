import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestSource } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

const CURATOR_KEY = "dev-insecure-curator-key";

function postOwnership(app: ReturnType<typeof buildApp>, sourceId: string, body: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/curator/sources/${sourceId}/ownership`,
    headers: { "content-type": "application/json", "x-curator-key": CURATOR_KEY, ...headers },
    payload: body as object,
  });
}

describe("GET /api/public/sources/:id/ownership", () => {
  it("returns null for a source never researched", async () => {
    const sourceId = await createTestSource("ownership-unrated");
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/ownership` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/public/sources/00000000-0000-0000-0000-000000000000/ownership",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /api/curator/sources/:id/ownership", () => {
  it("rejects a request without the curator key", async () => {
    const sourceId = await createTestSource("ownership-no-key");
    const app = buildApp();
    const res = await postOwnership(
      app,
      sourceId,
      { ownershipTransparency: "disclosed", editorialIndependence: "no_documented_influence" },
      { "x-curator-key": "wrong" }
    );
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("creates then overwrites the record in place, not superseding it", async () => {
    const sourceId = await createTestSource("ownership-upsert");
    const app = buildApp();

    const first = await postOwnership(app, sourceId, {
      ownershipTransparency: "insufficient_evidence",
      editorialIndependence: "insufficient_evidence",
    });
    expect(first.statusCode).toBe(200);

    await delTestCache(`page:source-ownership:${sourceId}`);
    const second = await postOwnership(app, sourceId, {
      ownershipTransparency: "partially_disclosed",
      editorialIndependence: "no_documented_influence",
      ratedBy: "curator-1",
      notes: "parent company confirmed via MCA filing",
    });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      sourceId,
      ownershipTransparency: "partially_disclosed",
      editorialIndependence: "no_documented_influence",
      ratedBy: "curator-1",
    });

    const getRes = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}/ownership` });
    expect(getRes.json().ownershipTransparency).toBe("partially_disclosed");
    await app.close();
  });

  it("rejects an invalid ownership transparency value", async () => {
    const sourceId = await createTestSource("ownership-invalid-transparency");
    const app = buildApp();
    const res = await postOwnership(app, sourceId, {
      ownershipTransparency: "fully_owned_by_the_state",
      editorialIndependence: "no_documented_influence",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_ownership_transparency" });
    await app.close();
  });

  it("rejects documented_instances without evidence", async () => {
    const sourceId = await createTestSource("ownership-missing-evidence");
    const app = buildApp();
    const res = await postOwnership(app, sourceId, {
      ownershipTransparency: "disclosed",
      editorialIndependence: "documented_instances",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "documented_instances_needs_evidence" });
    await app.close();
  });

  it("accepts documented_instances with evidence", async () => {
    const sourceId = await createTestSource("ownership-with-evidence");
    const app = buildApp();
    const res = await postOwnership(app, sourceId, {
      ownershipTransparency: "disclosed",
      editorialIndependence: "documented_instances",
      evidence: [{ url: "https://example.com/court-judgment", archived: true, dimension: "editorial_influence" }],
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await postOwnership(app, "00000000-0000-0000-0000-000000000000", {
      ownershipTransparency: "disclosed",
      editorialIndependence: "no_documented_influence",
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
