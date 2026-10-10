// /api/* scope: verifies the access JWT and checks `av` against users.auth_version.
// Stub for the skeleton — real verification lands in the login/JWT-issuance task.
import type { FastifyInstance } from "fastify";

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (_request, _reply) => {
    // TODO: verify JWT (kid, sub, av, exp) and check av === users.auth_version.
  });
}
