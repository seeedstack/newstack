import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import {
  getSourceGeoRatings,
  isTopicCode,
  SourceNotFoundError,
  submitRating,
  validateNewRating,
  ValidationError,
} from "./service.js";

const CACHE_TTL_SECONDS = 60;

// Public read side: current rating + history for all 8 topics (PRODUCT §5.6, source directory).
export async function geoRatingPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sources/:id/geo", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cacheKey = `page:source-geo:${id}`;

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getSourceGeoRatings(getPool(), id);
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

// Curator write side: atomic rating revision scoped to one topic, same shape as
// sensationalism-rating/routes.ts but keyed on (source_id, topic_code).
export async function geoRatingCuratorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/sources/:id/geo/:topicCode", async (request, reply) => {
    const { id, topicCode } = request.params as { id: string; topicCode: string };
    try {
      const input = validateNewRating(topicCode, request.body);
      if (!isTopicCode(topicCode)) throw new ValidationError("invalid_topic_code");
      const result = await submitRating(getPool(), id, topicCode, input);
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
