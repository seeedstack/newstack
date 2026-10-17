import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { getSource, getSourceDistribution, SourceNotFoundError } from "./service.js";

const CACHE_TTL_SECONDS = 3600; // §10 Redis cache plan: "Source metadata, TTL 1h"

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  // Ratings change rarely (manual curation), so this tolerates the same TTL as source metadata.
  app.get("/sources/distribution", async (_request, reply) => {
    const cacheKey = "page:source:distribution";

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    const result = await getSourceDistribution(getPool());

    await setCachedPage(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return reply.send(result);
  });

  app.get("/sources/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cacheKey = `page:source:${id}`;

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getSource(getPool(), id);
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
