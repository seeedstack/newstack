import argon2 from "argon2";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

import { withTransaction } from "../../db.js";
import { isCommonPassword } from "./common-passwords.js";
import { signAccessToken } from "./jwt.js";
import {
  bumpAuthVersion,
  consumeEmailVerificationToken,
  consumePasswordResetToken,
  findUserForLogin,
  findUserIdByEmail,
  getAuthVersion,
  insertAuthEvent,
  insertEmailOutbox,
  insertRefreshSession,
  insertUserReturningId,
  invalidateOtherResetTokens,
  markEmailVerified,
  markRefreshRotated,
  revokeAllRefreshSessions,
  revokeRefreshFamily,
  selectRefreshSessionForUpdate,
  updatePasswordAndBumpAuthVersion,
} from "./repo.js";
import { hashToken, randomToken } from "./tokens.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (§9)
const GRACE_WINDOW_MS = 30 * 1000;
const GRACE_MAX_CHILDREN = 3;

export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export class AuthError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

// argon2id, m = 19 MiB, t = 2, p = 1 (§9).
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 19 * 1024, timeCost: 2, parallelism: 1 };

// A fixed dummy hash, verified against on every login for an unknown email so that the
// response takes the same time as a real (wrong-password) verification (§9 equal timing).
const DUMMY_HASH = await argon2.hash("dummy-password-for-timing-safety", ARGON2_OPTIONS);

function validatePassword(password: unknown): string {
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    throw new ValidationError("invalid_password");
  }
  if (isCommonPassword(password)) {
    throw new ValidationError("common_password");
  }
  return password;
}

export function validateSignupInput(email: unknown, password: unknown): { email: string; password: string } {
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    throw new ValidationError("invalid_email");
  }
  return { email, password: validatePassword(password) };
}

// Always succeeds from the caller's point of view (§9: signup never reveals whether an
// email exists) — the 202 response is the same regardless of which branch runs below.
export async function signup(pool: Pool, email: string, password: string): Promise<void> {
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  await withTransaction(pool, async (client) => {
    const newUserId = await insertUserReturningId(client, email, passwordHash);
    if (newUserId !== null) {
      await insertEmailOutbox(client, newUserId, "verify_email");
    } else {
      const existingUserId = await findUserIdByEmail(client, email);
      // existingUserId is always found here: the ON CONFLICT above only fires when a row
      // with this lower(email) already exists.
      await insertEmailOutbox(client, existingUserId as string, "account_exists");
    }
  });
}

// ───────────────────────── Task C: email verification ─────────────────────────

export async function verifyEmail(pool: Pool, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  await withTransaction(pool, async (client) => {
    const userId = await consumeEmailVerificationToken(client, tokenHash);
    if (userId === null) throw new ValidationError("invalid_or_used");
    await markEmailVerified(client, userId);
    await insertAuthEvent(client, userId, "email_verified");
  });
}

// ───────────────────────── Task D: login + JWT issuance ─────────────────────────

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
}

// withTransaction commits whatever the callback returns and rolls back only on a throw — so
// a rejected login (which still must commit its login_fail audit row) can't signal failure by
// throwing. It returns a discriminated result instead; only after the commit do we turn an
// "ok: false" into the AuthError the route handler expects.
type LoginOutcome = { ok: true; result: LoginResult } | { ok: false; code: string };

export async function login(pool: Pool, email: string, password: string): Promise<LoginResult> {
  const outcome = await withTransaction<LoginOutcome>(pool, async (client) => {
    const user = await findUserForLogin(client, email);
    // Verify against the dummy hash for an unknown email so the two failure paths take the
    // same time (§9) — argon2.verify's cost depends only on the hash's params, not on match.
    const passwordOk = await argon2.verify(user?.password_hash ?? DUMMY_HASH, password);
    if (user === null || !passwordOk) {
      await insertAuthEvent(client, user?.id ?? null, "login_fail");
      return { ok: false, code: "invalid_credentials" };
    }

    const familyId = randomUUID();
    const rawRefreshToken = randomToken();
    await insertRefreshSession(client, {
      userId: user.id,
      familyId,
      parentId: null,
      tokenHash: hashToken(rawRefreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    });
    await insertAuthEvent(client, user.id, "login_ok", { familyId });

    return {
      ok: true,
      result: { accessToken: signAccessToken(user.id, user.auth_version), refreshToken: rawRefreshToken },
    };
  });

  if (!outcome.ok) throw new AuthError(outcome.code);
  return outcome.result;
}

// ───────────────────────── Task F: refresh rotation ─────────────────────────

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

// Same reasoning as login's outcome type: the reuse-revoked branch's revocation (and the
// rejected branch's audit row) must survive the commit even though the caller is told it
// failed, so failure is a returned value here, never a throw inside the transaction.
type RefreshOutcome = { ok: true; result: RefreshResult } | { ok: false; code: string };

// Exactly the state table in §9: unknown/expired/revoked → reject; never rotated → rotate;
// rotated ≤ 30s ago with < 3 children → grace sibling; otherwise → reuse, revoke the family.
export async function refresh(pool: Pool, presentedToken: string): Promise<RefreshResult> {
  const presentedHash = hashToken(presentedToken);
  const outcome = await withTransaction<RefreshOutcome>(pool, async (client) => {
    const row = await selectRefreshSessionForUpdate(client, presentedHash);
    if (row === null) {
      await insertAuthEvent(client, null, "refresh_rejected", { reason: "unknown_expired_or_revoked" });
      return { ok: false, code: "refresh_rejected" };
    }

    const now = Date.now();
    const rotatedRecently = row.rotated_at !== null && now - row.rotated_at.getTime() <= GRACE_WINDOW_MS;

    if (row.rotated_at === null) {
      await markRefreshRotated(client, row.id);
      await insertAuthEvent(client, row.user_id, "refresh_rotate", { familyId: row.family_id });
    } else if (rotatedRecently && row.children < GRACE_MAX_CHILDREN) {
      await insertAuthEvent(client, row.user_id, "refresh_grace", { familyId: row.family_id });
    } else {
      await revokeRefreshFamily(client, row.family_id);
      await insertAuthEvent(client, row.user_id, "refresh_reuse_revoked", { familyId: row.family_id });
      return { ok: false, code: "refresh_reuse_revoked" };
    }

    const rawChildToken = randomToken();
    await insertRefreshSession(client, {
      userId: row.user_id,
      familyId: row.family_id,
      parentId: row.id,
      tokenHash: hashToken(rawChildToken),
      expiresAt: new Date(now + REFRESH_TTL_MS),
    });

    const authVersion = await getAuthVersion(client, row.user_id);
    return {
      ok: true,
      result: { accessToken: signAccessToken(row.user_id, authVersion as number), refreshToken: rawChildToken },
    };
  });

  if (!outcome.ok) throw new AuthError(outcome.code);
  return outcome.result;
}

// ───────────────────────── Task G: password reset ─────────────────────────

export async function requestPasswordReset(pool: Pool, email: string): Promise<void> {
  // Mirrors signup's existence-hiding shape: always succeeds; only writes an outbox row
  // when the account exists, and the caller can't tell the difference either way.
  await withTransaction(pool, async (client) => {
    const userId = await findUserIdByEmail(client, email);
    if (userId !== null) {
      await insertEmailOutbox(client, userId, "password_reset");
    }
  });
}

export function validateNewPassword(password: unknown): string {
  return validatePassword(password);
}

export async function confirmPasswordReset(pool: Pool, token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
  await withTransaction(pool, async (client) => {
    const userId = await consumePasswordResetToken(client, tokenHash);
    if (userId === null) throw new ValidationError("invalid_or_used");
    await updatePasswordAndBumpAuthVersion(client, userId, passwordHash);
    await invalidateOtherResetTokens(client, userId);
    await revokeAllRefreshSessions(client, userId);
    await insertAuthEvent(client, userId, "password_reset");
  });
}

// ───────────────────────── Logout / logout-all ─────────────────────────

// §10 idempotency table: "already revoked → 204" — an unknown, expired, or already-revoked
// token is not an error, it's simply nothing left to revoke.
export async function logout(pool: Pool, presentedToken: string | undefined): Promise<void> {
  if (presentedToken === undefined) return;
  const presentedHash = hashToken(presentedToken);
  await withTransaction(pool, async (client) => {
    const row = await selectRefreshSessionForUpdate(client, presentedHash);
    if (row === null) return;
    await revokeRefreshFamily(client, row.family_id);
    await insertAuthEvent(client, row.user_id, "logout", { familyId: row.family_id });
  });
}

// §10 idempotency table: "Bumps auth_version each call — harmless; 204". Also revokes every
// refresh session (§9's "log out everywhere"), not just the presented one — otherwise a
// bumped auth_version would stop short-lived access tokens but leave every device able to
// mint fresh ones via /auth/refresh, which checks refresh_sessions, not auth_version.
export async function logoutAll(pool: Pool, presentedToken: string | undefined): Promise<void> {
  if (presentedToken === undefined) return;
  const presentedHash = hashToken(presentedToken);
  await withTransaction(pool, async (client) => {
    const row = await selectRefreshSessionForUpdate(client, presentedHash);
    if (row === null) return;
    await bumpAuthVersion(client, row.user_id);
    await revokeAllRefreshSessions(client, row.user_id);
    await insertAuthEvent(client, row.user_id, "logout_all");
  });
}
