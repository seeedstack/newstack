import type { Pool, PoolClient } from "pg";

export interface NewSourceInput {
  name: string;
  domain: string;
  countryCode: string;
  coverageRegion: string | null;
  language: string;
  feedTimezone: string;
  adapter: string | null;
  rssUrl: string | null;
  logoUrl: string | null;
}

export async function insertSource(pool: Pool, input: NewSourceInput): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO sources (name, domain, country_code, coverage_region, language, feed_timezone, adapter, rss_url, logo_url)
     VALUES ($1, $2, $3, $4, $5, $6, coalesce($7, 'generic'), $8, $9)
     RETURNING id`,
    [
      input.name,
      input.domain,
      input.countryCode,
      input.coverageRegion,
      input.language,
      input.feedTimezone,
      input.adapter,
      input.rssUrl,
      input.logoUrl,
    ]
  );
  return result.rows[0];
}

export async function insertTopic(pool: Pool, name: string, keywords: string[], createdBy: string): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    "INSERT INTO topics (name, keywords, created_by) VALUES ($1, $2, $3) RETURNING id",
    [name, keywords, createdBy]
  );
  return result.rows[0];
}

export async function hideArticle(pool: Pool, articleId: string, reason: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE articles SET hidden_at = now(), hidden_reason = $2 WHERE id = $1 AND hidden_at IS NULL",
    [articleId, reason]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export async function hideStory(pool: Pool, storyId: string): Promise<boolean> {
  const result = await pool.query(
    "UPDATE stories SET hidden_at = now() WHERE id = $1 AND status = 'active' AND hidden_at IS NULL",
    [storyId]
  );
  return result.rowCount !== null && result.rowCount > 0;
}

export interface ClusterReportInput {
  kind: "wrong_merge" | "should_merge";
  storyId: string;
  articleId: string | null;
  otherStoryId: string | null;
  clusterVersion: string;
  reportedBy: string;
}

export async function insertClusterReport(pool: Pool, input: ClusterReportInput): Promise<{ id: string }> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO cluster_reports (kind, story_id, article_id, other_story_id, cluster_version, reported_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.kind, input.storyId, input.articleId, input.otherStoryId, input.clusterVersion, input.reportedBy]
  );
  return result.rows[0];
}

export async function fetchStoryClusterVersion(pool: Pool | PoolClient, storyId: string): Promise<string | null> {
  const result = await pool.query<{ cluster_version: string }>("SELECT cluster_version FROM stories WHERE id = $1", [
    storyId,
  ]);
  return result.rows[0]?.cluster_version ?? null;
}

export interface ClusterReportRow {
  id: string;
  kind: "wrong_merge" | "should_merge";
  story_id: string;
  story_title: string;
  article_id: string | null;
  article_title: string | null;
  other_story_id: string | null;
  other_story_title: string | null;
  cluster_version: string;
  reported_by: string;
  created_at: Date;
  resolved_at: Date | null;
}

export interface ClusterReportListFilters {
  resolved: boolean | null; // null = both
  limit: number;
  offset: number;
}

// Curator-internal review queue (§7's live error signal) — plain offset pagination like the
// source registry: curator-filed reports are a low-volume, curator-facing list, not an
// unbounded public feed.
export async function fetchClusterReports(
  pool: Pool,
  filters: ClusterReportListFilters
): Promise<{ items: ClusterReportRow[]; total: number }> {
  const where = filters.resolved === null ? [] : [filters.resolved ? "cr.resolved_at IS NOT NULL" : "cr.resolved_at IS NULL"];
  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const countResult = await pool.query<{ total: string }>(`SELECT count(*) AS total FROM cluster_reports cr ${whereClause}`);

  const itemsResult = await pool.query<ClusterReportRow>(
    `SELECT cr.id, cr.kind, cr.story_id, s.title AS story_title, cr.article_id, a.title AS article_title,
            cr.other_story_id, os.title AS other_story_title, cr.cluster_version, cr.reported_by,
            cr.created_at, cr.resolved_at
     FROM cluster_reports cr
     JOIN stories s ON s.id = cr.story_id
     LEFT JOIN articles a ON a.id = cr.article_id
     LEFT JOIN stories os ON os.id = cr.other_story_id
     ${whereClause}
     ORDER BY cr.created_at DESC
     LIMIT $1 OFFSET $2`,
    [filters.limit, filters.offset]
  );

  return { items: itemsResult.rows, total: Number(countResult.rows[0].total) };
}
