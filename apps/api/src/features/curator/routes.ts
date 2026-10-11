import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import {
  createTopic,
  NotFoundError,
  onboardSource,
  reportClusterError,
  takedownArticle,
  takedownStory,
  validateNewSource,
  ValidationError,
} from "./service.js";

export async function curatorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/sources", async (request, reply) => {
    try {
      const input = validateNewSource(request.body);
      const { id } = await onboardSource(getPool(), input);
      return reply.code(201).send({ id });
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.code });
      throw err;
    }
  });

  app.post("/topics", async (request, reply) => {
    const body = request.body as { name?: unknown; keywords?: unknown; createdBy?: unknown } | undefined;
    try {
      const { id } = await createTopic(getPool(), body?.name, body?.keywords, body?.createdBy);
      return reply.code(201).send({ id });
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.code });
      throw err;
    }
  });

  app.post("/articles/:id/hide", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: unknown } | undefined;
    try {
      await takedownArticle(getPool(), id, body?.reason);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.code });
      if (err instanceof NotFoundError) return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.post("/stories/:id/hide", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await takedownStory(getPool(), id);
      return reply.code(204).send();
    } catch (err) {
      if (err instanceof NotFoundError) return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });

  app.post("/cluster-reports", async (request, reply) => {
    try {
      const { id } = await reportClusterError(getPool(), request.body);
      return reply.code(201).send({ id });
    } catch (err) {
      if (err instanceof ValidationError) return reply.code(400).send({ error: err.code });
      if (err instanceof NotFoundError) return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
