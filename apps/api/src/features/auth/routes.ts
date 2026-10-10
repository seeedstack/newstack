import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { signup, ValidationError, validateSignupInput } from "./service.js";

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
}
