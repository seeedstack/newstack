import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const EMAIL = "refresh-test@mail.example";
const PASSWORD = "a-strong-passphrase";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

function cookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(";")[0];
}

async function loginAndGetRefreshCookie(app: ReturnType<typeof buildApp>): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    payload: { email: EMAIL, password: PASSWORD },
  });
  return cookiePair(res.headers["set-cookie"] as string);
}

function refreshWith(app: ReturnType<typeof buildApp>, cookie: string) {
  return app.inject({
    method: "POST",
    url: "/auth/refresh",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json", cookie },
    payload: {},
  });
}

describe("POST /auth/refresh", () => {
  it("rejects a missing or unknown refresh token", async () => {
    const app = buildApp();
    const res = await refreshWith(app, "refresh_token=garbage");
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "refresh_rejected" });
    await app.close();
  });

  it("rotates on first use, grants grace siblings, then revokes the family on reuse past the limit", async () => {
    await createUser(EMAIL, PASSWORD);
    const app = buildApp();
    const original = await loginAndGetRefreshCookie(app);

    // First use: genuine rotation.
    const first = await refreshWith(app, original);
    expect(first.statusCode).toBe(200);

    // Re-presenting the already-rotated original twice more: grace (lost-response retries).
    const grace1 = await refreshWith(app, original);
    expect(grace1.statusCode).toBe(200);
    const grace2 = await refreshWith(app, original);
    expect(grace2.statusCode).toBe(200);

    // A fourth presentation exceeds the 3-children grace limit: reuse, family revoked.
    const reuse = await refreshWith(app, original);
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json()).toEqual({ error: "refresh_reuse_revoked" });

    // The legitimately-rotated child from the first call is now revoked too (whole family).
    const childCookie = cookiePair(first.headers["set-cookie"] as string);
    const afterRevocation = await refreshWith(app, childCookie);
    expect(afterRevocation.statusCode).toBe(401);
    expect(afterRevocation.json()).toEqual({ error: "refresh_rejected" });

    await app.close();
  });
});
