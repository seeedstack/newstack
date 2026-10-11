import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { getSourceRatings, SourceNotFoundError, submitRating, validateNewRating, ValidationError } from "./service.js";

const CACHE_TTL_SECONDS = 60;

// Public read side: current rating + history (§10 core screen 4, source directory).
export async function ratingPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sources/:id/ratings", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cacheKey = `page:source-ratings:${id}`;

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getSourceRatings(getPool(), id);
    } catch (err) {
      if (err instanceof SourceNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      throw err;
    }

    await setCachedPage(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return reply.send(result);
  });
}

// Curator write side: atomic rating revision (§10).
export async function ratingCuratorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/sources/:id/ratings", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const input = validateNewRating(request.body);
      const result = await submitRating(getPool(), id, input);
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.code });
      }
      if (err instanceof SourceNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      throw err;
    }
  });
}
