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

export interface SourceListFilters {
  category: string | null;
  country: string | null;
  language: string | null;
  q: string | null;
  limit: number;
  offset: number;
}

export interface SourceListRow {
  id: string;
  name: string;
  domain: string;
  country_code: string;
  coverage_region: string | null;
  language: string;
  categories: string[];
}

// Structural filters only at MVP (ARCHITECTURE §10 "Source directory list/search") — plain
// offset pagination, not the keyset-cursor machinery feeds use: the registry is a curated,
// slow-growing set, not an unbounded fast-moving one (§1 complexity budget).
export async function fetchSourceList(
  pool: Pool,
  filters: SourceListFilters
): Promise<{ items: SourceListRow[]; total: number }> {
  const where: string[] = ["s.status = 'active'"];
  const params: unknown[] = [];

  if (filters.category !== null) {
    params.push(filters.category);
    where.push(`EXISTS (SELECT 1 FROM source_categories sc WHERE sc.source_id = s.id AND sc.category = $${params.length})`);
  }
  if (filters.country !== null) {
    params.push(filters.country);
    where.push(`s.country_code = $${params.length}`);
  }
  if (filters.language !== null) {
    params.push(filters.language);
    where.push(`s.language = $${params.length}`);
  }
  if (filters.q !== null) {
    params.push(`%${filters.q}%`);
    where.push(`s.name ILIKE $${params.length}`);
  }
  const whereClause = where.join(" AND ");

  const countResult = await pool.query<{ total: string }>(`SELECT count(*) AS total FROM sources s WHERE ${whereClause}`, params);

  params.push(filters.limit, filters.offset);
  const itemsResult = await pool.query<SourceListRow>(
    `SELECT s.id, s.name, s.domain, s.country_code, s.coverage_region, s.language,
            coalesce(array_agg(sc.category) FILTER (WHERE sc.category IS NOT NULL), '{}') AS categories
     FROM sources s
     LEFT JOIN source_categories sc ON sc.source_id = s.id
     WHERE ${whereClause}
     GROUP BY s.id
     ORDER BY s.name
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return { items: itemsResult.rows, total: Number(countResult.rows[0].total) };
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
