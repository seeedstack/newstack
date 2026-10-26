import type { Pool, PoolClient } from "pg";

export const TOPIC_CODES = [
  "IN_PAK",
  "IN_CHN",
  "IN_US",
  "IN_RUS",
  "IN_NEIGH",
  "DEFSEC",
  "MULTILAT",
  "INDOPAC",
] as const;
export type TopicCode = (typeof TOPIC_CODES)[number];

export interface GeoRatingRow {
  id: string;
  source_id: string;
  topic_code: TopicCode;
  stance: "strongly_minus" | "leans_minus" | "mixed_or_issue_dependent" | "leans_plus" | "strongly_plus" | "insufficient_evidence";
  method: string;
  method_version: string | null;
  rated_by: string;
  second_rater: string | null;
  rubric_scores: unknown;
  evidence: unknown;
  review_due_at: Date | null;
  source_ref: string | null;
  notes: string | null;
  rated_at: Date;
  supersedes: string | null;
  superseded_at: Date | null;
}

const COLUMNS = `id, source_id, topic_code, stance, method, method_version,
       rated_by, second_rater, rubric_scores, evidence, review_due_at, source_ref, notes,
       rated_at, supersedes, superseded_at`;

export async function sourceExists(pool: Pool, sourceId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM sources WHERE id = $1", [sourceId]);
  return result.rowCount !== null && result.rowCount > 0;
}

// All 8 topics' current rating for a source in one query — the GET endpoint returns the full
// per-topic picture at once rather than forcing 8 round trips (PRODUCT §5.6).
export async function fetchCurrentRatings(pool: Pool, sourceId: string): Promise<GeoRatingRow[]> {
  const result = await pool.query<GeoRatingRow>(
    `SELECT ${COLUMNS} FROM source_geo_ratings WHERE source_id = $1 AND superseded_at IS NULL`,
    [sourceId]
  );
  return result.rows;
}

export async function fetchAllHistory(pool: Pool, sourceId: string): Promise<GeoRatingRow[]> {
  const result = await pool.query<GeoRatingRow>(
    `SELECT ${COLUMNS} FROM source_geo_ratings WHERE source_id = $1 ORDER BY topic_code, rated_at DESC`,
    [sourceId]
  );
  return result.rows;
}

export interface NewGeoRatingInput {
  stance: GeoRatingRow["stance"];
  method: string;
  methodVersion: string | null;
  ratedBy: string;
  secondRater: string | null;
  rubricScores: unknown;
  evidence: unknown;
  reviewDueAt: Date | null;
  sourceRef: string | null;
  notes: string | null;
}

// Same atomic-revision shape as rating/repo.ts and sensationalism-rating/repo.ts, but the
// "current" row is superseded per (source_id, topic_code) rather than per source_id alone, since
// idx_source_geo_ratings_one_current is keyed on that pair.
export async function reviseRating(
  client: PoolClient,
  sourceId: string,
  topicCode: TopicCode,
  input: NewGeoRatingInput
): Promise<GeoRatingRow> {
  await client.query("SELECT 1 FROM sources WHERE id = $1 FOR UPDATE", [sourceId]);
  const old = await client.query<{ id: string }>(
    `UPDATE source_geo_ratings SET superseded_at = now()
     WHERE source_id = $1 AND topic_code = $2 AND superseded_at IS NULL RETURNING id`,
    [sourceId, topicCode]
  );
  const oldId = old.rows[0]?.id ?? null;

  const inserted = await client.query<GeoRatingRow>(
    `INSERT INTO source_geo_ratings (
       source_id, topic_code, stance, method, method_version,
       rated_by, second_rater, rubric_scores, evidence, review_due_at, source_ref, notes, supersedes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${COLUMNS}`,
    [
      sourceId,
      topicCode,
      input.stance,
      input.method,
      input.methodVersion,
      input.ratedBy,
      input.secondRater,
      input.rubricScores === undefined ? null : JSON.stringify(input.rubricScores),
      input.evidence === undefined ? null : JSON.stringify(input.evidence),
      input.reviewDueAt,
      input.sourceRef,
      input.notes,
      oldId,
    ]
  );
  return inserted.rows[0];
}
