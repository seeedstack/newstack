// PAYPAL_SPEC Phase 2.3 "script it so it's repeatable per environment": one-time per-environment
// setup that creates the PayPal product + billing plans and writes gateway_plan_id back onto
// `plans`. Run once against each environment (dev/staging/prod use separate PayPal apps).
// Idempotent: re-running skips plans that already have a gateway_plan_id.
import { getPool } from "../../db.js";
import * as repo from "./repo.js";

const API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? "";

async function getToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`paypal oauth: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function createProduct(token: string): Promise<string> {
  const res = await fetch(`${API_BASE}/v1/catalogs/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Newstack Reader Subscription", type: "SERVICE", category: "SOFTWARE" }),
  });
  if (!res.ok) throw new Error(`paypal create product: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

async function createPlan(token: string, productId: string, plan: repo.PlanRow): Promise<string> {
  const amount = (plan.amount_paise / 100).toFixed(2);
  const res = await fetch(`${API_BASE}/v1/billing/plans`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      product_id: productId,
      name: plan.name,
      billing_cycles: [
        {
          frequency: { interval_unit: plan.interval.toUpperCase(), interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // infinite, until canceled
          pricing_scheme: { fixed_price: { value: amount, currency_code: "INR" } },
        },
      ],
      payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
    }),
  });
  if (!res.ok) throw new Error(`paypal create plan ${plan.code}: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

export async function provisionPlans(): Promise<void> {
  const pool = getPool();
  const plans = await repo.listActivePlans(pool);
  const unprovisioned = plans.filter((p) => p.gateway_plan_id === null);
  if (unprovisioned.length === 0) {
    console.log("[billing] all plans already provisioned");
    return;
  }
  const token = await getToken();
  const productId = await createProduct(token);
  for (const plan of unprovisioned) {
    const gatewayPlanId = await createPlan(token, productId, plan);
    await repo.setPlanGatewayId(pool, plan.id, gatewayPlanId);
    console.log(`[billing] provisioned ${plan.code} -> ${gatewayPlanId}`);
  }
}

if (process.argv[1]?.endsWith("provision-plans.ts") || process.argv[1]?.endsWith("provision-plans.js")) {
  provisionPlans()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[billing] provisioning failed", err);
      process.exit(1);
    });
}
