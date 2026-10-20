import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPool } from "../src/db.js";
import { createTestSource } from "./feed-helpers.js";
import { delTestCache } from "./redis-helpers.js";

const CURATOR_KEY = "dev-insecure-curator-key";

async function setCategories(sourceId: string, categories: string[]) {
  await getPool().query("DELETE FROM source_categories WHERE source_id = $1", [sourceId]);
  for (const category of categories) {
    await getPool().query("INSERT INTO source_categories (source_id, category) VALUES ($1, $2)", [sourceId, category]);
  }
}

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

describe("GET /api/public/sources (list/search)", () => {
  it("filters by category", async () => {
    const label = `sources-list-category-${Date.now()}`;
    const biz = await createTestSource(`${label}-biz`);
    const national = await createTestSource(`${label}-national`);
    await setCategories(biz, ["business"]);
    await setCategories(national, ["national"]);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources?category=business&q=${label}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([biz]);
    expect(body.items[0].categories).toEqual(["business"]);
    await app.close();
  });

  it("filters by name substring", async () => {
    const label = `sources-list-q-${Date.now()}`;
    const match = await createTestSource(`${label}-match`);
    await createTestSource(`unrelated-${Date.now()}`);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources?q=${label}` });
    const body = res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([match]);
    await app.close();
  });

  it("rejects an unknown category", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/sources?category=not_a_real_category" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_category" });
    await app.close();
  });

  it("paginates with limit/offset and reports total", async () => {
    const label = `sources-list-page-${Date.now()}`;
    const first = await createTestSource(`${label}-a`);
    const second = await createTestSource(`${label}-b`);

    const app = buildApp();
    const res = await app.inject({ method: "GET", url: `/api/public/sources?q=${label}&limit=1&offset=0` });
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items.length).toBe(1);
    expect(body.items[0].id).toBe(first);

    const res2 = await app.inject({ method: "GET", url: `/api/public/sources?q=${label}&limit=1&offset=1` });
    expect(res2.json().items[0].id).toBe(second);
    await app.close();
  });
});

describe("PUT /api/curator/sources/:id/categories", () => {
  function putCategories(app: ReturnType<typeof buildApp>, sourceId: string, categories: string[], key = CURATOR_KEY) {
    return app.inject({
      method: "PUT",
      url: `/api/curator/sources/${sourceId}/categories`,
      headers: { "content-type": "application/json", "x-curator-key": key },
      payload: { categories },
    });
  }

  it("rejects a request without the curator key", async () => {
    const sourceId = await createTestSource("categories-no-key");
    const app = buildApp();
    const res = await putCategories(app, sourceId, ["national"], "wrong");
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an invalid category", async () => {
    const sourceId = await createTestSource("categories-invalid");
    const app = buildApp();
    const res = await putCategories(app, sourceId, ["not_a_real_category"]);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_category" });
    await app.close();
  });

  it("sets then replaces the full category set, deduping", async () => {
    const sourceId = await createTestSource("categories-replace");
    const app = buildApp();

    const first = await putCategories(app, sourceId, ["national", "business", "national"]);
    expect(first.statusCode).toBe(200);
    expect(first.json().categories.sort()).toEqual(["business", "national"]);

    const second = await putCategories(app, sourceId, ["regional"]);
    expect(second.json().categories).toEqual(["regional"]);

    const listRes = await app.inject({ method: "GET", url: `/api/public/sources?category=national` });
    expect(listRes.json().items.map((i: { id: string }) => i.id)).not.toContain(sourceId);
    await app.close();
  });

  it("returns 404 for a nonexistent source", async () => {
    const app = buildApp();
    const res = await putCategories(app, "00000000-0000-0000-0000-000000000000", ["national"]);
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
