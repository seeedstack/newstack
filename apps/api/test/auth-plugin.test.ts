import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { getPool } from "../src/db.js";
import { signAccessToken } from "../src/features/auth/jwt.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const EMAIL = "auth-plugin-test@mail.example";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

describe("/api/* auth plugin", () => {
  it("rejects a request with no Authorization header", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/whoami" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    await app.close();
  });

  it("rejects a malformed token", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/whoami",
      headers: { authorization: "Bearer not-a-jwt" },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthorized" });
    await app.close();
  });

  it("lets a valid token through and attaches request.userId", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const app = buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/whoami",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId });
    await app.close();
  });

  it("rejects a token whose av no longer matches auth_version (bumped since issue)", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    await getPool().query("UPDATE users SET auth_version = auth_version + 1 WHERE id = $1", [userId]);
    const app = buildApp();

    const res = await app.inject({
      method: "GET",
      url: "/api/whoami",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "access_version_mismatch" });
    await app.close();
  });
});
