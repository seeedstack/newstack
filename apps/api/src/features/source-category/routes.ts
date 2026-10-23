import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { setSourceCategories, SourceNotFoundError, validateCategories, ValidationError } from "./service.js";

// Curator write side: whole-set PUT (PRODUCT §5.9) — a descriptive tag, not a provenance
// record, so there's no revision history to preserve like the rating tables.
export async function sourceCategoryCuratorRoutes(app: FastifyInstance): Promise<void> {
  app.put("/sources/:id/categories", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const categories = validateCategories(request.body);
      const result = await setSourceCategories(getPool(), id, categories);
      return reply.code(200).send({ categories: result });
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
