import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { getPool } from "../src/db.js";
import { cleanupTestUser, createUser, mintPasswordResetToken } from "./helpers.js";

const EMAIL = "reset-test@mail.example";
const OLD_PASSWORD = "a-strong-passphrase";
const NEW_PASSWORD = "a-different-strong-passphrase";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

function post(app: ReturnType<typeof buildApp>, url: string, body: unknown) {
  return app.inject({
    method: "POST",
    url,
    headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    payload: body as object,
  });
}

describe("POST /auth/reset/request", () => {
  it("queues a password_reset outbox row for an existing account", async () => {
    const userId = await createUser(EMAIL, OLD_PASSWORD);
    const app = buildApp();
    const res = await post(app, "/auth/reset/request", { email: EMAIL });
    expect(res.statusCode).toBe(202);

    const outbox = await getPool().query("SELECT kind FROM email_outbox WHERE user_id = $1", [userId]);
    expect(outbox.rows).toEqual([{ kind: "password_reset" }]);
    await app.close();
  });

  it("still returns 202 for an email that has no account", async () => {
    const app = buildApp();
    const res = await post(app, "/auth/reset/request", { email: "nobody-here@mail.example" });
    expect(res.statusCode).toBe(202);
    await app.close();
  });
});

describe("POST /auth/reset/confirm", () => {
  it("changes the password, bumps auth_version, and revokes existing sessions", async () => {
    const userId = await createUser(EMAIL, OLD_PASSWORD);
    const app = buildApp();

    const loginRes = await post(app, "/auth/login", { email: EMAIL, password: OLD_PASSWORD });
    const refreshCookie = (loginRes.headers["set-cookie"] as string).split(";")[0];

    const token = await mintPasswordResetToken(userId);
    const confirmRes = await post(app, "/auth/reset/confirm", { token, newPassword: NEW_PASSWORD });
    expect(confirmRes.statusCode).toBe(200);

    const oldPasswordLogin = await post(app, "/auth/login", { email: EMAIL, password: OLD_PASSWORD });
    expect(oldPasswordLogin.statusCode).toBe(401);

    const newPasswordLogin = await post(app, "/auth/login", { email: EMAIL, password: NEW_PASSWORD });
    expect(newPasswordLogin.statusCode).toBe(200);

    const revokedRefresh = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      headers: { origin: WEB_ORIGIN, "content-type": "application/json", cookie: refreshCookie },
      payload: {},
    });
    expect(revokedRefresh.statusCode).toBe(401);

    await app.close();
  });

  it("rejects an invalid token", async () => {
    const app = buildApp();
    const res = await post(app, "/auth/reset/confirm", { token: "nope", newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_or_used" });
    await app.close();
  });
});
