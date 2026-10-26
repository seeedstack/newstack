import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { PayPalGateway, UnhandledWebhookEventError } from "./paypal.js";
import * as repo from "./repo.js";
import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
  cancel,
  changePlan,
  checkout,
  getSubscriptionView,
  issueRefund,
  listPayments,
  processWebhook,
  resume,
} from "./service.js";
import { renderInvoiceHtml } from "./invoice.js";
import { adminExtend, adminRevoke, findSubscriptionsByEmail } from "./service.js";

const gateway = new PayPalGateway();

// /api/public/plans — unauthenticated plan listing (PAYPAL_SPEC §7 `GET /api/plans`).
export async function billingPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/plans", async () => ({ items: await repo.listActivePlans(getPool()) }));
}

// /api/billing/* — authenticated, mounted inside the existing authPlugin scope.
export async function billingRoutes(app: FastifyInstance): Promise<void> {
  app.post("/billing/checkout", async (request, reply) => {
    const { planCode } = request.body as { planCode?: unknown };
    if (typeof planCode !== "string") return reply.code(400).send({ error: "invalid_plan_code" });
    try {
      const checkoutParams = await checkout(getPool(), gateway, request.userId as string, planCode);
      return reply.send({ checkoutParams });
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(409).send({ error: err.code });
      throw err;
    }
  });

  app.get("/billing/subscription", async (request) => getSubscriptionView(getPool(), request.userId as string));

  app.post("/billing/cancel", async (request, reply) => {
    try {
      await cancel(getPool(), gateway, request.userId as string);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.code });
      throw err;
    }
  });

  app.post("/billing/resume", async (request, reply) => {
    try {
      await resume(getPool(), request.userId as string);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.code });
      throw err;
    }
  });

  app.post("/billing/change-plan", async (request, reply) => {
    const { planCode } = request.body as { planCode?: unknown };
    if (typeof planCode !== "string") return reply.code(400).send({ error: "invalid_plan_code" });
    try {
      await changePlan(getPool(), request.userId as string, planCode);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.code });
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.code });
      throw err;
    }
  });

  app.get("/billing/payments", async (request) => ({ items: await listPayments(getPool(), request.userId as string) }));

  // Authorization check (PAYPAL_SPEC §4.2 "Authorization check to prevent IDOR"): a payment
  // row is only ever returned for the requesting user, never looked up by id alone.
  app.get("/billing/invoices/:paymentId", async (request, reply) => {
    const { paymentId } = request.params as { paymentId: string };
    const payments = await listPayments(getPool(), request.userId as string);
    const payment = payments.find((p) => p.id === paymentId);
    if (payment === undefined || payment.invoice_number === null) return reply.code(404).send({ error: "not_found" });
    const plan = await getSubscriptionView(getPool(), request.userId as string);
    const email = (await repo.getUserEmail(getPool(), request.userId as string)) ?? "";
    const html = renderInvoiceHtml({
      invoiceNumber: payment.invoice_number,
      planName: plan.planCode ?? "Subscription",
      amountPaise: payment.amount_paise,
      paidAt: payment.paid_at ?? payment.created_at,
      userEmail: email,
    });
    reply.header("Content-Type", "text/html");
    return reply.send(html);
  });
}

// /webhooks/paypal — no session, no CSRF (PAYPAL_SPEC §7); signature verified instead.
export async function billingWebhookRoutes(app: FastifyInstance): Promise<void> {
  // Raw buffer needed for signature verification — scoped to this plugin only so the rest of
  // the app keeps Fastify's normal JSON body parsing.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

  app.post("/paypal", async (request, reply) => {
    const rawBody = request.body as Buffer;
    const verified = await gateway.verifyWebhook(rawBody, request.headers);
    if (!verified) return reply.code(400).send({ error: "invalid_signature" });

    let event;
    try {
      event = gateway.parseWebhook(rawBody);
    } catch (err) {
      if (err instanceof UnhandledWebhookEventError) return reply.code(200).send({ status: "ignored" });
      throw err;
    }

    // §7 step 3: ack fast, process synchronously here (no queue yet — ponytail: add one if
    // webhook volume or handler latency ever makes a slow ack a real problem).
    await processWebhook(getPool(), gateway, event);
    return reply.code(200).send({ status: "ok" });
  });
}

// /api/admin/billing/* — mounted behind the admin plugin (plugins/admin.ts).
export async function billingAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/billing/subscriptions", async (request, reply) => {
    const { email } = request.query as { email?: string };
    if (typeof email !== "string" || email.length === 0) return reply.code(400).send({ error: "email_required" });
    return { items: await findSubscriptionsByEmail(getPool(), email) };
  });

  app.post("/billing/subscriptions/:id/extend", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { days } = request.body as { days?: unknown };
    if (typeof days !== "number" || days <= 0) return reply.code(400).send({ error: "invalid_days" });
    try {
      await adminExtend(getPool(), request.userId as string, id, days);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.code });
      throw err;
    }
  });

  app.post("/billing/subscriptions/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    await adminRevoke(getPool(), request.userId as string, id);
    return reply.code(204).send();
  });

  app.post("/billing/refunds", async (request, reply) => {
    const { paymentId, reason } = request.body as { paymentId?: unknown; reason?: unknown };
    if (typeof paymentId !== "string") return reply.code(400).send({ error: "invalid_payment_id" });
    try {
      await issueRefund(getPool(), gateway, request.userId as string, paymentId, typeof reason === "string" ? reason : null);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: err.code });
      if (err instanceof ForbiddenError) return reply.code(403).send({ error: err.code });
      throw err;
    }
  });
}
