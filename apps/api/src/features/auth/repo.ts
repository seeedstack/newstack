import type { PoolClient } from "pg";

export async function insertUserReturningId(
  client: PoolClient,
  email: string,
  passwordHash: string
): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (lower(email)) DO NOTHING
     RETURNING id`,
    [email, passwordHash]
  );
  return result.rows[0]?.id ?? null;
}

export async function findUserIdByEmail(client: PoolClient, email: string): Promise<string | null> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM users WHERE lower(email) = lower($1)",
    [email]
  );
  return result.rows[0]?.id ?? null;
}

export async function insertEmailOutbox(
  client: PoolClient,
  userId: string,
  kind: "verify_email" | "account_exists" | "password_reset"
): Promise<void> {
  await client.query("INSERT INTO email_outbox (user_id, kind) VALUES ($1, $2)", [userId, kind]);
}
