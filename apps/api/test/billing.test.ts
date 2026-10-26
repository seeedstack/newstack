import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp, WEB_ORIGIN } from "../src/app.js";
import { signAccessToken } from "../src/features/auth/jwt.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const EMAIL = "billing-test@mail.example";

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

function withAuth(token: string) {
  return { authorization: `Bearer ${token}`, origin: WEB_ORIGIN, "content-type": "application/json" };
}

describe("/api/public/plans", () => {
  it("lists the two seeded plans without auth", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/public/plans" });
    expect(res.statusCode).toBe(200);
    const codes = res.json().items.map((p: { code: string }) => p.code).sort();
    expect(codes).toEqual(["annual_360", "monthly_60"]);
    await app.close();
  });
});

describe("/api/billing/*", () => {
  it("rejects an unauthenticated checkout", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
      payload: { planCode: "monthly_60" },
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("rejects checkout for a plan not yet provisioned at the gateway", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const app = buildApp();
    // Migration seeds plans with gateway_plan_id = NULL until a provisioning step fills it in.
    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: withAuth(token),
      payload: { planCode: "monthly_60" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("plan_not_provisioned");
    await app.close();
  });

  it("rejects checkout for an unknown plan code", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/api/billing/checkout",
      headers: withAuth(token),
      payload: { planCode: "nonexistent" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("unknown_plan");
    await app.close();
  });

  it("reports no subscription for a fresh user", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/billing/subscription", headers: withAuth(token) });
    expect(res.json()).toEqual({ status: "none", entitled: false, planCode: null, currentPeriodEnd: null, cancelAtPeriodEnd: false });
    await app.close();
  });

  it("404s canceling when there's no subscription", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    const token = signAccessToken(userId, 1);
    const app = buildApp();
    const res = await app.inject({ method: "POST", url: "/api/billing/cancel", headers: withAuth(token), payload: {} });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe("POST /webhooks/paypal", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects a payload with an invalid signature", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 }))
    );
    const app = buildApp();
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/paypal",
      headers: { "content-type": "application/json" },
      payload: { id: "evt_1", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: {} },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("is exempt from the Origin/CSRF checks applied to other mutating routes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ verification_status: "FAILURE" }), { status: 200 }))
    );
    const app = buildApp();
    // No Origin header at all — a real /api/* POST would get 403 origin_mismatch here.
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/paypal",
      headers: { "content-type": "application/json" },
      payload: { id: "evt_2", event_type: "BILLING.SUBSCRIPTION.ACTIVATED", resource: {} },
    });
    expect(res.statusCode).not.toBe(403);
    await app.close();
  });
});
