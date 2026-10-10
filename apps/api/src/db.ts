// Postgres access: one pooled client, shared across requests (ARCHITECTURE §4).
import { Pool } from "pg";

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://newstack:newstack@localhost:5432/newstack";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool === null) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}
