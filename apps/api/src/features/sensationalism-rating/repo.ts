import type { Pool, PoolClient } from "pg";

export interface SensationalismRatingRow {
  id: string;
  source_id: string;
  level: "low" | "medium" | "high" | "insufficient_evidence";
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

const COLUMNS = `id, source_id, level, method, method_version,
       rated_by, second_rater, rubric_scores, evidence, review_due_at, source_ref, notes,
       rated_at, supersedes, superseded_at`;

export async function sourceExists(pool: Pool, sourceId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM sources WHERE id = $1", [sourceId]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function fetchCurrentRating(pool: Pool, sourceId: string): Promise<SensationalismRatingRow | null> {
  const result = await pool.query<SensationalismRatingRow>(
    `SELECT ${COLUMNS} FROM source_sensationalism_ratings WHERE source_id = $1 AND superseded_at IS NULL`,
    [sourceId]
  );
  return result.rows[0] ?? null;
}

export async function fetchRatingHistory(pool: Pool, sourceId: string): Promise<SensationalismRatingRow[]> {
  const result = await pool.query<SensationalismRatingRow>(
    `SELECT ${COLUMNS} FROM source_sensationalism_ratings WHERE source_id = $1 ORDER BY rated_at DESC`,
    [sourceId]
  );
  return result.rows;
}

export interface NewSensationalismRatingInput {
  level: "low" | "medium" | "high" | "insufficient_evidence";
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

// Same atomic-revision shape as rating/repo.ts reviseRating (ARCHITECTURE §10): the old row
// leaves the "current" set before the new row enters it, inside one transaction with the
// source row locked, so idx_source_sens_ratings_one_current never sees two current rows.
export async function reviseRating(
  client: PoolClient,
  sourceId: string,
  input: NewSensationalismRatingInput
): Promise<SensationalismRatingRow> {
  await client.query("SELECT 1 FROM sources WHERE id = $1 FOR UPDATE", [sourceId]);
  const old = await client.query<{ id: string }>(
    "UPDATE source_sensationalism_ratings SET superseded_at = now() WHERE source_id = $1 AND superseded_at IS NULL RETURNING id",
    [sourceId]
  );
  const oldId = old.rows[0]?.id ?? null;

  const inserted = await client.query<SensationalismRatingRow>(
    `INSERT INTO source_sensationalism_ratings (
       source_id, level, method, method_version,
       rated_by, second_rater, rubric_scores, evidence, review_due_at, source_ref, notes, supersedes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING ${COLUMNS}`,
    [
      sourceId,
      input.level,
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
