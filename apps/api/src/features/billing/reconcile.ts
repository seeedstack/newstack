// PAYPAL_SPEC §4.4 / §11 nightly reconciliation: compare our `payments` rows against PayPal's
// own record for each, flag mismatches. Run as `tsx src/features/billing/reconcile.ts` from a
// cron entry (ponytail: no scheduler/alerting pipeline wired here — console output only, same
// placeholder status as mailer/service.ts's `[mailer] outbox … failed permanently` line).
import { getPool } from "../../db.js";
import type { PaymentGateway } from "./gateway.js";
import { PayPalGateway } from "./paypal.js";
import * as repo from "./repo.js";

export interface Mismatch {
  paymentId: string;
  reason: "missing_at_gateway" | "amount_mismatch" | "status_mismatch";
  localAmountPaise?: number;
  gatewayAmountPaise?: number;
  localStatus?: string;
  gatewayStatus?: string;
}

export async function reconcile(pool = getPool(), gateway: PaymentGateway = new PayPalGateway(), since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): Promise<Mismatch[]> {
  const mismatches: Mismatch[] = [];
  for (const payment of await repo.listPaymentsSince(pool, since)) {
    if (payment.gateway_payment_id === null) continue;
    try {
      const remote = await gateway.fetchPayment(payment.gateway_payment_id);
      if (remote.amountPaise !== payment.amount_paise) {
        mismatches.push({
          paymentId: payment.id,
          reason: "amount_mismatch",
          localAmountPaise: payment.amount_paise,
          gatewayAmountPaise: remote.amountPaise,
        });
      } else if (statusesDiverge(payment.status, remote.status)) {
        mismatches.push({ paymentId: payment.id, reason: "status_mismatch", localStatus: payment.status, gatewayStatus: remote.status });
      }
    } catch {
      mismatches.push({ paymentId: payment.id, reason: "missing_at_gateway" });
    }
  }
  return mismatches;
}

function statusesDiverge(local: string, remote: string): boolean {
  const equivalent: Record<string, string> = { succeeded: "succeeded", failed: "failed", refunded: "refunded", partially_refunded: "partially_refunded", pending: "pending" };
  return equivalent[local] !== remote;
}

// CLI entry point for the cron job.
if (process.argv[1]?.endsWith("reconcile.ts") || process.argv[1]?.endsWith("reconcile.js")) {
  reconcile()
    .then((mismatches) => {
      if (mismatches.length === 0) {
        console.log("[billing] reconciliation: clean");
      } else {
        console.error(`[billing] reconciliation: ${mismatches.length} mismatch(es)`, mismatches);
        process.exitCode = 1;
      }
    })
    .catch((err) => {
      console.error("[billing] reconciliation failed", err);
      process.exitCode = 1;
    });
}
