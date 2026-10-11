import type { Pool } from "pg";

export interface StoryRow {
  id: string;
  title: string;
  summary: string | null;
  last_coverage_at: Date;
}

// `limit` should be pageSize + 1 (one extra row to detect "more pages" — see buildPage).
export async function fetchFeedPage(
  pool: Pool,
  args: { asOf: Date; cursorCoverageAt: Date | null; cursorId: string | null; limit: number }
): Promise<StoryRow[]> {
  const result = await pool.query<StoryRow>(
    `SELECT id, title, summary, last_coverage_at FROM stories
     WHERE status = 'active' AND hidden_at IS NULL
       AND last_coverage_at <= $1
       AND ($2::timestamptz IS NULL OR (last_coverage_at, id) < ($2, $3))
     ORDER BY last_coverage_at DESC, id DESC
     LIMIT $4`,
    [args.asOf, args.cursorCoverageAt, args.cursorId, args.limit]
  );
  return result.rows;
}

export async function countUpdatedSince(pool: Pool, asOf: Date): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*) FROM stories WHERE status = 'active' AND hidden_at IS NULL AND last_coverage_at > $1`,
    [asOf]
  );
  return Number(result.rows[0].count);
}

export type BiasCategory = "left" | "center-left" | "center" | "center-right" | "right" | "not_rated";

export interface BiasBarRow {
  story_id: string;
  category: BiasCategory;
  total: number;
  low_confidence: number;
}

// PRODUCT §3.3: category = coalesce(bias_rating, 'not_rated'), restricted to the IN spectrum
// — a factuality-only (international) source's rating doesn't match that filter, so it
// coalesces into 'not_rated' too, exactly as §3.2 specifies ("sit outside the bar").
export async function fetchBiasBar(pool: Pool, storyIds: string[]): Promise<BiasBarRow[]> {
  if (storyIds.length === 0) return [];
  const result = await pool.query<{ story_id: string; category: BiasCategory; total: string; low_confidence: string }>(
    `SELECT a.story_id,
            coalesce(r.bias_rating, 'not_rated') AS category,
            count(DISTINCT a.source_id) AS total,
            count(DISTINCT a.source_id) FILTER (WHERE r.confidence = 'low') AS low_confidence
     FROM articles a
     LEFT JOIN source_ratings r
            ON r.source_id = a.source_id AND r.superseded_at IS NULL AND r.spectrum = 'IN'
     WHERE a.hidden_at IS NULL AND a.story_id = ANY($1)
     GROUP BY a.story_id, coalesce(r.bias_rating, 'not_rated')`,
    [storyIds]
  );
  return result.rows.map((r) => ({ ...r, total: Number(r.total), low_confidence: Number(r.low_confidence) }));
}

export interface RatedCountsRow {
  story_id: string;
  rated_source_count: number;
  unrated_source_count: number;
}

// §10 API semantics: rated/unrated by "has any current rating at all" — unlike the bar's
// spectrum filter above, a factuality-only source DOES count as rated here.
export async function fetchRatedCounts(pool: Pool, storyIds: string[]): Promise<RatedCountsRow[]> {
  if (storyIds.length === 0) return [];
  const result = await pool.query<{ story_id: string; rated_source_count: string; unrated_source_count: string }>(
    `SELECT a.story_id,
            count(DISTINCT a.source_id) FILTER (WHERE r.source_id IS NOT NULL) AS rated_source_count,
            count(DISTINCT a.source_id) FILTER (WHERE r.source_id IS NULL)     AS unrated_source_count
     FROM articles a
     LEFT JOIN source_ratings r ON r.source_id = a.source_id AND r.superseded_at IS NULL
     WHERE a.hidden_at IS NULL AND a.story_id = ANY($1)
     GROUP BY a.story_id`,
    [storyIds]
  );
  return result.rows.map((r) => ({
    story_id: r.story_id,
    rated_source_count: Number(r.rated_source_count),
    unrated_source_count: Number(r.unrated_source_count),
  }));
}
