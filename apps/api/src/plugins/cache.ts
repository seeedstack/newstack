// /api/public/* scope: anonymous page cache (ARCHITECTURE §10). No auth plugin runs here,
// so handlers in this scope must never read user identity. Stub for the skeleton — Redis
// wiring lands in the rate-limits/Redis task.
import type { FastifyInstance } from "fastify";

export async function cachePlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("Cache-Control", "public, max-age=30");
    return payload;
  });
}
