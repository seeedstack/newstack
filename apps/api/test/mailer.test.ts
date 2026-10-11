import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPool } from "../src/db.js";
import { hashToken } from "../src/features/auth/tokens.js";
import { processOnce } from "../src/mailer/service.js";
import type { MailMessage, MailTransport } from "../src/mailer/transport.js";
import { cleanupTestUser, createUser } from "./helpers.js";

const WEB_ORIGIN = "http://localhost:5173";
const EMAIL = "mailer-test@mail.example";

class RecordingTransport implements MailTransport {
  sent: MailMessage[] = [];
  failNext = 0;

  async send(message: MailMessage): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("simulated send failure");
    }
    this.sent.push(message);
  }
}

beforeEach(() => cleanupTestUser(EMAIL));
afterEach(() => cleanupTestUser(EMAIL));

describe("mailer processOnce", () => {
  it("returns false when there is nothing due", async () => {
    const transport = new RecordingTransport();
    expect(await processOnce(getPool(), transport, WEB_ORIGIN)).toBe(false);
    expect(transport.sent).toEqual([]);
  });

  it("mints a verification token, sends the link, and marks the row sent", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    await getPool().query("INSERT INTO email_outbox (user_id, kind) VALUES ($1, 'verify_email')", [userId]);

    const transport = new RecordingTransport();
    expect(await processOnce(getPool(), transport, WEB_ORIGIN)).toBe(true);

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe(EMAIL);
    const token = transport.sent[0].body.split("#t=")[1];
    expect(token).toBeTruthy();

    const tokenRow = await getPool().query(
      "SELECT user_id FROM email_verification_tokens WHERE token_hash = $1",
      [hashToken(token)]
    );
    expect(tokenRow.rows[0]?.user_id).toBe(userId);

    const outbox = await getPool().query("SELECT status FROM email_outbox WHERE user_id = $1", [userId]);
    expect(outbox.rows[0].status).toBe("sent");
  });

  it("mints a password_reset token for that kind", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    await getPool().query("INSERT INTO email_outbox (user_id, kind) VALUES ($1, 'password_reset')", [userId]);

    const transport = new RecordingTransport();
    await processOnce(getPool(), transport, WEB_ORIGIN);

    const token = transport.sent[0].body.split("#t=")[1];
    const tokenRow = await getPool().query(
      "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1",
      [hashToken(token)]
    );
    expect(tokenRow.rows[0]?.user_id).toBe(userId);
  });

  it("sends account_exists with no token minted", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    await getPool().query("INSERT INTO email_outbox (user_id, kind) VALUES ($1, 'account_exists')", [userId]);

    const transport = new RecordingTransport();
    await processOnce(getPool(), transport, WEB_ORIGIN);

    expect(transport.sent[0].body).not.toContain("#t=");
  });

  it("reschedules with backoff on failure, without losing the row", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    await getPool().query("INSERT INTO email_outbox (user_id, kind) VALUES ($1, 'verify_email')", [userId]);

    const transport = new RecordingTransport();
    transport.failNext = 1;
    await processOnce(getPool(), transport, WEB_ORIGIN);

    const outbox = await getPool().query(
      "SELECT status, attempts, next_attempt_at, last_error FROM email_outbox WHERE user_id = $1",
      [userId]
    );
    expect(outbox.rows[0].status).toBe("pending");
    expect(outbox.rows[0].attempts).toBe(1);
    expect(outbox.rows[0].last_error).toBe("simulated send failure");
    // First backoff is 1 minute — next_attempt_at should be in the future, not immediately due.
    expect(new Date(outbox.rows[0].next_attempt_at).getTime()).toBeGreaterThan(Date.now());

    // Not due yet, so a tick right now finds nothing to do.
    expect(await processOnce(getPool(), transport, WEB_ORIGIN)).toBe(false);
  });

  it("marks the row failed after exhausting all retries", async () => {
    const userId = await createUser(EMAIL, "a-strong-passphrase");
    await getPool().query("INSERT INTO email_outbox (user_id, kind) VALUES ($1, 'verify_email')", [userId]);

    const transport = new RecordingTransport();
    for (let i = 0; i < 5; i++) {
      transport.failNext = 1;
      // Force each retry to be immediately due instead of waiting out the real backoff.
      await getPool().query(
        "UPDATE email_outbox SET next_attempt_at = now() WHERE user_id = $1 AND status = 'pending'",
        [userId]
      );
      await processOnce(getPool(), transport, WEB_ORIGIN);
    }

    const outbox = await getPool().query("SELECT status, attempts FROM email_outbox WHERE user_id = $1", [userId]);
    expect(outbox.rows[0].status).toBe("failed");
    expect(outbox.rows[0].attempts).toBe(5);
  });
});
