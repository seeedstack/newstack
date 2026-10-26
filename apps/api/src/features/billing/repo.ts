import type { PoolClient, Pool } from "pg";

export interface PlanRow {
  id: string;
  code: string;
  name: string;
  amount_paise: number;
  interval: "month" | "year";
  gateway_plan_id: string | null;
  active: boolean;
}

export async function findPlanByCode(client: PoolClient | Pool, code: string): Promise<PlanRow | null> {
  const result = await client.query<PlanRow>("SELECT * FROM plans WHERE code = $1 AND active", [code]);
  return result.rows[0] ?? null;
}

export async function findPlanById(client: PoolClient | Pool, id: string): Promise<PlanRow | null> {
  const result = await client.query<PlanRow>("SELECT * FROM plans WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function listActivePlans(client: PoolClient | Pool): Promise<PlanRow[]> {
  const result = await client.query<PlanRow>("SELECT * FROM plans WHERE active ORDER BY amount_paise");
  return result.rows;
}

export async function setPlanGatewayId(client: PoolClient | Pool, planId: string, gatewayPlanId: string): Promise<void> {
  await client.query("UPDATE plans SET gateway_plan_id = $2 WHERE id = $1", [planId, gatewayPlanId]);
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  status: "incomplete" | "trialing" | "active" | "past_due" | "canceled" | "expired";
  current_period_start: Date | null;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
  grace_until: Date | null;
  gateway: string;
  gateway_sub_id: string | null;
}

export async function insertIncompleteSubscription(
  client: PoolClient | Pool,
  args: { userId: string; planId: string; gatewaySubId: string }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO subscriptions (user_id, plan_id, status, gateway_sub_id)
     VALUES ($1, $2, 'incomplete', $3) RETURNING id`,
    [args.userId, args.planId, args.gatewaySubId]
  );
  return result.rows[0].id;
}

export async function findActiveSubscriptionForUser(client: PoolClient | Pool, userId: string): Promise<SubscriptionRow | null> {
  const result = await client.query<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE user_id = $1 AND status != 'expired'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

export async function findSubscriptionByGatewaySubId(client: PoolClient | Pool, gatewaySubId: string): Promise<SubscriptionRow | null> {
  const result = await client.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE gateway_sub_id = $1", [gatewaySubId]);
  return result.rows[0] ?? null;
}

export async function findSubscriptionForUpdate(client: PoolClient, id: string): Promise<SubscriptionRow | null> {
  const result = await client.query<SubscriptionRow>("SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [id]);
  return result.rows[0] ?? null;
}

export async function activateSubscription(
  client: PoolClient,
  id: string,
  periodStart: Date,
  periodEnd: Date
): Promise<void> {
  await client.query(
    `UPDATE subscriptions SET status = 'active', current_period_start = $2, current_period_end = $3,
       grace_until = NULL, updated_at = now() WHERE id = $1`,
    [id, periodStart, periodEnd]
  );
}

export async function extendSubscriptionPeriod(client: PoolClient, id: string, periodEnd: Date): Promise<void> {
  await client.query(
    `UPDATE subscriptions SET status = 'active', current_period_start = now(), current_period_end = $2,
       grace_until = NULL, updated_at = now() WHERE id = $1`,
    [id, periodEnd]
  );
}

// PAYPAL_SPEC §4.5 FR-F1: 3-day grace period.
export async function markSubscriptionPastDue(client: PoolClient, id: string): Promise<void> {
  await client.query(
    `UPDATE subscriptions SET status = 'past_due', grace_until = now() + interval '3 days', updated_at = now()
     WHERE id = $1`,
    [id]
  );
}

export async function expireSubscription(client: PoolClient, id: string): Promise<void> {
  await client.query("UPDATE subscriptions SET status = 'expired', updated_at = now() WHERE id = $1", [id]);
}

export async function setCancelAtPeriodEnd(client: PoolClient, id: string, cancel: boolean): Promise<void> {
  await client.query("UPDATE subscriptions SET cancel_at_period_end = $2, updated_at = now() WHERE id = $1", [id, cancel]);
}

export async function cancelSubscriptionNow(client: PoolClient, id: string): Promise<void> {
  await client.query("UPDATE subscriptions SET status = 'canceled', updated_at = now() WHERE id = $1", [id]);
}

export async function changeSubscriptionPlan(client: PoolClient, id: string, planId: string): Promise<void> {
  await client.query("UPDATE subscriptions SET plan_id = $2, updated_at = now() WHERE id = $1", [id, planId]);
}

// Expiry sweeper targets (PAYPAL_SPEC §11): past_due rows whose grace elapsed, and canceled
// rows past their period end.
export async function findExpiredPastDue(client: PoolClient | Pool): Promise<SubscriptionRow[]> {
  const result = await client.query<SubscriptionRow>(
    "SELECT * FROM subscriptions WHERE status = 'past_due' AND grace_until <= now()"
  );
  return result.rows;
}

export async function findLapsedCancellations(client: PoolClient | Pool): Promise<SubscriptionRow[]> {
  const result = await client.query<SubscriptionRow>(
    "SELECT * FROM subscriptions WHERE status = 'canceled' AND current_period_end <= now()"
  );
  return result.rows;
}

export async function findRenewalsDueInDays(client: PoolClient | Pool, days: number): Promise<SubscriptionRow[]> {
  const result = await client.query<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE status = 'active' AND NOT cancel_at_period_end
     AND current_period_end BETWEEN now() + ($1 || ' days')::interval - interval '1 hour'
                                 AND now() + ($1 || ' days')::interval`,
    [days]
  );
  return result.rows;
}

// ───────────────────────── Payments ─────────────────────────

export interface PaymentRow {
  id: string;
  subscription_id: string;
  user_id: string;
  amount_paise: number;
  status: "pending" | "succeeded" | "failed" | "refunded" | "partially_refunded";
  gateway_payment_id: string | null;
  invoice_number: string | null;
  paid_at: Date | null;
  created_at: Date;
}

export async function findPaymentByGatewayId(client: PoolClient | Pool, gatewayPaymentId: string): Promise<PaymentRow | null> {
  const result = await client.query<PaymentRow>("SELECT * FROM payments WHERE gateway_payment_id = $1", [gatewayPaymentId]);
  return result.rows[0] ?? null;
}

export async function insertPayment(
  client: PoolClient,
  args: {
    subscriptionId: string;
    userId: string;
    amountPaise: number;
    status: PaymentRow["status"];
    gatewayPaymentId: string | null;
    invoiceNumber: string | null;
    paidAt: Date | null;
    failureReason?: string | null;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payments (subscription_id, user_id, amount_paise, status, gateway_payment_id, invoice_number, paid_at, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [
      args.subscriptionId,
      args.userId,
      args.amountPaise,
      args.status,
      args.gatewayPaymentId,
      args.invoiceNumber,
      args.paidAt,
      args.failureReason ?? null,
    ]
  );
  return result.rows[0].id;
}

export async function markPaymentRefunded(client: PoolClient, id: string, partial: boolean): Promise<void> {
  await client.query("UPDATE payments SET status = $2 WHERE id = $1", [id, partial ? "partially_refunded" : "refunded"]);
}

export async function findPaymentById(client: PoolClient | Pool, id: string): Promise<PaymentRow | null> {
  const result = await client.query<PaymentRow>("SELECT * FROM payments WHERE id = $1", [id]);
  return result.rows[0] ?? null;
}

export async function listPaymentsForUser(client: PoolClient | Pool, userId: string): Promise<PaymentRow[]> {
  const result = await client.query<PaymentRow>(
    "SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC",
    [userId]
  );
  return result.rows;
}

export async function nextInvoiceNumber(client: PoolClient): Promise<string> {
  const year = new Date().getFullYear();
  const result = await client.query<{ next_seq: number }>(
    `INSERT INTO invoice_counters (year, next_seq) VALUES ($1, 2)
     ON CONFLICT (year) DO UPDATE SET next_seq = invoice_counters.next_seq + 1
     RETURNING next_seq - 1 AS next_seq`,
    [year]
  );
  const seq = result.rows[0].next_seq;
  return `NS-${year}-${String(seq).padStart(5, "0")}`;
}

// ───────────────────────── Refunds ─────────────────────────

export async function insertRefund(
  client: PoolClient,
  args: { paymentId: string; amountPaise: number; gatewayRefundId: string; reason: string | null; createdBy: string }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO refunds (payment_id, amount_paise, gateway_refund_id, reason, created_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [args.paymentId, args.amountPaise, args.gatewayRefundId, args.reason, args.createdBy]
  );
  return result.rows[0].id;
}

// ───────────────────────── Webhook dedupe ─────────────────────────

export async function insertWebhookEventIfNew(
  client: PoolClient,
  args: { gateway: string; gatewayEventId: string; type: string; payload: unknown }
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO webhook_events (gateway, gateway_event_id, type, payload) VALUES ($1, $2, $3, $4)
     ON CONFLICT (gateway, gateway_event_id) DO NOTHING RETURNING id`,
    [args.gateway, args.gatewayEventId, args.type, JSON.stringify(args.payload)]
  );
  return result.rows.length > 0;
}

export async function markWebhookProcessed(client: PoolClient, gateway: string, gatewayEventId: string, error: string | null): Promise<void> {
  await client.query(
    "UPDATE webhook_events SET processed_at = now(), error = $3 WHERE gateway = $1 AND gateway_event_id = $2",
    [gateway, gatewayEventId, error]
  );
}

// ───────────────────────── Audit log ─────────────────────────

export async function insertBillingAuditLog(
  client: PoolClient,
  args: { actorId: string; action: string; subscriptionId: string | null; metadata?: Record<string, unknown> }
): Promise<void> {
  await client.query(
    "INSERT INTO billing_audit_log (actor_id, action, subscription_id, metadata) VALUES ($1, $2, $3, $4)",
    [args.actorId, args.action, args.subscriptionId, JSON.stringify(args.metadata ?? {})]
  );
}

// ───────────────────────── Billing email outbox ─────────────────────────

export async function insertBillingEmailOutbox(
  client: PoolClient,
  userId: string,
  kind: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  await client.query("INSERT INTO billing_email_outbox (user_id, kind, context) VALUES ($1, $2, $3)", [
    userId,
    kind,
    JSON.stringify(context),
  ]);
}

// ───────────────────────── Admin ─────────────────────────

export async function getUserEmail(client: PoolClient | Pool, userId: string): Promise<string | null> {
  const result = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
  return result.rows[0]?.email ?? null;
}

export async function isUserAdmin(client: PoolClient | Pool, userId: string): Promise<boolean> {
  const result = await client.query<{ is_admin: boolean }>("SELECT is_admin FROM users WHERE id = $1", [userId]);
  return result.rows[0]?.is_admin ?? false;
}

export async function findSubscriptionsByUserEmail(client: PoolClient | Pool, email: string): Promise<SubscriptionRow[]> {
  const result = await client.query<SubscriptionRow>(
    `SELECT s.* FROM subscriptions s JOIN users u ON u.id = s.user_id
     WHERE lower(u.email) = lower($1) ORDER BY s.created_at DESC`,
    [email]
  );
  return result.rows;
}

// ───────────────────────── Reconciliation ─────────────────────────

export async function listPaymentsSince(client: PoolClient | Pool, since: Date): Promise<PaymentRow[]> {
  const result = await client.query<PaymentRow>("SELECT * FROM payments WHERE created_at >= $1", [since]);
  return result.rows;
}
