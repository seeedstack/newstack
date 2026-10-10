import type { Pool } from "pg";

import type { StoryRow } from "../feed/repo.js";

export interface TopicRow {
  id: string;
  name: string;
  keywords: string[];
}

export async function fetchTopic(pool: Pool, topicId: string): Promise<TopicRow | null> {
  const result = await pool.query<TopicRow>("SELECT id, name, keywords FROM topics WHERE id = $1", [topicId]);
  return result.rows[0] ?? null;
}

export async function listTopics(pool: Pool): Promise<TopicRow[]> {
  const result = await pool.query<TopicRow>("SELECT id, name, keywords FROM topics ORDER BY name");
  return result.rows;
}

// §10 topic matching (pinned): OR across keywords via topic_pattern(), case-insensitive,
// whole word/phrase, against the headline/summary or any visible member article title, over
// stories with coverage in the last 14 days. The `as_of` ceiling isn't in the doc's own
// snippet but matches every other feed's cursor convention (freezes the scroll).
export async function fetchTopicFeedPage(
  pool: Pool,
  args: { topicId: string; asOf: Date; cursorCoverageAt: Date | null; cursorId: string | null; limit: number }
): Promise<StoryRow[]> {
  const result = await pool.query<StoryRow>(
    `WITH p AS (
       SELECT array_agg(topic_pattern(k)) AS patterns
       FROM topics t, unnest(t.keywords) AS k
       WHERE t.id = $1
     )
     SELECT s.id, s.title, s.summary, s.last_coverage_at
     FROM stories s, p
     WHERE s.status = 'active' AND s.hidden_at IS NULL
       AND s.last_coverage_at <= $2
       AND s.last_coverage_at >= now() - interval '14 days'
       AND ($3::timestamptz IS NULL OR (s.last_coverage_at, s.id) < ($3, $4))
       AND ( (s.title || ' ' || coalesce(s.summary, '')) ~* ANY(p.patterns)
          OR EXISTS (SELECT 1 FROM articles a
                     WHERE a.story_id = s.id AND a.hidden_at IS NULL AND a.title ~* ANY(p.patterns)) )
     ORDER BY s.last_coverage_at DESC, s.id DESC
     LIMIT $5`,
    [args.topicId, args.asOf, args.cursorCoverageAt, args.cursorId, args.limit]
  );
  return result.rows;
}

export async function countTopicUpdatedSince(pool: Pool, topicId: string, asOf: Date): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `WITH p AS (
       SELECT array_agg(topic_pattern(k)) AS patterns
       FROM topics t, unnest(t.keywords) AS k
       WHERE t.id = $1
     )
     SELECT count(*) FROM stories s, p
     WHERE s.status = 'active' AND s.hidden_at IS NULL AND s.last_coverage_at > $2
       AND ( (s.title || ' ' || coalesce(s.summary, '')) ~* ANY(p.patterns)
          OR EXISTS (SELECT 1 FROM articles a
                     WHERE a.story_id = s.id AND a.hidden_at IS NULL AND a.title ~* ANY(p.patterns)) )`,
    [topicId, asOf]
  );
  return Number(result.rows[0].count);
}
