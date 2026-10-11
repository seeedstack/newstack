// Opaque tokens for email verification / password reset / refresh (§9): a random 256-bit
// value is handed to the client; only its SHA-256 hash is ever stored.
import { createHash, randomBytes } from "node:crypto";

export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
