import type { Pool } from "pg";

import {
  fetchClusterReports,
  fetchStoryClusterVersion,
  hideArticle,
  hideStory,
  insertClusterReport,
  insertSource,
  insertTopic,
  type ClusterReportInput,
  type ClusterReportRow,
  type NewSourceInput,
} from "./repo.js";

export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export class NotFoundError extends Error {}

const HIDDEN_REASONS = new Set(["takedown", "spam", "duplicate", "canonical_duplicate"]);
// Latin letters/marks (incl. accented), digits, space, and the punctuation the §10 examples
// use ("C++", "COVID-19"). \p{Script=Latin} covers the script restriction itself.
const KEYWORD_PATTERN = /^[\p{Script=Latin}\p{Mark}0-9][\p{Script=Latin}\p{Mark}0-9 +\-.&]*$/u;

export function validateNewSource(body: unknown): NewSourceInput {
  const b = (body ?? {}) as Record<string, unknown>;
  for (const field of ["name", "domain", "countryCode", "language", "feedTimezone"]) {
    if (typeof b[field] !== "string" || (b[field] as string).length === 0) {
      throw new ValidationError(`invalid_${field}`);
    }
  }
  return {
    name: b.name as string,
    domain: b.domain as string,
    countryCode: b.countryCode as string,
    coverageRegion: typeof b.coverageRegion === "string" ? b.coverageRegion : null,
    language: b.language as string,
    feedTimezone: b.feedTimezone as string,
    adapter: typeof b.adapter === "string" ? b.adapter : null,
    rssUrl: typeof b.rssUrl === "string" ? b.rssUrl : null,
    logoUrl: typeof b.logoUrl === "string" ? b.logoUrl : null,
  };
}

export async function onboardSource(pool: Pool, input: NewSourceInput): Promise<{ id: string }> {
  return insertSource(pool, input);
}

// §10 topic matching, "on write": casefold+NFC, trim, collapse whitespace, drop empty/dupes,
// 2-64 chars each, 1-20 keywords, Latin script only.
export function normalizeKeywords(raw: unknown): string[] {
  if (!Array.isArray(raw)) throw new ValidationError("invalid_keywords");
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") throw new ValidationError("invalid_keyword");
    const k = entry.normalize("NFC").toLowerCase().trim().replace(/\s+/g, " ");
    if (k.length === 0) continue; // drop empties
    if (k.length < 2 || k.length > 64) throw new ValidationError("invalid_keyword_length");
    if (!KEYWORD_PATTERN.test(k)) throw new ValidationError("invalid_keyword_script");
    if (seen.has(k)) continue; // drop duplicates
    seen.add(k);
    normalized.push(k);
  }
  if (normalized.length < 1 || normalized.length > 20) throw new ValidationError("invalid_keyword_count");
  return normalized;
}

export async function createTopic(pool: Pool, name: unknown, keywordsRaw: unknown, createdBy: unknown): Promise<{ id: string }> {
  if (typeof name !== "string" || name.length === 0) throw new ValidationError("invalid_name");
  if (typeof createdBy !== "string" || createdBy.length === 0) throw new ValidationError("invalid_created_by");
  const keywords = normalizeKeywords(keywordsRaw);
  return insertTopic(pool, name, keywords, createdBy);
}

export async function takedownArticle(pool: Pool, articleId: string, reason: unknown): Promise<void> {
  if (typeof reason !== "string" || !HIDDEN_REASONS.has(reason)) throw new ValidationError("invalid_reason");
  if (!(await hideArticle(pool, articleId, reason))) throw new NotFoundError();
}

export async function takedownStory(pool: Pool, storyId: string): Promise<void> {
  if (!(await hideStory(pool, storyId))) throw new NotFoundError();
}

export async function reportClusterError(
  pool: Pool,
  body: unknown
): Promise<{ id: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.kind !== "wrong_merge" && b.kind !== "should_merge") throw new ValidationError("invalid_kind");
  if (typeof b.storyId !== "string") throw new ValidationError("invalid_story_id");
  if (typeof b.reportedBy !== "string" || b.reportedBy.length === 0) throw new ValidationError("invalid_reported_by");
  if (b.kind === "wrong_merge" && typeof b.articleId !== "string") throw new ValidationError("wrong_merge_needs_article_id");
  if (b.kind === "should_merge" && typeof b.otherStoryId !== "string") {
    throw new ValidationError("should_merge_needs_other_story_id");
  }

  const clusterVersion = await fetchStoryClusterVersion(pool, b.storyId);
  if (clusterVersion === null) throw new NotFoundError();

  const input: ClusterReportInput = {
    kind: b.kind,
    storyId: b.storyId,
    articleId: typeof b.articleId === "string" ? b.articleId : null,
    otherStoryId: typeof b.otherStoryId === "string" ? b.otherStoryId : null,
    clusterVersion,
    reportedBy: b.reportedBy,
  };
  return insertClusterReport(pool, input);
}

export interface ClusterReportListItemResponse {
  id: string;
  kind: "wrong_merge" | "should_merge";
  storyId: string;
  storyTitle: string;
  articleId: string | null;
  articleTitle: string | null;
  otherStoryId: string | null;
  otherStoryTitle: string | null;
  clusterVersion: string;
  reportedBy: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ClusterReportListResponse {
  items: ClusterReportListItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

export interface RawClusterReportListQuery {
  resolved?: unknown;
  limit?: unknown;
  offset?: unknown;
}

const REPORT_DEFAULT_LIMIT = 50;
const REPORT_MAX_LIMIT = 100;

function toClusterReportItem(row: ClusterReportRow): ClusterReportListItemResponse {
  return {
    id: row.id,
    kind: row.kind,
    storyId: row.story_id,
    storyTitle: row.story_title,
    articleId: row.article_id,
    articleTitle: row.article_title,
    otherStoryId: row.other_story_id,
    otherStoryTitle: row.other_story_title,
    clusterVersion: row.cluster_version,
    reportedBy: row.reported_by,
    createdAt: row.created_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() ?? null,
  };
}

// Curator review queue — unblocks the frontend list screen (mvp-todo: "API gap, not a
// frontend one"). Resolving a report is out of scope here: `resolved_at` has no writer
// anywhere yet, so this stays read-only until that's asked for.
export async function listClusterReports(pool: Pool, query: RawClusterReportListQuery): Promise<ClusterReportListResponse> {
  let resolved: boolean | null = null;
  if (query.resolved === "true") resolved = true;
  else if (query.resolved === "false") resolved = false;
  else if (query.resolved !== undefined) throw new ValidationError("invalid_resolved");

  const limitRaw = typeof query.limit === "string" ? Number(query.limit) : REPORT_DEFAULT_LIMIT;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > REPORT_MAX_LIMIT) throw new ValidationError("invalid_limit");

  const offsetRaw = typeof query.offset === "string" ? Number(query.offset) : 0;
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0) throw new ValidationError("invalid_offset");

  const { items, total } = await fetchClusterReports(pool, { resolved, limit: limitRaw, offset: offsetRaw });
  return { items: items.map(toClusterReportItem), total, limit: limitRaw, offset: offsetRaw };
}
