import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { InvalidCursorError } from "../../pagination.js";
import { getTopicFeed, getTopics, TopicNotFoundError } from "./service.js";

const CACHE_TTL_SECONDS = 60;

export async function topicRoutes(app: FastifyInstance): Promise<void> {
  app.get("/topics", async (_request, reply) => {
    const cacheKey = "page:topics:list";
    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    const topics = await getTopics(getPool());
    await setCachedPage(cacheKey, JSON.stringify(topics), CACHE_TTL_SECONDS);
    return reply.send(topics);
  });

  app.get("/topics/:id/feed", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cursor = (request.query as { cursor?: unknown }).cursor;
    const cursorRaw = typeof cursor === "string" ? cursor : undefined;

    const cacheKey = cursorRaw === undefined ? `page:topic:${id}:first` : `page:topic:${id}:cursor:${cursorRaw}`;
    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await getTopicFeed(getPool(), id, cursorRaw);
    } catch (err) {
      if (err instanceof TopicNotFoundError) {
        return reply.code(404).send({ error: "not_found" });
      }
      if (err instanceof InvalidCursorError) {
        return reply.code(400).send({ error: "invalid_cursor" });
      }
      throw err;
    }

    await setCachedPage(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return reply.send(result);
  });
}
