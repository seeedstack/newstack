import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createTestSource } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

describe("GET /api/public/sources/:id", () => {
  it("returns the source's display metadata", async () => {
    const sourceId = await createTestSource("source-meta");
    await delTestCache(`page:source:${sourceId}`);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources/${sourceId}` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.id).toBe(sourceId);
    expect(body.domain).toContain("source-meta");
    expect(body.status).toBe("active");
    expect(body.deprecatedAt).toBeNull();
    await app.close();
  });

  it("returns 404 for a source that doesn't exist", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/public/sources/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "not_found" });
    await app.close();
  });
});
