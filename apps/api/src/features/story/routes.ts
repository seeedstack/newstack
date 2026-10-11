import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { getStoryDetail, StoryNotFoundError } from "./service.js";

const CACHE_TTL_SECONDS = 60;

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stories/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cacheKey = `page:story:${id}`;

    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getStoryDetail(getPool(), id);
    } catch (err) {
      if (err instanceof StoryNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      throw err;
    }

    await setCachedPage(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return reply.send(result);
  });
}
