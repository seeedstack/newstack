// PAYPAL_SPEC §11 scheduler jobs: hourly expiry sweep, daily renewal reminders, plus the
// billing email outbox processor (mirrors mailer/service.ts's processOnce pattern). Plain
// setInterval — no cron dependency installed in this app, and three timers don't need one.
import type { Pool } from "pg";

import { withTransaction } from "../../db.js";
import { ConsoleMailTransport, type MailTransport } from "../../mailer/transport.js";
import * as repo from "./repo.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const BACKOFF_MINUTES = [1, 5, 30, 120, 360]; // same shape as mailer/service.ts

// §11 "hourly expiry sweeper": past_due rows whose grace elapsed → expired; canceled rows
// past their period end → final state. Both idempotent — safe to run twice.
export async function sweepExpired(pool: Pool): Promise<void> {
  await withTransaction(pool, async (client) => {
    for (const sub of await repo.findExpiredPastDue(client)) {
      await repo.expireSubscription(client, sub.id);
      await repo.insertBillingEmailOutbox(client, sub.user_id, "expired", { subscriptionId: sub.id });
    }
    for (const sub of await repo.findLapsedCancellations(client)) {
      await repo.expireSubscription(client, sub.id);
    }
  });
}

// §11 "daily reminder scheduler": upcoming renewal at T-3 days (FR-R3).
export async function sendRenewalReminders(pool: Pool): Promise<void> {
  await withTransaction(pool, async (client) => {
    for (const sub of await repo.findRenewalsDueInDays(client, 3)) {
      await repo.insertBillingEmailOutbox(client, sub.user_id, "renewal_reminder", {
        subscriptionId: sub.id,
        renewsAt: sub.current_period_end,
      });
    }
  });
}

function buildMessage(kind: string, context: Record<string, unknown>): { subject: string; body: string } {
  switch (kind) {
    case "receipt":
      return { subject: "Payment received", body: `Thanks for your payment. Subscription: ${context.subscriptionId}` };
    case "renewal_reminder":
      return { subject: "Your subscription renews in 3 days", body: `Renews at ${context.renewsAt}.` };
    case "payment_failed":
      return { subject: "We couldn't process your payment", body: "Please update your payment method within 3 days to avoid losing access." };
    case "canceled":
      return { subject: "Your subscription is canceled", body: "You'll keep access until the end of your current period." };
    case "expired":
      return { subject: "Your subscription has expired", body: "You've been moved to the free tier." };
    case "refund_processed":
      return { subject: "Your refund has been processed", body: `Payment ${context.paymentId} refunded.` };
    default:
      return { subject: "Newstack billing update", body: "" };
  }
}

// Mirrors mailer/service.ts's processOnce exactly — claim one due row, send, backoff on
// failure. Kept separate from the auth outbox because the message content here needs the
// row's JSONB context, not just a minted token.
export async function processOnceBillingOutbox(pool: Pool, transport: MailTransport): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const result = await client.query<{
      id: string;
      user_id: string;
      kind: string;
      context: Record<string, unknown>;
      attempts: number;
    }>(
      `SELECT id, user_id, kind, context, attempts FROM billing_email_outbox
       WHERE status = 'pending' AND next_attempt_at <= now()
       ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED`
    );
    const row = result.rows[0];
    if (row === undefined) return false;

    const email = await repo.getUserEmail(client, row.user_id);
    if (email === null) {
      await client.query("UPDATE billing_email_outbox SET status = 'failed', last_error = 'no_user' WHERE id = $1", [row.id]);
      return true;
    }

    const { subject, body } = buildMessage(row.kind, row.context);
    try {
      await transport.send({ to: email, subject, body, idempotencyKey: row.id });
      await client.query("UPDATE billing_email_outbox SET status = 'sent', sent_at = now() WHERE id = $1", [row.id]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failureNumber = row.attempts + 1;
      if (failureNumber >= BACKOFF_MINUTES.length) {
        await client.query(
          "UPDATE billing_email_outbox SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1",
          [row.id, message]
        );
      } else {
        const delayMs = BACKOFF_MINUTES[failureNumber - 1] * 60 * 1000;
        await client.query(
          "UPDATE billing_email_outbox SET attempts = attempts + 1, next_attempt_at = $2, last_error = $3 WHERE id = $1",
          [row.id, new Date(Date.now() + delayMs), message]
        );
      }
    }
    return true;
  });
}

export function startBillingScheduler(pool: Pool, transport: MailTransport = new ConsoleMailTransport()): () => void {
  const timers = [
    setInterval(() => void sweepExpired(pool).catch((err) => console.error("[billing] sweepExpired failed", err)), HOUR_MS),
    setInterval(() => void sendRenewalReminders(pool).catch((err) => console.error("[billing] sendRenewalReminders failed", err)), DAY_MS),
    setInterval(() => void processOnceBillingOutbox(pool, transport).catch((err) => console.error("[billing] outbox failed", err)), 30_000),
  ];
  return () => timers.forEach(clearInterval);
}
