import type { Pool } from "pg";

import { withTransaction } from "../db.js";
import { hashToken, randomToken } from "../features/auth/tokens.js";
import {
  claimDueOutboxRow,
  getUserEmail,
  insertEmailVerificationToken,
  insertPasswordResetToken,
  markOutboxFailed,
  markOutboxSent,
  rescheduleOutbox,
} from "./repo.js";
import type { MailTransport } from "./transport.js";

// §9 retries: 1, 5, 30, 120, 360 min between attempts; a 6th failure gives up.
const BACKOFF_MINUTES = [1, 5, 30, 120, 360];
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

function buildMessage(kind: "verify_email" | "password_reset" | "account_exists", token: string, webOrigin: string) {
  switch (kind) {
    case "verify_email":
      return { subject: "Verify your email", body: `${webOrigin}/verify#t=${token}` };
    case "password_reset":
      return { subject: "Reset your password", body: `${webOrigin}/reset#t=${token}` };
    case "account_exists":
      return {
        subject: "Someone tried to sign up with your email",
        body: "Someone tried to sign up with your email address — log in or reset your password.",
      };
  }
}

// Claims and processes at most one due row. Returns false when there was nothing to do.
export async function processOnce(pool: Pool, transport: MailTransport, webOrigin: string): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const row = await claimDueOutboxRow(client);
    if (row === null) return false;

    const email = await getUserEmail(client, row.user_id);

    // Minted fresh on every attempt, even a retry of a previously-attempted send (§9: if a
    // send succeeded but the ack was lost, the retry mints a new token — the user may end up
    // with two valid links, both expiring normally; accepted).
    let token = "";
    if (row.kind === "verify_email") {
      token = randomToken();
      await insertEmailVerificationToken(client, row.user_id, hashToken(token), new Date(Date.now() + VERIFY_TOKEN_TTL_MS));
    } else if (row.kind === "password_reset") {
      token = randomToken();
      await insertPasswordResetToken(client, row.user_id, hashToken(token), new Date(Date.now() + RESET_TOKEN_TTL_MS));
    }

    const { subject, body } = buildMessage(row.kind, token, webOrigin);

    try {
      await transport.send({ to: email, subject, body, idempotencyKey: row.id });
      await markOutboxSent(client, row.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failureNumber = row.attempts + 1;
      // "after 5 failures → failed": the 5th failure gives up rather than scheduling a 6th
      // attempt, so only the first 4 backoff delays (1, 5, 30, 120 min) are ever actually used.
      if (failureNumber >= BACKOFF_MINUTES.length) {
        await markOutboxFailed(client, row.id, message);
        // ponytail: real alerting (Sentry/metrics, §11) isn't wired yet — this is the
        // placeholder until that pipeline exists.
        console.error(`[mailer] outbox ${row.id} failed permanently after ${failureNumber} attempts: ${message}`);
      } else {
        const delayMs = BACKOFF_MINUTES[failureNumber - 1] * 60 * 1000;
        await rescheduleOutbox(client, row.id, new Date(Date.now() + delayMs), message);
      }
    }
    return true;
  });
}
