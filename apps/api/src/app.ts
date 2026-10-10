// Fastify instance: three route scopes with structurally separate plugins (ARCHITECTURE §10
// "cache isolation is structural, not a convention") — /auth/*, /api/*, /api/public/*.
import Fastify, { type FastifyInstance } from "fastify";

import { WEB_ORIGIN } from "./config.js";
import { authRoutes } from "./features/auth/routes.js";
import { authPlugin } from "./plugins/auth.js";
import { cachePlugin } from "./plugins/cache.js";

export { WEB_ORIGIN } from "./config.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// §9 asks for client IP = the address N hops back in X-Forwarded-For via Fastify's
// `trustProxy: N`. This Fastify version removed numeric hop-count trust: it can't validate
// the immediate peer, so a direct client could spoof X-Forwarded-For to fake N hops. The
// secure equivalent it recommends is trusting the proxy's actual IP/CIDR instead — set
// TRUSTED_PROXY to that address (or "true" to trust any peer, only for local dev).
const TRUSTED_PROXY_RAW = process.env.TRUSTED_PROXY;
const TRUSTED_PROXY: boolean | string =
  TRUSTED_PROXY_RAW === undefined ? false : TRUSTED_PROXY_RAW === "true" ? true : TRUSTED_PROXY_RAW;

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: TRUSTED_PROXY });

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

  // /auth/* — neither plugin; CSRF checks and rate limits only (rate limits: inside authRoutes).
  app.register(authRoutes, { prefix: "/auth" });

  // /api/public/* — cache plugin, no auth plugin: handlers here cannot read user identity.
  // The plugin is called directly (not via .register()) so its hook lands on this same
  // scope instead of an isolated child context — Fastify's encapsulation would otherwise
  // keep it from applying to sibling routes registered directly on publicScope.
  app.register(async (publicScope) => {
    await cachePlugin(publicScope);
  }, { prefix: "/api/public" });

  // /api/* — auth plugin, no cache plugin. Same direct-call reasoning as above.
  app.register(async (apiScope) => {
    await authPlugin(apiScope);
    // Minimal authenticated echo route — first real consumer of request.userId, and gives
    // the auth plugin an actual registered route to run its hook against.
    apiScope.get("/whoami", async (request) => ({ userId: request.userId }));
  }, { prefix: "/api" });

  return app;
}
