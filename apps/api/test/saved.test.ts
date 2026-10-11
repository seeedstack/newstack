import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { signAccessToken } from "../src/features/auth/jwt.js";
import { createTestSource, createTestStory, createTestTopic } from "./feed-helpers.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const EMAIL = "saved-test@mail.example";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

// §9 CSRF: mutating /api/* requests need Origin + JSON content-type too, same as /auth/*.
function withAuth(token: string) {
  return { authorization: `Bearer ${token}`, origin: WEB_ORIGIN, "content-type": "application/json" };
}

describe("/api/me/saved-sources", () => {
  it("rejects an unauthenticated request", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/me/saved-sources" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("saves (idempotently), lists, and unsaves (idempotently)", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const sourceId = await createTestSource("saved-source");
    const app = buildApp();

    const putRes = await app.inject({
      method: "PUT",
      url: `/api/me/saved-sources/${sourceId}`,
      headers: withAuth(token),
      payload: {},
    });
    expect(putRes.statusCode).toBe(204);

    // Idempotent: saving again doesn't duplicate or error.
    const putAgain = await app.inject({
      method: "PUT",
      url: `/api/me/saved-sources/${sourceId}`,
      headers: withAuth(token),
      payload: {},
    });
    expect(putAgain.statusCode).toBe(204);

    const listRes = await app.inject({ method: "GET", url: "/api/me/saved-sources", headers: withAuth(token) });
    expect(listRes.json().items).toEqual([sourceId]);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/me/saved-sources/${sourceId}`,
      headers: withAuth(token),
      payload: {},
    });
    expect(deleteRes.statusCode).toBe(204);

    const afterDelete = await app.inject({ method: "GET", url: "/api/me/saved-sources", headers: withAuth(token) });
    expect(afterDelete.json().items).toEqual([]);

    // Idempotent: unsaving something already unsaved is still a clean 204.
    const deleteAgain = await app.inject({
      method: "DELETE",
      url: `/api/me/saved-sources/${sourceId}`,
      headers: withAuth(token),
      payload: {},
    });
    expect(deleteAgain.statusCode).toBe(204);
    await app.close();
  });

  it("returns 404 when saving a source that doesn't exist", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const app = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/me/saved-sources/00000000-0000-0000-0000-000000000000",
      headers: withAuth(token),
      payload: {},
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("/api/me/saved-stories and /api/me/saved-topics", () => {
  it("save and list a story", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const sourceId = await createTestSource("saved-story-src");
    const { storyId } = await createTestStory(sourceId);
    const app = buildApp();

    await app.inject({ method: "PUT", url: `/api/me/saved-stories/${storyId}`, headers: withAuth(token), payload: {} });
    const res = await app.inject({ method: "GET", url: "/api/me/saved-stories", headers: withAuth(token) });
    expect(res.json().items).toEqual([storyId]);
    await app.close();
  });

  it("save and list a topic", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const topicId = await createTestTopic("Saved topic test", ["widgets"]);
    const app = buildApp();

    await app.inject({ method: "PUT", url: `/api/me/saved-topics/${topicId}`, headers: withAuth(token), payload: {} });
    const res = await app.inject({ method: "GET", url: "/api/me/saved-topics", headers: withAuth(token) });
    expect(res.json().items).toEqual([topicId]);
    await app.close();
  });
});
