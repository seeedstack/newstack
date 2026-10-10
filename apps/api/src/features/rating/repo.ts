import type { Pool, PoolClient } from "pg";

export interface RatingRow {
  id: string;
  source_id: string;
  spectrum: string | null;
  bias_rating: string | null;
  factuality: "high" | "mixed" | "low";
  confidence: "high" | "medium" | "low" | null;
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

const RATING_COLUMNS = `id, source_id, spectrum, bias_rating, factuality, confidence, method, method_version,
       rated_by, second_rater, rubric_scores, evidence, review_due_at, source_ref, notes,
       rated_at, supersedes, superseded_at`;

export async function sourceExists(pool: Pool, sourceId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM sources WHERE id = $1", [sourceId]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function fetchCurrentRating(pool: Pool, sourceId: string): Promise<RatingRow | null> {
  const result = await pool.query<RatingRow>(
    `SELECT ${RATING_COLUMNS} FROM source_ratings WHERE source_id = $1 AND superseded_at IS NULL`,
    [sourceId]
  );
  return result.rows[0] ?? null;
}

export async function fetchRatingHistory(pool: Pool, sourceId: string): Promise<RatingRow[]> {
  const result = await pool.query<RatingRow>(
    `SELECT ${RATING_COLUMNS} FROM source_ratings WHERE source_id = $1 ORDER BY rated_at DESC`,
    [sourceId]
  );
  return result.rows;
}

export interface NewRatingInput {
  spectrum: string | null;
  biasRating: string | null;
  factuality: "high" | "mixed" | "low";
  confidence: "high" | "medium" | "low" | null;
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

// §10 rating revision (atomic): the old row leaves the "current" set before the new row
// enters it, inside one transaction with the source row locked, so the partial unique index
// (idx_source_ratings_one_current) never sees two current rows for the same source.
export async function reviseRating(client: PoolClient, sourceId: string, input: NewRatingInput): Promise<RatingRow> {
  await client.query("SELECT 1 FROM sources WHERE id = $1 FOR UPDATE", [sourceId]);
  const old = await client.query<{ id: string }>(
    "UPDATE source_ratings SET superseded_at = now() WHERE source_id = $1 AND superseded_at IS NULL RETURNING id",
    [sourceId]
  );
  const oldId = old.rows[0]?.id ?? null;

  const inserted = await client.query<RatingRow>(
    `INSERT INTO source_ratings (
       source_id, spectrum, bias_rating, factuality, confidence, method, method_version,
       rated_by, second_rater, rubric_scores, evidence, review_due_at, source_ref, notes, supersedes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING ${RATING_COLUMNS}`,
    [
      sourceId,
      input.spectrum,
      input.biasRating,
      input.factuality,
      input.confidence,
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
