import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import {
  getSourceOwnership,
  SourceNotFoundError,
  submitOwnership,
  validateOwnershipInput,
  ValidationError,
} from "./service.js";

const CACHE_TTL_SECONDS = 60;

// Public read side: the current disclosure record, or null if never researched (PRODUCT §5.8,
// source directory). No history — source_ownership is current-state only.
export async function ownershipPublicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/sources/:id/ownership", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cacheKey = `page:source-ownership:${id}`;

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getSourceOwnership(getPool(), id);
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

// Curator write side: plain upsert, not an atomic-revision transaction like the three
// append-only rating tables — a correction overwrites in place (PRODUCT §5.8).
export async function ownershipCuratorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/sources/:id/ownership", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const input = validateOwnershipInput(request.body);
      const result = await submitOwnership(getPool(), id, input);
      return reply.code(200).send(result);
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
