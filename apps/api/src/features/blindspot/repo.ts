import type { Pool } from "pg";

import type { BlindspotParams } from "./config.js";

export interface Baseline {
  p_left: number;
  p_center: number;
  p_right: number;
}

export async function fetchLatestBaseline(pool: Pool, spectrum: string, asOf: Date): Promise<Baseline | null> {
  const result = await pool.query<Baseline>(
    `SELECT p_left, p_center, p_right FROM bias_baselines
     WHERE spectrum = $1 AND computed_at <= $2
     ORDER BY computed_at DESC LIMIT 1`,
    [spectrum, asOf]
  );
  return result.rows[0] ?? null;
}

export interface BlindspotRow {
  id: string;
  title: string;
  last_coverage_at: Date;
  side: "L" | "R";
  k_left: number;
  k_center: number;
  k_right: number;
}

// PRODUCT §4.6, verbatim (cursor params bound the same way every other feed in this codebase
// binds them): stories active in the last 7 days, newest coverage first.
export async function fetchBlindspotPage(
  pool: Pool,
  args: {
    asOf: Date;
    cursorCoverageAt: Date | null;
    cursorId: string | null;
    limit: number;
    params: BlindspotParams;
  }
): Promise<BlindspotRow[]> {
  const result = await pool.query<{
    id: string;
    title: string;
    last_coverage_at: Date;
    side: "L" | "R";
    k_left: string;
    k_center: string;
    k_right: string;
  }>(
    `WITH base AS (
       SELECT p_left, p_center, p_right FROM bias_baselines
       WHERE spectrum = 'IN' AND computed_at <= $1
       ORDER BY computed_at DESC LIMIT 1),
     counts AS (
       SELECT a.story_id,
              count(DISTINCT a.source_id) FILTER (WHERE r.bias_rating IN ('left','center-left'))  AS k_left,
              count(DISTINCT a.source_id) FILTER (WHERE r.bias_rating = 'center')                 AS k_center,
              count(DISTINCT a.source_id) FILTER (WHERE r.bias_rating IN ('center-right','right')) AS k_right
       FROM articles a
       JOIN source_ratings r ON r.source_id = a.source_id AND r.superseded_at IS NULL
       WHERE a.hidden_at IS NULL AND r.spectrum = 'IN' AND r.confidence <> 'low'
         AND a.story_id IN (SELECT id FROM stories
                            WHERE status = 'active' AND hidden_at IS NULL
                              AND last_coverage_at <= $1
                              AND last_coverage_at >  $1 - interval '7 days')
       GROUP BY a.story_id),
     flagged AS (
       SELECT c.*, blindspot_side(c.k_left::int, c.k_center::int, c.k_right::int,
                                  b.p_left, b.p_center, b.p_right,
                                  $5::int, $6::float8, $7::float8) AS side
       FROM counts c CROSS JOIN base b)
     SELECT s.id, s.title, s.last_coverage_at, f.side, f.k_left, f.k_center, f.k_right
     FROM flagged f JOIN stories s ON s.id = f.story_id
     WHERE f.side IS NOT NULL
       AND ($2::timestamptz IS NULL OR (s.last_coverage_at, s.id) < ($2, $3))
     ORDER BY s.last_coverage_at DESC, s.id DESC
     LIMIT $4`,
    [args.asOf, args.cursorCoverageAt, args.cursorId, args.limit,
     args.params.nMin, args.params.materiality, args.params.z]
  );
  return result.rows.map((r) => ({
    ...r,
    k_left: Number(r.k_left),
    k_center: Number(r.k_center),
    k_right: Number(r.k_right),
  }));
}
