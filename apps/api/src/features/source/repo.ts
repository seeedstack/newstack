import type { Pool } from "pg";

export interface SourceRow {
  id: string;
  name: string;
  domain: string;
  status: "active" | "deprecated";
  deprecated_at: Date | null;
  logo_url: string | null;
}

export async function fetchSource(pool: Pool, sourceId: string): Promise<SourceRow | null> {
  const result = await pool.query<SourceRow>(
    "SELECT id, name, domain, status, deprecated_at, logo_url FROM sources WHERE id = $1",
    [sourceId]
  );
  return result.rows[0] ?? null;
}
