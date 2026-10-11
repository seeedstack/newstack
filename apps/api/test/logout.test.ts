import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { getPool } from "../src/db.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const EMAIL = "logout-test@mail.example";
const PASSWORD = "a-strong-passphrase";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

function cookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(";")[0];
}

async function login(app: ReturnType<typeof buildApp>) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    payload: { email: EMAIL, password: PASSWORD },
  });
  return { cookie: cookiePair(res.headers["set-cookie"] as string), accessToken: res.json().accessToken as string };
}

function refreshWith(app: ReturnType<typeof buildApp>, cookie: string) {
  return app.inject({
    method: "POST",
    url: "/auth/refresh",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json", cookie },
    payload: {},
  });
}

function post(app: ReturnType<typeof buildApp>, url: string, cookie?: string) {
  return app.inject({
    method: "POST",
    url,
    headers: { origin: WEB_ORIGIN, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    payload: {},
  });
}

describe("POST /auth/logout", () => {
  it("204s and clears the cookie even with no session presented", async () => {
    const app = buildApp();
    const res = await post(app, "/auth/logout");
    expect(res.statusCode).toBe(204);
    expect(res.headers["set-cookie"]).toContain("Max-Age=0");
    await app.close();
  });

  it("revokes the session so a later refresh is rejected, and is idempotent on repeat calls", async () => {
    await createUser(EMAIL, PASSWORD);
    const app = buildApp();
    const { cookie } = await login(app);

    const first = await post(app, "/auth/logout", cookie);
    expect(first.statusCode).toBe(204);

    const second = await post(app, "/auth/logout", cookie);
    expect(second.statusCode).toBe(204);

    const refreshAfter = await refreshWith(app, cookie);
    expect(refreshAfter.statusCode).toBe(401);
    expect(refreshAfter.json()).toEqual({ error: "refresh_rejected" });
    await app.close();
  });

  it("only revokes the presented session's family, not the user's other sessions", async () => {
    await createUser(EMAIL, PASSWORD);
    const app = buildApp();
    const { cookie: cookieA } = await login(app);
    const { cookie: cookieB } = await login(app);

    await post(app, "/auth/logout", cookieA);

    const refreshB = await refreshWith(app, cookieB);
    expect(refreshB.statusCode).toBe(200);
    await app.close();
  });
});

describe("POST /auth/logout-all", () => {
  it("204s with no session presented", async () => {
    const app = buildApp();
    const res = await post(app, "/auth/logout-all");
    expect(res.statusCode).toBe(204);
    await app.close();
  });

  it("revokes every session for the user and invalidates existing access tokens immediately", async () => {
    await createUser(EMAIL, PASSWORD);
    const app = buildApp();
    const { cookie: cookieA, accessToken } = await login(app);
    const { cookie: cookieB } = await login(app);

    const res = await post(app, "/auth/logout-all", cookieA);
    expect(res.statusCode).toBe(204);

    const refreshA = await refreshWith(app, cookieA);
    expect(refreshA.statusCode).toBe(401);
    const refreshB = await refreshWith(app, cookieB);
    expect(refreshB.statusCode).toBe(401);

    const whoami = await app.inject({ method: "GET", url: "/api/whoami", headers: { authorization: `Bearer ${accessToken}` } });
    expect(whoami.statusCode).toBe(401);
    expect(whoami.json()).toEqual({ error: "access_version_mismatch" });
    await app.close();
  });

  it("is idempotent — a second call with the now-revoked cookie still 204s without bumping again", async () => {
    const userId = await createUser(EMAIL, PASSWORD);
    const app = buildApp();
    const { cookie } = await login(app);

    await post(app, "/auth/logout-all", cookie);
    const second = await post(app, "/auth/logout-all", cookie);
    expect(second.statusCode).toBe(204);

    // Bumped once (1 -> 2) on the first call; the second call's cookie is already revoked,
    // so there's no session left to resolve a user from — nothing left to bump.
    const row = await getPool().query<{ auth_version: number }>("SELECT auth_version FROM users WHERE id = $1", [userId]);
    expect(row.rows[0].auth_version).toBe(2);
    await app.close();
  });
});
