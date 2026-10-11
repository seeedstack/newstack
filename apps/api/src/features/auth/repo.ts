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

export async function insertAuthEvent(
  client: PoolClient,
  userId: string | null,
  event: string,
  opts: { familyId?: string; reason?: string } = {}
): Promise<void> {
  await client.query(
    "INSERT INTO auth_events (user_id, family_id, event, reason) VALUES ($1, $2, $3, $4)",
    [userId, opts.familyId ?? null, event, opts.reason ?? null]
  );
}

// ───────────────────────── Email verification (Task C) ─────────────────────────

export async function consumeEmailVerificationToken(
  client: PoolClient,
  tokenHash: string
): Promise<string | null> {
  const result = await client.query<{ user_id: string }>(
    `UPDATE email_verification_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [tokenHash]
  );
  return result.rows[0]?.user_id ?? null;
}

export async function markEmailVerified(client: PoolClient, userId: string): Promise<void> {
  await client.query("UPDATE users SET email_verified_at = now() WHERE id = $1", [userId]);
}

// ───────────────────────── Login (Task D) ─────────────────────────

export interface LoginUserRow {
  id: string;
  password_hash: string;
  auth_version: number;
}

export async function findUserForLogin(client: PoolClient, email: string): Promise<LoginUserRow | null> {
  const result = await client.query<LoginUserRow>(
    "SELECT id, password_hash, auth_version FROM users WHERE lower(email) = lower($1)",
    [email]
  );
  return result.rows[0] ?? null;
}

export async function insertRefreshSession(
  client: PoolClient,
  args: { userId: string; familyId: string; parentId: string | null; tokenHash: string; expiresAt: Date }
): Promise<void> {
  await client.query(
    `INSERT INTO refresh_sessions (user_id, family_id, parent_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [args.userId, args.familyId, args.parentId, args.tokenHash, args.expiresAt]
  );
}

export async function getAuthVersion(client: PoolClient, userId: string): Promise<number | null> {
  const result = await client.query<{ auth_version: number }>(
    "SELECT auth_version FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0]?.auth_version ?? null;
}

// ───────────────────────── Refresh rotation (Task F) ─────────────────────────

export interface RefreshSessionRow {
  id: string;
  user_id: string;
  family_id: string;
  rotated_at: Date | null;
  children: number;
}

export async function selectRefreshSessionForUpdate(
  client: PoolClient,
  tokenHash: string
): Promise<RefreshSessionRow | null> {
  const result = await client.query<RefreshSessionRow>(
    `SELECT r.id, r.user_id, r.family_id, r.rotated_at,
            (SELECT count(*) FROM refresh_sessions c WHERE c.parent_id = r.id)::int AS children
     FROM refresh_sessions r
     WHERE r.token_hash = $1 AND r.revoked_at IS NULL AND r.expires_at > now()
     FOR UPDATE`,
    [tokenHash]
  );
  return result.rows[0] ?? null;
}

export async function markRefreshRotated(client: PoolClient, id: string): Promise<void> {
  await client.query("UPDATE refresh_sessions SET rotated_at = now() WHERE id = $1", [id]);
}

export async function revokeRefreshFamily(client: PoolClient, familyId: string): Promise<void> {
  await client.query(
    "UPDATE refresh_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL",
    [familyId]
  );
}

// ───────────────────────── Password reset (Task G) ─────────────────────────

export async function consumePasswordResetToken(
  client: PoolClient,
  tokenHash: string
): Promise<string | null> {
  const result = await client.query<{ user_id: string }>(
    `UPDATE password_reset_tokens SET used_at = now()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
     RETURNING user_id`,
    [tokenHash]
  );
  return result.rows[0]?.user_id ?? null;
}

export async function updatePasswordAndBumpAuthVersion(
  client: PoolClient,
  userId: string,
  newPasswordHash: string
): Promise<void> {
  await client.query(
    "UPDATE users SET password_hash = $1, auth_version = auth_version + 1 WHERE id = $2",
    [newPasswordHash, userId]
  );
}

export async function invalidateOtherResetTokens(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    "UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL",
    [userId]
  );
}

export async function revokeAllRefreshSessions(client: PoolClient, userId: string): Promise<void> {
  await client.query(
    "UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId]
  );
}

// ───────────────────────── Logout / logout-all ─────────────────────────

// "Log out everywhere" (§9): same auth_version bump as password change/reset, without
// touching the password itself.
export async function bumpAuthVersion(client: PoolClient, userId: string): Promise<void> {
  await client.query("UPDATE users SET auth_version = auth_version + 1 WHERE id = $1", [userId]);
}
