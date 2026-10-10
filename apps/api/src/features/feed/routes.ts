import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { InvalidCursorError } from "../../pagination.js";
import { getHomeFeed } from "./service.js";

const CACHE_TTL_SECONDS = 60;

export async function feedRoutes(app: FastifyInstance): Promise<void> {
  app.get("/feed", async (request, reply) => {
    const cursor = (request.query as { cursor?: unknown }).cursor;
    const cursorRaw = typeof cursor === "string" ? cursor : undefined;

    const cacheKey = cursorRaw === undefined ? "page:feed:home:first" : `page:feed:home:cursor:${cursorRaw}`;
    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getHomeFeed(getPool(), cursorRaw);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return reply.code(400).send({ error: "invalid_cursor" });
      }
      throw err;
    }

    await setCachedPage(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return reply.send(result);
  });
}
