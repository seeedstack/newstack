// Test-only helpers. The mailer (Task I) is what mints verification/reset tokens in
// production; until it exists, tests mint them directly the same way it will.
import argon2 from "argon2";

import { getPool } from "../src/db.js";
import { hashToken, randomToken } from "../src/features/auth/tokens.js";

export async function createUser(email: string, password: string): Promise<string> {
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19 * 1024,
    timeCost: 2,
    parallelism: 1,
  });
  const result = await getPool().query<{ id: string }>(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
    [email, passwordHash]
  );
  return result.rows[0].id;
}

export async function mintEmailVerificationToken(userId: string, expiresInMs = 24 * 60 * 60 * 1000): Promise<string> {
  const token = randomToken();
  await getPool().query(
    "INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashToken(token), new Date(Date.now() + expiresInMs)]
  );
  return token;
}

export async function mintPasswordResetToken(userId: string, expiresInMs = 30 * 60 * 1000): Promise<string> {
  const token = randomToken();
  await getPool().query(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashToken(token), new Date(Date.now() + expiresInMs)]
  );
  return token;
}

export async function cleanupTestUser(email: string): Promise<void> {
  await getPool().query(
    "DELETE FROM auth_events WHERE user_id IN (SELECT id FROM users WHERE lower(email) = lower($1))",
    [email]
  );
  await getPool().query("DELETE FROM users WHERE lower(email) = lower($1)", [email]);
}
