import type { FastifyInstance, FastifyReply } from "fastify";

import { buildSetCookie, readCookie } from "../../cookie.js";
import { getPool } from "../../db.js";
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

const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/auth/refresh";
const REFRESH_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

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
