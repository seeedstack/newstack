import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const EMAIL = "login-test@mail.example";
const PASSWORD = "a-strong-passphrase";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

function post(app: ReturnType<typeof buildApp>, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/auth/login",
    headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    payload: body as object,
  });
}

describe("POST /auth/login", () => {
  it("issues an access token and a refresh cookie on correct credentials", async () => {
    await createUser(EMAIL, PASSWORD);
    const app = buildApp();

    const res = await post(app, { email: EMAIL, password: PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().accessToken).toBe("string");

    const cookie = res.headers["set-cookie"] as string;
    expect(cookie).toContain("refresh_token=");
    expect(cookie).toContain("Path=/auth/refresh");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    await app.close();
  });

  it("returns the same generic error for wrong password and unknown email", async () => {
    await createUser(EMAIL, PASSWORD);
    const app = buildApp();

    const wrongPassword = await post(app, { email: EMAIL, password: "totally-wrong-password" });
    const unknownEmail = await post(app, { email: "nobody-here@mail.example", password: PASSWORD });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
    expect(wrongPassword.json()).toEqual({ error: "invalid_credentials" });
    await app.close();
  });
});
