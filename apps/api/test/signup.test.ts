import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { getPool } from "../src/db.js";
import { getRedis } from "../src/redis.js";

// *.example is RFC 2606 reserved; mirrors apps/ingestion's test-fixture convention.
const EMAIL = "signup-test@mail.example";

async function cleanup(): Promise<void> {
  await getPool().query(
    "DELETE FROM email_outbox WHERE user_id IN (SELECT id FROM users WHERE lower(email) = lower($1))",
    [EMAIL]
  );
  await getPool().query("DELETE FROM users WHERE lower(email) = lower($1)", [EMAIL]);
  // Tests reuse the same email across cases; the signup rate limit (3/hour, §9) is keyed on
  // it too, so it needs the same kind of reset as the DB rows above. Best-effort: the very
  // first call can race the client's initial connection (nothing to clean up yet anyway).
  try {
    await getRedis().del(`ratelimit:signup:email:${EMAIL}:3600`);
  } catch {
    // ignore
  }
}

beforeEach(cleanup);
afterEach(cleanup);

function post(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/auth/signup",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    payload: body as object,
  });
}

describe("POST /auth/signup", () => {
  it("creates a user and queues verify_email for a new address", async () => {
    const app = buildApp();
    const res = await post(app, { email: EMAIL, password: "a-strong-passphrase" });
    expect(res.statusCode).toBe(202);

    const users = await getPool().query("SELECT id, email_verified_at FROM users WHERE lower(email) = lower($1)", [EMAIL]);
    expect(users.rowCount).toBe(1);
    expect(users.rows[0].email_verified_at).toBeNull();

    const outbox = await getPool().query(
      "SELECT kind, status FROM email_outbox WHERE user_id = $1",
      [users.rows[0].id]
    );
    expect(outbox.rows).toEqual([{ kind: "verify_email", status: "pending" }]);
    await app.close();
  });

  it("does not duplicate the user and queues account_exists on a repeat signup", async () => {
    const app = buildApp();
    await post(app, { email: EMAIL, password: "a-strong-passphrase" });
    const res = await post(app, { email: EMAIL, password: "a-different-passphrase" });
    expect(res.statusCode).toBe(202);

    const users = await getPool().query("SELECT id FROM users WHERE lower(email) = lower($1)", [EMAIL]);
    expect(users.rowCount).toBe(1);

    const outbox = await getPool().query(
      "SELECT kind FROM email_outbox WHERE user_id = $1 ORDER BY created_at",
      [users.rows[0].id]
    );
    expect(outbox.rows.map((r) => r.kind)).toEqual(["verify_email", "account_exists"]);
    await app.close();
  });

  it("rejects a malformed email with 400 invalid_email", async () => {
    const app = buildApp();
    const res = await post(app, { email: "not-an-email", password: "a-strong-passphrase" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_email" });
    await app.close();
  });

  it("rejects a too-short password with 400 invalid_password", async () => {
    const app = buildApp();
    const res = await post(app, { email: EMAIL, password: "short" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "invalid_password" });
    await app.close();
  });

  it("rejects a top-10k common password with 400 common_password", async () => {
    const app = buildApp();
    const res = await post(app, { email: EMAIL, password: "qwertyuiop" });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "common_password" });
    await app.close();
  });

  it("rate-limits repeated signups for the same email (§9: 3/hour)", async () => {
    const app = buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await post(app, { email: EMAIL, password: "a-strong-passphrase" });
      expect(res.statusCode).toBe(202);
    }
    const fourth = await post(app, { email: EMAIL, password: "a-strong-passphrase" });
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json()).toEqual({ error: "rate_limited" });
    await app.close();
  });
});
