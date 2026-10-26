import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { findActiveSubscriptionForUser } from "../billing/repo.js";
import { isEntitled } from "../billing/entitlement.js";
import { getCachedPage, setCachedPage } from "../../page-cache.js";
import { applyFreeTierCap, getStoryDetail, StoryNotFoundError } from "./service.js";

const CACHE_TTL_SECONDS = 60;

export async function storyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stories/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const cacheKey = `page:story:${id}`;

    // Shared cache, no user identity (ARCHITECTURE §10) — this must always be the SAME body
    // for every caller, so it's always the free-tier-capped view. A signed-in, entitled
    // reader gets the rest via the authenticated route below, never from this cache.
    const cached = await getCachedPage(cacheKey);
    if (cached !== null) {
      return reply.send(JSON.parse(cached));
    }

    let result;
    try {
      result = await applyFreeTierCap(await getStoryDetail(getPool(), id));
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

// /api/stories/:id/full-breakdown — authenticated, uncached (per-user), entitlement-gated.
// Mounted in the /api/* scope (app.ts), after authPlugin sets request.userId.
export async function storyPremiumRoutes(app: FastifyInstance): Promise<void> {
  app.get("/stories/:id/full-breakdown", async (request, reply) => {
    const { id } = request.params as { id: string };
    const sub = await findActiveSubscriptionForUser(getPool(), request.userId as string);
    if (!isEntitled(sub)) return reply.code(403).send({ error: "subscription_required" });

    try {
      return reply.send(await getStoryDetail(getPool(), id));
    } catch (err) {
      if (err instanceof StoryNotFoundError) return reply.code(404).send({ error: "not_found" });
      throw err;
    }
  });
}
