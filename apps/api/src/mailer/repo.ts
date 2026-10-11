import type { PoolClient } from "pg";

export interface OutboxRow {
  id: string;
  user_id: string;
  kind: "verify_email" | "password_reset" | "account_exists";
  attempts: number;
}

export async function claimDueOutboxRow(client: PoolClient): Promise<OutboxRow | null> {
  const result = await client.query<OutboxRow>(
    `SELECT id, user_id, kind, attempts FROM email_outbox
     WHERE status = 'pending' AND next_attempt_at <= now()
     ORDER BY next_attempt_at
     LIMIT 1
     FOR UPDATE SKIP LOCKED`
  );
  return result.rows[0] ?? null;
}

// email_outbox.user_id is ON DELETE CASCADE, so a claimed row's user is guaranteed to exist —
// this throws only if that invariant is ever violated, which would indicate real corruption.
export async function getUserEmail(client: PoolClient, userId: string): Promise<string> {
  const result = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
  const email = result.rows[0]?.email;
  if (email === undefined) throw new Error(`mailer: no user row for id ${userId} (outbox FK invariant violated)`);
  return email;
}

export async function insertEmailVerificationToken(
  client: PoolClient,
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  await client.query(
    "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );
}

export async function insertPasswordResetToken(
  client: PoolClient,
  userId: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  await client.query(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt]
  );
}

export async function markOutboxSent(client: PoolClient, id: string): Promise<void> {
  await client.query("UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = $1", [id]);
}

export async function markOutboxFailed(client: PoolClient, id: string, lastError: string): Promise<void> {
  await client.query("UPDATE email_outbox SET status = 'failed', attempts = attempts + 1, last_error = $2 WHERE id = $1", [
    id,
    lastError,
  ]);
}

export async function rescheduleOutbox(
  client: PoolClient,
  id: string,
  nextAttemptAt: Date,
  lastError: string
): Promise<void> {
  await client.query(
    "UPDATE email_outbox SET attempts = attempts + 1, next_attempt_at = $2, last_error = $3 WHERE id = $1",
    [id, nextAttemptAt, lastError]
  );
}
