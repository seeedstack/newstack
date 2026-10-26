// PayPal implementation of the PaymentGateway adapter. Plain fetch, no SDK dependency —
// same call this codebase already made for ResendMailTransport (mailer/transport.ts):
// a handful of REST calls don't earn a dependency.
import type {
  CreateOneTimeOrderResult,
  CreateSubscriptionResult,
  NormalizedEvent,
  NormalizedEventType,
  NormalizedPayment,
  PaymentGateway,
} from "./gateway.js";

const API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID ?? "";
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET ?? "";
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID ?? "";
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

// PayPal event type -> this adapter's normalized type. Unlisted event types are dropped by
// parseWebhook's caller (webhook_events still records the raw payload; see routes.ts).
const EVENT_TYPE_MAP: Record<string, NormalizedEventType> = {
  "BILLING.SUBSCRIPTION.ACTIVATED": "subscription.activated",
  "PAYMENT.SALE.COMPLETED": "subscription.charged",
  "BILLING.SUBSCRIPTION.SUSPENDED": "subscription.halted",
  "BILLING.SUBSCRIPTION.EXPIRED": "subscription.halted",
  "BILLING.SUBSCRIPTION.CANCELLED": "subscription.cancelled",
  "PAYMENT.SALE.DENIED": "payment.failed",
  "PAYMENT.SALE.REFUSED": "payment.failed",
  "PAYMENT.CAPTURE.REFUNDED": "refund.processed",
};

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken !== null && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`paypal oauth: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
  return cachedToken.value;
}

async function paypalFetch(path: string, init: { method: string; body?: unknown; idempotencyKey?: string }) {
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (init.idempotencyKey !== undefined) headers["PayPal-Request-Id"] = init.idempotencyKey;
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`paypal ${init.method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export class PayPalGateway implements PaymentGateway {
  async createSubscription(input: {
    userId: string;
    planCode: string;
    gatewayPlanId: string;
  }): Promise<CreateSubscriptionResult> {
    const body = (await paypalFetch("/v1/billing/subscriptions", {
      method: "POST",
      idempotencyKey: `sub-${input.userId}-${input.planCode}-${Date.now()}`,
      body: {
        plan_id: input.gatewayPlanId,
        custom_id: input.userId,
        application_context: {
          brand_name: "Newstack",
          return_url: `${WEB_ORIGIN}/account/billing?status=success`,
          cancel_url: `${WEB_ORIGIN}/subscribe?status=cancelled`,
        },
      },
    })) as { id: string; links: { rel: string; href: string }[] };
    const approveLink = body.links.find((l) => l.rel === "approve")?.href;
    return {
      gatewaySubscriptionId: body.id,
      checkoutParams: { approveUrl: approveLink ?? null, subscriptionId: body.id },
    };
  }

  // PAYPAL_SPEC §4.8 one-time annual path: a plain Orders v2 purchase, no mandate.
  async createOneTimeOrder(input: {
    userId: string;
    planCode: string;
    amountPaise: number;
  }): Promise<CreateOneTimeOrderResult> {
    const amountInr = (input.amountPaise / 100).toFixed(2);
    const body = (await paypalFetch("/v2/checkout/orders", {
      method: "POST",
      idempotencyKey: `order-${input.userId}-${input.planCode}-${Date.now()}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [{ custom_id: input.userId, amount: { currency_code: "INR", value: amountInr } }],
        application_context: {
          brand_name: "Newstack",
          return_url: `${WEB_ORIGIN}/account/billing?status=success`,
          cancel_url: `${WEB_ORIGIN}/subscribe?status=cancelled`,
        },
      },
    })) as { id: string; links: { rel: string; href: string }[] };
    const approveLink = body.links.find((l) => l.rel === "approve")?.href;
    return { gatewayOrderId: body.id, checkoutParams: { approveUrl: approveLink ?? null, orderId: body.id } };
  }

  async cancelSubscription(gatewaySubId: string, atCycleEnd: boolean): Promise<void> {
    // PayPal has no native "cancel at cycle end" — FR-C2's semantics are implemented in
    // service.ts via cancel_at_period_end + the expiry sweeper; a true cancel-now call to
    // PayPal only happens once that period actually ends, or immediately if atCycleEnd=false.
    if (atCycleEnd) return;
    await paypalFetch(`/v1/billing/subscriptions/${gatewaySubId}/cancel`, {
      method: "POST",
      body: { reason: "Cancelled by user" },
    });
  }

  async refundPayment(gatewayPaymentId: string, amountPaise: number): Promise<{ refundId: string }> {
    const amountInr = (amountPaise / 100).toFixed(2);
    const body = (await paypalFetch(`/v2/payments/captures/${gatewayPaymentId}/refund`, {
      method: "POST",
      idempotencyKey: `refund-${gatewayPaymentId}-${Date.now()}`,
      body: { amount: { currency_code: "INR", value: amountInr } },
    })) as { id: string };
    return { refundId: body.id };
  }

  // PAYPAL_SPEC §9 "webhook signature verification, constant-time comparison": PayPal doesn't
  // expose a local HMAC secret to compare against — verification is itself a signed API call
  // (https://developer.paypal.com/api/rest/webhooks/#verify-webhook-signature), which is what
  // "constant-time comparison" means in PayPal's model: the comparison happens server-side,
  // on PayPal's infrastructure, not against a secret this process holds.
  async verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Promise<boolean> {
    const header = (name: string): string => {
      const value = headers[name];
      return Array.isArray(value) ? value[0] ?? "" : value ?? "";
    };
    const response = (await paypalFetch("/v1/notifications/verify-webhook-signature", {
      method: "POST",
      body: {
        auth_algo: header("paypal-auth-algo"),
        cert_url: header("paypal-cert-url"),
        transmission_id: header("paypal-transmission-id"),
        transmission_sig: header("paypal-transmission-sig"),
        transmission_time: header("paypal-transmission-time"),
        webhook_id: WEBHOOK_ID,
        webhook_event: JSON.parse(rawBody.toString("utf8")),
      },
    })) as { verification_status: string };
    return response.verification_status === "SUCCESS";
  }

  parseWebhook(rawBody: Buffer): NormalizedEvent {
    const event = JSON.parse(rawBody.toString("utf8")) as {
      id: string;
      event_type: string;
      create_time: string;
      resource: Record<string, unknown>;
    };
    const type = EVENT_TYPE_MAP[event.event_type];
    if (type === undefined) throw new UnhandledWebhookEventError(event.event_type);

    const resource = event.resource;
    const gatewaySubId =
      (resource.billing_agreement_id as string | undefined) ?? (resource.id as string | undefined) ?? null;
    const amount = resource.amount as { total?: string; value?: string } | undefined;
    const amountStr = amount?.total ?? amount?.value;

    return {
      type,
      gatewayEventId: event.id,
      gatewaySubId: event.event_type.startsWith("BILLING.SUBSCRIPTION") ? gatewaySubId : null,
      gatewayPaymentId: event.event_type.startsWith("PAYMENT") ? (resource.id as string) : null,
      amountPaise: amountStr !== undefined ? Math.round(parseFloat(amountStr) * 100) : null,
      occurredAt: new Date(event.create_time),
      raw: event,
    };
  }

  async fetchPayment(gatewayPaymentId: string): Promise<NormalizedPayment> {
    const body = (await paypalFetch(`/v2/payments/captures/${gatewayPaymentId}`, { method: "GET" })) as {
      status: string;
      amount: { value: string };
    };
    const statusMap: Record<string, NormalizedPayment["status"]> = {
      COMPLETED: "succeeded",
      DECLINED: "failed",
      FAILED: "failed",
      REFUNDED: "refunded",
      PARTIALLY_REFUNDED: "partially_refunded",
      PENDING: "pending",
    };
    return {
      gatewayPaymentId,
      status: statusMap[body.status] ?? "pending",
      amountPaise: Math.round(parseFloat(body.amount.value) * 100),
    };
  }
}

export class UnhandledWebhookEventError extends Error {}
