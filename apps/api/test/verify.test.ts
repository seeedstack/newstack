import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { getPool } from "../src/db.js";
import { cleanupTestUser, createUser, mintEmailVerificationToken } from "./helpers.js";

const EMAIL = "verify-test@mail.example";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

function post(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/auth/verify",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    payload: body as object,
  });
}

describe("POST /auth/verify", () => {
  it("sets email_verified_at and consumes the token", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = await mintEmailVerificationToken(userId);
    const app = buildApp();

    const res = await post(app, { token });
    expect(res.statusCode).toBe(200);

    const user = await getPool().query("SELECT email_verified_at FROM users WHERE id = $1", [userId]);
    expect(user.rows[0].email_verified_at).not.toBeNull();

    // Token is single-use.
    const second = await post(app, { token });
    expect(second.statusCode).toBe(400);
    expect(second.json()).toEqual({ error: "invalid_or_used" });
    await app.close();
  });

  it("rejects an expired token", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = await mintEmailVerificationToken(userId, -1000);
    const app = buildApp();

    const res = await post(app, { token });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_or_used" });
    await app.close();
  });

  it("rejects an unknown token", async () => {
    const app = buildApp();
    const res = await post(app, { token: "not-a-real-token" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
