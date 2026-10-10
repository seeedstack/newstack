// Postgres access: one pooled client, shared across requests (ARCHITECTURE §4).
import { Pool, type PoolClient, types } from "pg";

// node-pg returns BIGINT (OID 20) as a string by default to avoid silent precision loss.
// None of our bigints (auth_version, the *_runs/*_events identity columns) approach
// Number.MAX_SAFE_INTEGER, and treating auth_version as a string would corrupt the JWT
// `av` claim's JSON type, so parse it to a number here instead of at every call site.
types.setTypeParser(20, (val: string) => parseInt(val, 10));

export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://newstack:newstack@localhost:5432/newstack";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool === null) {
    pool = new Pool({ connectionString: DATABASE_URL, max: 5 });
  }
  return pool;
}

export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
