import type { FastifyInstance } from "fastify";

import { getPool } from "../../db.js";
import { InvalidCursorError } from "../../pagination.js";
import { getBlindspotFeed } from "./service.js";

// Curator-only (PRODUCT §4.9): no calibration round has run yet, so no blindspot flag may be
// shown publicly. Registered under /api/curator/* only — moving it to /api/public/* is the
// trigger-fire moment §4.9 describes, not a code change.
export async function blindspotCuratorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/blindspot-feed", async (request, reply) => {
    const cursor = (request.query as { cursor?: unknown }).cursor;
    const cursorRaw = typeof cursor === "string" ? cursor : undefined;

    try {
      const result = await getBlindspotFeed(getPool(), cursorRaw);
      return reply.send(result);
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        return reply.code(400).send({ error: "invalid_cursor" });
      }
      throw err;
    }
  });
}
