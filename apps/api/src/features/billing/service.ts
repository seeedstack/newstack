import type { Pool, PoolClient } from "pg";

import { withTransaction } from "../../db.js";
import { isEntitled, type SubscriptionState } from "./entitlement.js";
import type { NormalizedEvent, PaymentGateway } from "./gateway.js";
import * as repo from "./repo.js";

export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class NotFoundError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class ForbiddenError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// ───────────────────────── FR §4.3 Subscribe flow ─────────────────────────

export async function checkout(
  pool: Pool,
  gateway: PaymentGateway,
  userId: string,
  planCode: string
): Promise<Record<string, unknown>> {
  const plan = await repo.findPlanByCode(pool, planCode);
  if (plan === null) throw new ValidationError("unknown_plan");

  const existing = await repo.findActiveSubscriptionForUser(pool, userId);
  if (existing !== null && isEntitled(existing)) throw new ValidationError("already_subscribed");

  // §3 "Plan definitions live in the database and are mirrored to gateway plan IDs" — this
  // MVP creates the PayPal billing plan lazily on first checkout rather than via a separate
  // provisioning script (§Phase 2.3 "script it so it's repeatable"); fine at two plans, revisit
  // if plan count or per-environment gateway plan drift becomes a real operational cost.
  if (plan.gateway_plan_id === null) {
    throw new ValidationError("plan_not_provisioned");
  }

  const { gatewaySubscriptionId, checkoutParams } = await gateway.createSubscription({
    userId,
    planCode,
    gatewayPlanId: plan.gateway_plan_id,
  });

  await repo.insertIncompleteSubscription(pool, { userId, planId: plan.id, gatewaySubId: gatewaySubscriptionId });
  return checkoutParams;
}

export interface SubscriptionView {
  status: string;
  entitled: boolean;
  planCode: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export async function getSubscriptionView(pool: Pool, userId: string): Promise<SubscriptionView> {
  const sub = await repo.findActiveSubscriptionForUser(pool, userId);
  if (sub === null) {
    return { status: "none", entitled: false, planCode: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  }
  const plan = await repo.findPlanById(pool, sub.plan_id);
  return {
    status: sub.status,
    entitled: isEntitled(sub as unknown as SubscriptionState),
    planCode: plan?.code ?? null,
    currentPeriodEnd: sub.current_period_end?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}

// ───────────────────────── §7 Webhook handling algorithm ─────────────────────────

export async function processWebhook(pool: Pool, gateway: PaymentGateway, event: NormalizedEvent): Promise<void> {
  const isNew = await withTransaction(pool, (client) =>
    repo.insertWebhookEventIfNew(client, {
      gateway: "paypal",
      gatewayEventId: event.gatewayEventId,
      type: event.type,
      payload: event.raw,
    })
  );
  if (!isNew) return; // duplicate delivery — §7 step 2: no-op, not a failure

  let error: string | null = null;
  try {
    await withTransaction(pool, (client) => applyEvent(client, event));
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await withTransaction(pool, (client) => repo.markWebhookProcessed(client, "paypal", event.gatewayEventId, error));
  }
}

async function applyEvent(client: PoolClient, event: NormalizedEvent): Promise<void> {
  if (event.gatewaySubId === null) return; // payment-only events (refunds) handled separately below
  const sub = await repo.findSubscriptionByGatewaySubId(client, event.gatewaySubId);
  if (sub === null) return; // unknown subscription — nothing to apply idempotently

  const locked = await repo.findSubscriptionForUpdate(client, sub.id);
  if (locked === null) return;

  const plan = await repo.findPlanById(client, locked.plan_id);
  if (plan === null) return;

  switch (event.type) {
    case "subscription.activated": {
      if (locked.status === "active") return; // already applied — idempotent
      const start = new Date();
      const end = addBillingInterval(start, plan.interval);
      await repo.activateSubscription(client, locked.id, start, end);
      if (event.amountPaise !== null) {
        const invoiceNumber = await repo.nextInvoiceNumber(client);
        await repo.insertPayment(client, {
          subscriptionId: locked.id,
          userId: locked.user_id,
          amountPaise: event.amountPaise,
          status: "succeeded",
          gatewayPaymentId: event.gatewayPaymentId,
          invoiceNumber,
          paidAt: new Date(),
        });
      }
      await repo.insertBillingEmailOutbox(client, locked.user_id, "receipt", { subscriptionId: locked.id });
      break;
    }
    case "subscription.charged": {
      // Renewal charge: extend the period and record the payment. Idempotent via the
      // webhook_events dedupe above — a replay never double-extends.
      const newEnd = addBillingInterval(locked.current_period_end ?? new Date(), plan.interval);
      await repo.extendSubscriptionPeriod(client, locked.id, newEnd);
      if (event.amountPaise !== null) {
        const invoiceNumber = await repo.nextInvoiceNumber(client);
        await repo.insertPayment(client, {
          subscriptionId: locked.id,
          userId: locked.user_id,
          amountPaise: event.amountPaise,
          status: "succeeded",
          gatewayPaymentId: event.gatewayPaymentId,
          invoiceNumber,
          paidAt: new Date(),
        });
      }
      await repo.insertBillingEmailOutbox(client, locked.user_id, "receipt", { subscriptionId: locked.id });
      break;
    }
    case "payment.failed": {
      if (locked.status === "past_due") return; // already in grace — idempotent
      await repo.markSubscriptionPastDue(client, locked.id);
      await repo.insertPayment(client, {
        subscriptionId: locked.id,
        userId: locked.user_id,
        amountPaise: event.amountPaise ?? 0,
        status: "failed",
        gatewayPaymentId: event.gatewayPaymentId,
        invoiceNumber: null,
        paidAt: null,
        failureReason: "gateway_declined",
      });
      await repo.insertBillingEmailOutbox(client, locked.user_id, "payment_failed", { subscriptionId: locked.id });
      break;
    }
    case "subscription.halted": {
      if (locked.status === "expired") return;
      await repo.expireSubscription(client, locked.id);
      await repo.insertBillingEmailOutbox(client, locked.user_id, "expired", { subscriptionId: locked.id });
      break;
    }
    case "subscription.cancelled": {
      if (locked.status === "canceled" || locked.status === "expired") return;
      await repo.cancelSubscriptionNow(client, locked.id);
      await repo.insertBillingEmailOutbox(client, locked.user_id, "canceled", { subscriptionId: locked.id });
      break;
    }
    case "refund.processed": {
      if (event.gatewayPaymentId === null) return;
      const payment = await repo.findPaymentByGatewayId(client, event.gatewayPaymentId);
      if (payment === null) return;
      const partial = event.amountPaise !== null && event.amountPaise < payment.amount_paise;
      await repo.markPaymentRefunded(client, payment.id, partial);
      await repo.insertBillingEmailOutbox(client, payment.user_id, "refund_processed", { paymentId: payment.id });
      break;
    }
  }
}

function addBillingInterval(from: Date, interval: "month" | "year"): Date {
  const next = new Date(from);
  if (interval === "year") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

// ───────────────────────── §4.6 Cancellation ─────────────────────────

export async function cancel(pool: Pool, gateway: PaymentGateway, userId: string): Promise<void> {
  const sub = await repo.findActiveSubscriptionForUser(pool, userId);
  if (sub === null || sub.gateway_sub_id === null) throw new NotFoundError("no_subscription");
  await gateway.cancelSubscription(sub.gateway_sub_id, true);
  await withTransaction(pool, (client) => repo.setCancelAtPeriodEnd(client, sub.id, true));
}

export async function resume(pool: Pool, userId: string): Promise<void> {
  const sub = await repo.findActiveSubscriptionForUser(pool, userId);
  if (sub === null || !sub.cancel_at_period_end) throw new NotFoundError("nothing_to_resume");
  await withTransaction(pool, (client) => repo.setCancelAtPeriodEnd(client, sub.id, false));
}

export async function changePlan(pool: Pool, userId: string, newPlanCode: string): Promise<void> {
  const sub = await repo.findActiveSubscriptionForUser(pool, userId);
  if (sub === null) throw new NotFoundError("no_subscription");
  const plan = await repo.findPlanByCode(pool, newPlanCode);
  if (plan === null) throw new ValidationError("unknown_plan");
  await withTransaction(pool, (client) => repo.changeSubscriptionPlan(client, sub.id, plan.id));
}

export async function listPayments(pool: Pool, userId: string) {
  return repo.listPaymentsForUser(pool, userId);
}

// ───────────────────────── §4.7 Refunds (admin-only) ─────────────────────────

export async function issueRefund(
  pool: Pool,
  gateway: PaymentGateway,
  actorId: string,
  paymentId: string,
  reason: string | null
): Promise<void> {
  const payment = await repo.findPaymentById(pool, paymentId);
  if (payment === null || payment.gateway_payment_id === null) throw new NotFoundError("payment_not_found");
  const { refundId } = await gateway.refundPayment(payment.gateway_payment_id, payment.amount_paise);
  await withTransaction(pool, async (client) => {
    await repo.insertRefund(client, { paymentId, amountPaise: payment.amount_paise, gatewayRefundId: refundId, reason, createdBy: actorId });
    await repo.markPaymentRefunded(client, paymentId, false);
    await repo.insertBillingAuditLog(client, { actorId, action: "refund_issued", subscriptionId: payment.subscription_id, metadata: { paymentId, refundId } });
  });
}

// ───────────────────────── §4.12 Admin: manual extend/revoke ─────────────────────────

export async function adminExtend(pool: Pool, actorId: string, subscriptionId: string, days: number): Promise<void> {
  await withTransaction(pool, async (client) => {
    const sub = await repo.findSubscriptionForUpdate(client, subscriptionId);
    if (sub === null) throw new NotFoundError("subscription_not_found");
    const base = sub.current_period_end ?? new Date();
    const extended = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await repo.extendSubscriptionPeriod(client, subscriptionId, extended);
    await repo.insertBillingAuditLog(client, { actorId, action: "manual_extend", subscriptionId, metadata: { days } });
  });
}

export async function adminRevoke(pool: Pool, actorId: string, subscriptionId: string): Promise<void> {
  await withTransaction(pool, async (client) => {
    await repo.expireSubscription(client, subscriptionId);
    await repo.insertBillingAuditLog(client, { actorId, action: "manual_revoke", subscriptionId, metadata: {} });
  });
}

export async function findSubscriptionsByEmail(pool: Pool, email: string) {
  return repo.findSubscriptionsByUserEmail(pool, email);
}
