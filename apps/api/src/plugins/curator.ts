// /api/curator/* scope: a shared-secret header, not user auth. Decision: a handful of
// internal curators don't warrant a users.is_curator role/schema change at MVP — matches the
// complexity-budget philosophy applied everywhere else in this codebase.
import type { FastifyInstance } from "fastify";

const CURATOR_API_KEY = process.env.CURATOR_API_KEY ?? "dev-insecure-curator-key";
const HEADER = "x-curator-key";

export async function curatorPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.headers[HEADER] !== CURATOR_API_KEY) {
      return reply.code(401).send({ error: "unauthorized" });
    }
  });
}
