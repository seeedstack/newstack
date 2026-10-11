import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { itemExists, listSavedItems, saveItem, SAVED_SOURCES, SAVED_STORIES, SAVED_TOPICS, unsaveItem, type SavedResourceConfig } from "./repo.js";

function registerSavedResource(app: FastifyInstance, path: string, config: SavedResourceConfig): void {
  app.get(path, async (request) => {
    const items = await listSavedItems(getPool(), config, request.userId as string);
    return { items };
  });

  // §10 idempotency: PUT/DELETE /api/me/saved-{stories,sources,topics}/:id are idempotent by
  // primary key — 204 either way, including for an id that was never saved.
  app.put(`${path}/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await itemExists(getPool(), config, id))) {
      return reply.code(404).send({ error: "not_found" });
    }
    await saveItem(getPool(), config, request.userId as string, id);
    return reply.code(204).send();
  });

  app.delete(`${path}/:id`, async (request, reply) => {
    const { id } = request.params as { id: string };
    await unsaveItem(getPool(), config, request.userId as string, id);
    return reply.code(204).send();
  });
}

export async function savedRoutes(app: FastifyInstance): Promise<void> {
  registerSavedResource(app, "/me/saved-sources", SAVED_SOURCES);
  registerSavedResource(app, "/me/saved-stories", SAVED_STORIES);
  registerSavedResource(app, "/me/saved-topics", SAVED_TOPICS);
}
