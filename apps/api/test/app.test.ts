import { describe, expect, it } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";

describe("health check", () => {
  it("returns ok", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    await app.close();
  });
});

describe("CSRF defense (§9)", () => {
  it("rejects a mutating request with no Origin header", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/public/noop" });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "origin_mismatch" });
    await app.close();
  });

  it("rejects a mutating request with a non-JSON content type", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/public/noop",
      headers: { origin: WEB_ORIGIN, "content-type": "text/plain" },
      payload: "x",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({ error: "unsupported_content_type" });
    await app.close();
  });

  it("does not gate a GET request on Origin or content type", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe("CORS headers", () => {
  it("echoes the configured web origin with credentials allowed", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.headers["access-control-allow-origin"]).toBe(WEB_ORIGIN);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    await app.close();
  });
});
