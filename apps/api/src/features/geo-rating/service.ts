import type { Pool } from "pg";

import { withTransaction } from "../../db.js";
import {
  fetchAllHistory,
  fetchCurrentRatings,
  reviseRating,
  sourceExists,
  TOPIC_CODES,
  type GeoRatingRow,
  type NewGeoRatingInput,
  type TopicCode,
} from "./repo.js";

export class SourceNotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const TOPIC_CODE_SET = new Set<string>(TOPIC_CODES);
const STANCE_VALUES = new Set([
  "strongly_minus",
  "leans_minus",
  "mixed_or_issue_dependent",
  "leans_plus",
  "strongly_plus",
  "insufficient_evidence",
]);

export interface GeoRatingResponse {
  id: string;
  sourceId: string;
  topicCode: TopicCode;
  stance: string;
  method: string;
  ratedBy: string;
  ratedAt: string;
  supersedes: string | null;
  supersededAt: string | null;
}

function toResponse(row: GeoRatingRow): GeoRatingResponse {
  return {
    id: row.id,
    sourceId: row.source_id,
    topicCode: row.topic_code,
    stance: row.stance,
    method: row.method,
    ratedBy: row.rated_by,
    ratedAt: row.rated_at.toISOString(),
    supersedes: row.supersedes,
    supersededAt: row.superseded_at?.toISOString() ?? null,
  };
}

export function isTopicCode(value: string): value is TopicCode {
  return TOPIC_CODE_SET.has(value);
}

// One row per topic, present for all 8 codes even when a topic has never been rated (PRODUCT
// §5.6: absence of a row = never assessed, distinct from an explicit insufficient_evidence row).
export async function getSourceGeoRatings(
  pool: Pool,
  sourceId: string
): Promise<Record<TopicCode, { current: GeoRatingResponse | null; history: GeoRatingResponse[] }>> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const [currentRows, historyRows] = await Promise.all([
    fetchCurrentRatings(pool, sourceId),
    fetchAllHistory(pool, sourceId),
  ]);

  const result = {} as Record<TopicCode, { current: GeoRatingResponse | null; history: GeoRatingResponse[] }>;
  for (const topicCode of TOPIC_CODES) {
    result[topicCode] = { current: null, history: [] };
  }
  for (const row of currentRows) {
    result[row.topic_code].current = toResponse(row);
  }
  for (const row of historyRows) {
    result[row.topic_code].history.push(toResponse(row));
  }
  return result;
}

// §4 schema CHECKs (0004_source_assessment_tables.sql), validated here first so a bad
// submission gets a clean 400 instead of a raw Postgres constraint error.
export function validateNewRating(topicCode: string, body: unknown): NewGeoRatingInput {
  if (!isTopicCode(topicCode)) throw new ValidationError("invalid_topic_code");

  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.stance !== "string" || !STANCE_VALUES.has(b.stance)) {
    throw new ValidationError("invalid_stance");
  }
  if (typeof b.method !== "string" || b.method.length === 0) throw new ValidationError("invalid_method");
  if (typeof b.ratedBy !== "string" || b.ratedBy.length === 0) throw new ValidationError("invalid_rated_by");

  const secondRater = typeof b.secondRater === "string" ? b.secondRater : null;
  const evidence = Array.isArray(b.evidence) ? b.evidence : undefined;
  const rubricScores = typeof b.rubricScores === "object" && b.rubricScores !== null ? b.rubricScores : undefined;

  // geo_manual_needs_two_raters_and_evidence (§4): enforced here too, so curator tooling gets a
  // readable 400 instead of the DB's raw constraint-violation error.
  if (b.method === "manual-curation") {
    if (secondRater === null || secondRater === b.ratedBy) throw new ValidationError("manual_needs_second_rater");
    if (rubricScores === undefined) throw new ValidationError("manual_needs_rubric_scores");
    if (evidence === undefined || evidence.length < 3) throw new ValidationError("manual_needs_evidence");
  }

  return {
    stance: b.stance as NewGeoRatingInput["stance"],
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
  topicCode: TopicCode,
  input: NewGeoRatingInput
): Promise<GeoRatingResponse> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const row = await withTransaction(pool, (client) => reviseRating(client, sourceId, topicCode, input));
  return toResponse(row);
}
