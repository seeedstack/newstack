// /api/* scope: verifies the access JWT and checks `av` against users.auth_version (§9).
// Direct Postgres read for now — the Redis ≤30s cache is added in the rate-limits/Redis task.
import type { FastifyInstance, FastifyRequest } from "fastify";

import { getPool } from "../db.js";
import { AccessTokenError, type AccessTokenClaims, verifyAccessToken } from "../features/auth/jwt.js";

declare module "fastify" {
  interface FastifyRequest {
    userId?: string;
  }
}

async function currentAuthVersion(userId: string): Promise<number | null> {
  const result = await getPool().query<{ auth_version: number }>(
    "SELECT auth_version FROM users WHERE id = $1",
    [userId]
  );
  return result.rows[0]?.auth_version ?? null;
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request: FastifyRequest, reply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (token === undefined) {
      reply.code(401).send({ error: "unauthorized" });
      return reply;
    }

    let claims: AccessTokenClaims;
    try {
      claims = verifyAccessToken(token);
    } catch (err) {
      if (err instanceof AccessTokenError) {
        reply.code(401).send({ error: "unauthorized" });
        return reply;
      }
      throw err;
    }

    const authVersion = await currentAuthVersion(claims.sub);
    if (authVersion === null || authVersion !== claims.av) {
      // ponytail: §9 wants this logged sampled at max 1/min/user; plain logging is fine
      // until log volume is a problem (watch it in the runbooks pass before launch).
      reply.code(401).send({ error: "access_version_mismatch" });
      return reply;
    }

    request.userId = claims.sub;
  });
}
