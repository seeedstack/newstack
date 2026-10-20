import type { Pool } from "pg";

import { withTransaction } from "../../db.js";
import {
  fetchCurrentRating,
  fetchRatingHistory,
  reviseRating,
  sourceExists,
  type NewSensationalismRatingInput,
  type SensationalismRatingRow,
} from "./repo.js";

export class SourceNotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const LEVEL_VALUES = new Set(["low", "medium", "high", "insufficient_evidence"]);

export interface SensationalismRatingResponse {
  id: string;
  sourceId: string;
  level: string;
  method: string;
  ratedBy: string;
  ratedAt: string;
  supersedes: string | null;
  supersededAt: string | null;
}

function toResponse(row: SensationalismRatingRow): SensationalismRatingResponse {
  return {
    id: row.id,
    sourceId: row.source_id,
    level: row.level,
    method: row.method,
    ratedBy: row.rated_by,
    ratedAt: row.rated_at.toISOString(),
    supersedes: row.supersedes,
    supersededAt: row.superseded_at?.toISOString() ?? null,
  };
}

export async function getSourceSensationalismRatings(
  pool: Pool,
  sourceId: string
): Promise<{ current: SensationalismRatingResponse | null; history: SensationalismRatingResponse[] }> {
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

// §4 schema CHECKs (0004_source_assessment_tables.sql), validated here first so a bad
// submission gets a clean 400 instead of a raw Postgres constraint error — mirrors
// rating/service.ts validateNewRating.
export function validateNewRating(body: unknown): NewSensationalismRatingInput {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.level !== "string" || !LEVEL_VALUES.has(b.level)) {
    throw new ValidationError("invalid_level");
  }
  if (typeof b.method !== "string" || b.method.length === 0) throw new ValidationError("invalid_method");
  if (typeof b.ratedBy !== "string" || b.ratedBy.length === 0) throw new ValidationError("invalid_rated_by");

  const secondRater = typeof b.secondRater === "string" ? b.secondRater : null;
  const evidence = Array.isArray(b.evidence) ? b.evidence : undefined;
  const rubricScores = typeof b.rubricScores === "object" && b.rubricScores !== null ? b.rubricScores : undefined;

  // sens_manual_needs_two_raters_and_evidence (§4): enforced here too, so curator tooling
  // gets a readable 400 instead of the DB's raw constraint-violation error.
  if (b.method === "manual-curation") {
    if (secondRater === null || secondRater === b.ratedBy) throw new ValidationError("manual_needs_second_rater");
    if (rubricScores === undefined) throw new ValidationError("manual_needs_rubric_scores");
    if (evidence === undefined || evidence.length < 3) throw new ValidationError("manual_needs_evidence");
  }

  return {
    level: b.level as "low" | "medium" | "high" | "insufficient_evidence",
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

export async function submitRating(
  pool: Pool,
  sourceId: string,
  input: NewSensationalismRatingInput
): Promise<SensationalismRatingResponse> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const row = await withTransaction(pool, (client) => reviseRating(client, sourceId, input));
  return toResponse(row);
}
