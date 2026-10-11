import type { Pool } from "pg";

import { withTransaction } from "../../db.js";
import {
  fetchCurrentRating,
  fetchRatingHistory,
  reviseRating,
  sourceExists,
  type NewRatingInput,
  type RatingRow,
} from "./repo.js";

export class SourceNotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const BIAS_RATINGS = new Set(["left", "center-left", "center", "center-right", "right"]);
const FACTUALITY_VALUES = new Set(["high", "mixed", "low"]);
const CONFIDENCE_VALUES = new Set(["high", "medium", "low"]);

export interface RatingResponse {
  id: string;
  sourceId: string;
  spectrum: string | null;
  biasRating: string | null;
  factuality: string;
  confidence: string | null;
  method: string;
  ratedBy: string;
  ratedAt: string;
  supersedes: string | null;
  supersededAt: string | null;
}

function toResponse(row: RatingRow): RatingResponse {
  return {
    id: row.id,
    sourceId: row.source_id,
    spectrum: row.spectrum,
    biasRating: row.bias_rating,
    factuality: row.factuality,
    confidence: row.confidence,
    method: row.method,
    ratedBy: row.rated_by,
    ratedAt: row.rated_at.toISOString(),
    supersedes: row.supersedes,
    supersededAt: row.superseded_at?.toISOString() ?? null,
  };
}

export async function getSourceRatings(
  pool: Pool,
  sourceId: string
): Promise<{ current: RatingResponse | null; history: RatingResponse[] }> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const [current, history] = await Promise.all([
    fetchCurrentRating(pool, sourceId),
    fetchRatingHistory(pool, sourceId),
  ]);
  return {
    current: current === null ? null : toResponse(current),
    history: history.map(toResponse),
  };
}

// §4 schema CHECKs, validated here first so a bad submission gets a clean 400 instead of a
// raw Postgres constraint error.
export function validateNewRating(body: unknown): NewRatingInput {
  const b = (body ?? {}) as Record<string, unknown>;

  const spectrum = b.spectrum === undefined ? null : b.spectrum;
  const biasRating = b.biasRating === undefined ? null : b.biasRating;
  if (spectrum !== null && spectrum !== "IN") throw new ValidationError("invalid_spectrum");
  if (biasRating !== null && !BIAS_RATINGS.has(biasRating as string)) throw new ValidationError("invalid_bias_rating");
  if ((biasRating === null) !== (spectrum === null)) throw new ValidationError("bias_needs_spectrum");

  if (typeof b.factuality !== "string" || !FACTUALITY_VALUES.has(b.factuality)) {
    throw new ValidationError("invalid_factuality");
  }
  const confidence = b.confidence === undefined ? null : b.confidence;
  if (confidence !== null && !CONFIDENCE_VALUES.has(confidence as string)) {
    throw new ValidationError("invalid_confidence");
  }

  if (typeof b.method !== "string" || b.method.length === 0) throw new ValidationError("invalid_method");
  if (typeof b.ratedBy !== "string" || b.ratedBy.length === 0) throw new ValidationError("invalid_rated_by");

  const secondRater = typeof b.secondRater === "string" ? b.secondRater : null;
  const evidence = Array.isArray(b.evidence) ? b.evidence : undefined;
  const rubricScores = typeof b.rubricScores === "object" && b.rubricScores !== null ? b.rubricScores : undefined;

  // manual_needs_two_raters_and_evidence (§4): enforced here too, so curator tooling gets a
  // readable 400 instead of the DB's raw constraint-violation error.
  if (b.method === "manual-curation") {
    if (secondRater === null || secondRater === b.ratedBy) throw new ValidationError("manual_needs_second_rater");
    if (rubricScores === undefined) throw new ValidationError("manual_needs_rubric_scores");
    if (evidence === undefined || evidence.length < 3) throw new ValidationError("manual_needs_evidence");
  }

  return {
    spectrum: spectrum as string | null,
    biasRating: biasRating as string | null,
    factuality: b.factuality as "high" | "mixed" | "low",
    confidence: confidence as "high" | "medium" | "low" | null,
    method: b.method,
    methodVersion: typeof b.methodVersion === "string" ? b.methodVersion : null,
    ratedBy: b.ratedBy,
    secondRater,
    rubricScores,
    evidence,
    reviewDueAt: typeof b.reviewDueAt === "string" ? new Date(b.reviewDueAt) : null,
    sourceRef: typeof b.sourceRef === "string" ? b.sourceRef : null,
    notes: typeof b.notes === "string" ? b.notes : null,
  };
}

export async function submitRating(pool: Pool, sourceId: string, input: NewRatingInput): Promise<RatingResponse> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const row = await withTransaction(pool, (client) => reviseRating(client, sourceId, input));
  return toResponse(row);
}
