// Fastify instance: three route scopes with structurally separate plugins (ARCHITECTURE §10
// "cache isolation is structural, not a convention") — /auth/*, /api/*, /api/public/*.
import Fastify, { type FastifyInstance } from "fastify";

import { authPlugin } from "./plugins/auth.js";
import { cachePlugin } from "./plugins/cache.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:5173";

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // CSRF defense in depth (§9): SameSite=Strict cookies plus an exact-Origin check plus a
  // JSON-only content type on every state-changing request.
  app.addHook("onRequest", async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    if (request.headers.origin !== WEB_ORIGIN) {
      reply.code(403).send({ error: "origin_mismatch" });
      return reply;
    }
  });
  app.addHook("preValidation", async (request, reply) => {
    if (!MUTATING_METHODS.has(request.method)) return;
    const contentType = request.headers["content-type"] ?? "";
    if (!contentType.startsWith("application/json")) {
      reply.code(415).send({ error: "unsupported_content_type" });
      return reply;
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("Access-Control-Allow-Origin", WEB_ORIGIN);
    reply.header("Access-Control-Allow-Credentials", "true");
    return payload;
  });

  app.get("/health", async () => ({ status: "ok" }));

  // /auth/* — neither plugin; CSRF checks and rate limits only (added in later tasks).
  app.register(async (_authScope) => {
    // Routes land in the signup/login/refresh/reset tasks.
  }, { prefix: "/auth" });

  // /api/public/* — cache plugin, no auth plugin: handlers here cannot read user identity.
  app.register(async (publicScope) => {
    await publicScope.register(cachePlugin);
  }, { prefix: "/api/public" });

  // /api/* — auth plugin, no cache plugin.
  app.register(async (apiScope) => {
    await apiScope.register(authPlugin);
  }, { prefix: "/api" });

  return app;
}
