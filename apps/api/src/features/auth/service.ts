import argon2 from "argon2";
import type { Pool } from "pg";

import { isCommonPassword } from "./common-passwords.js";
import { findUserIdByEmail, insertEmailOutbox, insertUserReturningId } from "./repo.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// argon2id, m = 19 MiB, t = 2, p = 1 (§9).
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

export function validateSignupInput(email: unknown, password: unknown): { email: string; password: string } {
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    throw new ValidationError("invalid_email");
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    throw new ValidationError("invalid_password");
  }
  if (isCommonPassword(password)) {
    throw new ValidationError("common_password");
  }
  return { email, password };
}

// Always succeeds from the caller's point of view (§9: signup never reveals whether an
// email exists) — the 202 response is the same regardless of which branch runs below.
export async function signup(pool: Pool, email: string, password: string): Promise<void> {
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const newUserId = await insertUserReturningId(client, email, passwordHash);
    if (newUserId !== null) {
      await insertEmailOutbox(client, newUserId, "verify_email");
    } else {
      const existingUserId = await findUserIdByEmail(client, email);
      // existingUserId is always found here: the ON CONFLICT above only fires when a row
      // with this lower(email) already exists.
      await insertEmailOutbox(client, existingUserId as string, "account_exists");
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
