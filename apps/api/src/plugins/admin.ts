// /api/admin/* scope: builds on authPlugin (must run after it) and additionally requires
// users.is_admin — PAYPAL_SPEC §4.12 "role-based access" without a separate roles table,
// matching curatorPlugin's complexity-budget call for the handful-of-staff case.
import type { FastifyInstance } from "fastify";

import { getPool } from "../db.js";
import { isUserAdmin } from "../features/billing/repo.js";

export async function adminPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (request, reply) => {
    if (request.userId === undefined || !(await isUserAdmin(getPool(), request.userId))) {
      reply.code(403).send({ error: "forbidden" });
      return reply;
    }
  });
}
