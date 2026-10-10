import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { buildSetCookie, readCookie } from "../../cookie.js";
import { getPool } from "../../db.js";
import { checkAllLimits, type LimitSpec } from "../../rate-limit.js";
import {
  AuthError,
  confirmPasswordReset,
  login,
  refresh as refreshSession,
  requestPasswordReset,
  signup,
  validateNewPassword,
  validateSignupInput,
  ValidationError,
  verifyEmail,
} from "./service.js";
import { hashToken } from "./tokens.js";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/auth/refresh";
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

// Returns true when within limits (and the attempt is already counted). Sends 429 otherwise.
async function enforceRateLimits(reply: FastifyReply, specs: LimitSpec[]): Promise<boolean> {
  if (await checkAllLimits(specs)) return true;
  reply.code(429).send({ error: "rate_limited" });
  return false;
}

function ipSpec(request: FastifyRequest, endpoint: string, limit: number, windowSeconds: number): LimitSpec {
  return { key: `${endpoint}:ip:${request.ip}`, limit, windowSeconds };
}

function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.header(
    "set-cookie",
    buildSetCookie(REFRESH_COOKIE, token, { path: REFRESH_COOKIE_PATH, maxAgeSeconds: REFRESH_MAX_AGE_SECONDS })
  );
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.header("set-cookie", buildSetCookie(REFRESH_COOKIE, "", { path: REFRESH_COOKIE_PATH, maxAgeSeconds: 0 }));
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/signup", async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown } | undefined;
    const specs: LimitSpec[] = [ipSpec(request, "signup", 60, 60)];
    if (typeof body?.email === "string") {
      specs.push({ key: `signup:email:${body.email.toLowerCase()}`, limit: 3, windowSeconds: 3600 });
    }
    if (!(await enforceRateLimits(reply, specs))) return;

    try {
      const { email, password } = validateSignupInput(body?.email, body?.password);
      await signup(getPool(), email, password);
    } catch (err) {
      if (err instanceof ValidationError) {
        reply.code(400).send({ error: err.code });
        return;
      }
      throw err;
    }
    reply.code(202).send({ message: "check your email" });
  });

  app.post("/verify", async (request, reply) => {
    const body = request.body as { token?: unknown } | undefined;
    if (typeof body?.token !== "string") {
      reply.code(400).send({ error: "invalid_or_used" });
      return;
    }
    try {
      await verifyEmail(getPool(), body.token);
    } catch (err) {
      if (err instanceof ValidationError) {
        reply.code(400).send({ error: err.code });
        return;
      }
      throw err;
    }
    reply.code(200).send({ status: "verified" });
  });

  app.post("/login", async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown } | undefined;
    if (typeof body?.email !== "string" || typeof body?.password !== "string") {
      reply.code(401).send({ error: "invalid_credentials" });
      return;
    }
    const email = body.email.toLowerCase();
    const specs: LimitSpec[] = [
      ipSpec(request, "login", 300, 60),
      { key: `login:email:${email}:min`, limit: 5, windowSeconds: 60 },
      { key: `login:email:${email}:hour`, limit: 20, windowSeconds: 3600 },
    ];
    if (!(await enforceRateLimits(reply, specs))) return;

    try {
      const result = await login(getPool(), body.email, body.password);
      setRefreshCookie(reply, result.refreshToken);
      reply.code(200).send({ accessToken: result.accessToken });
    } catch (err) {
      if (err instanceof AuthError) {
        reply.code(401).send({ error: err.code });
        return;
      }
      throw err;
    }
  });

  app.post("/refresh", async (request, reply) => {
    const presented = readCookie(request.headers.cookie, REFRESH_COOKIE);
    if (presented === undefined) {
      reply.code(401).send({ error: "refresh_rejected" });
      return;
    }
    const specs: LimitSpec[] = [
      ipSpec(request, "refresh", 600, 60),
      { key: `refresh:token:${hashToken(presented)}`, limit: 10, windowSeconds: 60 },
    ];
    if (!(await enforceRateLimits(reply, specs))) return;

    try {
      const result = await refreshSession(getPool(), presented);
      setRefreshCookie(reply, result.refreshToken);
      reply.code(200).send({ accessToken: result.accessToken });
    } catch (err) {
      if (err instanceof AuthError) {
        clearRefreshCookie(reply);
        reply.code(401).send({ error: err.code });
        return;
      }
      throw err;
    }
  });

  app.post("/reset/request", async (request, reply) => {
    const body = request.body as { email?: unknown } | undefined;
    if (typeof body?.email !== "string") {
      reply.code(400).send({ error: "invalid_email" });
      return;
    }
    const specs: LimitSpec[] = [
      ipSpec(request, "reset-request", 120, 60),
      { key: `reset-request:email:${body.email.toLowerCase()}`, limit: 3, windowSeconds: 3600 },
    ];
    if (!(await enforceRateLimits(reply, specs))) return;

    await requestPasswordReset(getPool(), body.email);
    reply.code(202).send({ message: "check your email" });
  });

  app.post("/reset/confirm", async (request, reply) => {
    const body = request.body as { token?: unknown; newPassword?: unknown } | undefined;
    if (typeof body?.token !== "string") {
      reply.code(400).send({ error: "invalid_or_used" });
      return;
    }
    try {
      const newPassword = validateNewPassword(body.newPassword);
      await confirmPasswordReset(getPool(), body.token, newPassword);
    } catch (err) {
      if (err instanceof ValidationError) {
        reply.code(400).send({ error: err.code });
        return;
      }
      throw err;
    }
    reply.code(200).send({ status: "reset" });
  });
}
