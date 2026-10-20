import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { getSource, getSourceDistribution, listSources, SourceNotFoundError, ValidationError } from "./service.js";

const CACHE_TTL_SECONDS = 3600; // §10 Redis cache plan: "Source metadata, TTL 1h"

export async function sourceRoutes(app: FastifyInstance): Promise<void> {
  // Structural filters + plain offset pagination (ARCHITECTURE §10 "Source directory
  // list/search") — the registry is curated/slow-growing, same TTL rationale as other source
  // metadata since categories/country/language change only on curator action.
  app.get("/sources", async (request, reply) => {
    const cacheKey = `page:source:list:${JSON.stringify(request.query)}`;

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await listSources(getPool(), request.query as Record<string, unknown>);
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.code });
      }
      throw err;
    }

    await setCachedPage(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return reply.send(result);
  });

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
