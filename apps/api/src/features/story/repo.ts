import type { Pool } from "pg";

export interface StoryDetailRow {
  id: string;
  title: string;
  summary: string | null;
  status: "building" | "active" | "tombstoned";
  merged_into: string | null;
  merged_into_title: string | null;
  last_coverage_at: Date;
}

export async function fetchStory(pool: Pool, storyId: string): Promise<StoryDetailRow | null> {
  const result = await pool.query<StoryDetailRow>(
    `SELECT s.id, s.title, s.summary, s.status, s.merged_into, m.title AS merged_into_title, s.last_coverage_at
     FROM stories s
     LEFT JOIN stories m ON m.id = s.merged_into
     WHERE s.id = $1`,
    [storyId]
  );
  return result.rows[0] ?? null;
}

export interface SplitNoticeRow {
  new_story_id: string;
  new_story_title: string;
  article_count: number;
}

// §6: story_lineage records every (old, new) split; merged_into (fetchStory above) is the
// primary successor for a tombstoned story, so it's excluded here to avoid showing it twice.
export async function fetchSplitNotices(pool: Pool, storyId: string, mergedInto: string | null): Promise<SplitNoticeRow[]> {
  const result = await pool.query<{ new_story_id: string; new_story_title: string; article_count: string }>(
    `SELECT l.new_story_id, s.title AS new_story_title, l.article_count
     FROM story_lineage l
     JOIN stories s ON s.id = l.new_story_id
     WHERE l.old_story_id = $1 AND l.new_story_id IS DISTINCT FROM $2
     ORDER BY l.article_count DESC`,
    [storyId, mergedInto]
  );
  return result.rows.map((r) => ({ ...r, article_count: Number(r.article_count) }));
}

export type BiasCategory = "left" | "center-left" | "center" | "center-right" | "right" | "not_rated";

export interface StoryArticleRow {
  id: string;
  title: string;
  url: string;
  published_at: Date | null;
  effective_at: Date;
  content_hash: string;
  source_id: string;
  source_name: string;
  category: BiasCategory;
}

// PRODUCT §3.3's category rule, same as the feed's bias bar — per-article here (not
// aggregated) so the caller can group by source and dedupe by content_hash.
export async function fetchStoryArticles(pool: Pool, storyId: string): Promise<StoryArticleRow[]> {
  const result = await pool.query<StoryArticleRow>(
    `SELECT a.id, a.title, a.url, a.published_at, a.effective_at, a.content_hash,
            a.source_id, s.name AS source_name,
            coalesce(r.bias_rating, 'not_rated') AS category
     FROM articles a
     JOIN sources s ON s.id = a.source_id
     LEFT JOIN source_ratings r
            ON r.source_id = a.source_id AND r.superseded_at IS NULL AND r.spectrum = 'IN'
     WHERE a.story_id = $1 AND a.hidden_at IS NULL
     ORDER BY a.source_id, a.effective_at DESC`,
    [storyId]
  );
  return result.rows;
}
