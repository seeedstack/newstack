// Access tokens (§9): 15 min JWT, claims `sub` + `av`, header `kid`. Two keys active
// (current + previous) so verification survives a quarterly rotation; signing always uses
// the current one.
import jwt from "jsonwebtoken";

const CURRENT_KID = process.env.JWT_CURRENT_KID ?? "dev1";
const KEYS: Record<string, string> = JSON.parse(
  process.env.JWT_KEYS ?? '{"dev1":"dev-insecure-secret-change-me"}'
);

export class AccessTokenError extends Error {}

export interface AccessTokenClaims {
  sub: string;
  av: number;
}

export function signAccessToken(userId: string, authVersion: number): string {
  const secret = KEYS[CURRENT_KID];
  if (secret === undefined) throw new Error(`no signing key configured for kid ${CURRENT_KID}`);
  return jwt.sign({ av: authVersion }, secret, {
    subject: userId,
    keyid: CURRENT_KID,
    expiresIn: "15m",
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header.kid;
  if (typeof kid !== "string" || KEYS[kid] === undefined) {
    throw new AccessTokenError("unknown_kid");
  }
  try {
    const payload = jwt.verify(token, KEYS[kid]) as jwt.JwtPayload;
    if (typeof payload.sub !== "string" || typeof payload.av !== "number") {
      throw new AccessTokenError("malformed_claims");
    }
    return { sub: payload.sub, av: payload.av };
  } catch (err) {
    if (err instanceof AccessTokenError) throw err;
    throw new AccessTokenError("invalid_token");
  }
}
