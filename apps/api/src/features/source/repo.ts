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

export type BiasCategory = "left" | "center-left" | "center" | "center-right" | "right" | "not_rated";

export interface SourceDistributionRow {
  category: BiasCategory;
  total: number;
}

// Site-wide counterpart to feed/repo.ts's fetchBiasBar — same coalesce-to-not_rated,
// same IN-spectrum, current-rating filter — but over every active source, not one story's.
export async function fetchSourceDistribution(pool: Pool): Promise<SourceDistributionRow[]> {
  const result = await pool.query<{ category: BiasCategory; total: string }>(
    `SELECT coalesce(r.bias_rating, 'not_rated') AS category,
            count(DISTINCT s.id) AS total
     FROM sources s
     LEFT JOIN source_ratings r ON r.source_id = s.id AND r.superseded_at IS NULL AND r.spectrum = 'IN'
     WHERE s.status = 'active'
     GROUP BY 1`
  );
  return result.rows.map((r) => ({ category: r.category, total: Number(r.total) }));
}
