import type { Pool } from "pg";

import { fetchRatedCounts } from "../feed/repo.js";
import { fetchSplitNotices, fetchStory, fetchStoryArticles, type BiasCategory, type StoryArticleRow } from "./repo.js";

export class StoryNotFoundError extends Error {}

export interface SourceCard {
  sourceId: string;
  sourceName: string;
  primaryArticle: { id: string; title: string; url: string; publishedAt: string | null };
  moreCount: number;
}

export interface BiasColumns {
  left: SourceCard[];
  centerLeft: SourceCard[];
  center: SourceCard[];
  centerRight: SourceCard[];
  right: SourceCard[];
  notRated: SourceCard[];
}

export interface StoryDetailResponse {
  id: string;
  title: string;
  summary: string | null;
  status: "building" | "active" | "tombstoned";
  redirectTo: { id: string; title: string } | null;
  splitNotices: { storyId: string; title: string; articleCount: number }[];
  ratedSourceCount: number;
  unratedSourceCount: number;
  biasColumns: BiasColumns;
}

const CATEGORY_KEY: Record<BiasCategory, keyof BiasColumns> = {
  left: "left",
  "center-left": "centerLeft",
  center: "center",
  "center-right": "centerRight",
  right: "right",
  not_rated: "notRated",
};

// One card per source: dedupe that source's articles by content_hash (§10 "same content_hash
// shown once"), keep the most recent as the primary card, collapse the rest into moreCount.
function buildSourceCards(articles: StoryArticleRow[]): SourceCard[] {
  const bySource = new Map<string, StoryArticleRow[]>();
  for (const article of articles) {
    const list = bySource.get(article.source_id) ?? [];
    list.push(article);
    bySource.set(article.source_id, list);
  }

  const cards: SourceCard[] = [];
  for (const [sourceId, sourceArticles] of bySource) {
    const seenHashes = new Set<string>();
    const deduped = sourceArticles.filter((a) => {
      if (seenHashes.has(a.content_hash)) return false;
      seenHashes.add(a.content_hash);
      return true;
    });
    const [primary, ...rest] = deduped; // already ordered effective_at DESC by the query
    cards.push({
      sourceId,
      sourceName: primary.source_name,
      primaryArticle: {
        id: primary.id,
        title: primary.title,
        url: primary.url,
        publishedAt: primary.published_at?.toISOString() ?? null,
      },
      moreCount: rest.length,
    });
  }
  return cards;
}

export async function getStoryDetail(pool: Pool, storyId: string): Promise<StoryDetailResponse> {
  const story = await fetchStory(pool, storyId);
  if (story === null) throw new StoryNotFoundError();

  const splitRows = await fetchSplitNotices(pool, storyId, story.merged_into);
  const splitNotices = splitRows.map((r) => ({
    storyId: r.new_story_id,
    title: r.new_story_title,
    articleCount: r.article_count,
  }));

  const emptyColumns = (): BiasColumns => ({
    left: [],
    centerLeft: [],
    center: [],
    centerRight: [],
    right: [],
    notRated: [],
  });

  // A tombstoned story's visible coverage has moved to its successor — nothing to show here
  // but the redirect itself (§6).
  if (story.status === "tombstoned") {
    return {
      id: story.id,
      title: story.title,
      summary: story.summary,
      status: story.status,
      redirectTo: story.merged_into === null ? null : { id: story.merged_into, title: story.merged_into_title as string },
      splitNotices,
      ratedSourceCount: 0,
      unratedSourceCount: 0,
      biasColumns: emptyColumns(),
    };
  }

  const [articles, [ratedCounts]] = await Promise.all([
    fetchStoryArticles(pool, storyId),
    fetchRatedCounts(pool, [storyId]),
  ]);

  const byCategory = new Map<BiasCategory, StoryArticleRow[]>();
  for (const article of articles) {
    const list = byCategory.get(article.category) ?? [];
    list.push(article);
    byCategory.set(article.category, list);
  }

  const biasColumns = emptyColumns();
  for (const [category, categoryArticles] of byCategory) {
    biasColumns[CATEGORY_KEY[category]] = buildSourceCards(categoryArticles);
  }

  return {
    id: story.id,
    title: story.title,
    summary: story.summary,
    status: story.status,
    redirectTo: null,
    splitNotices,
    ratedSourceCount: ratedCounts?.rated_source_count ?? 0,
    unratedSourceCount: ratedCounts?.unrated_source_count ?? 0,
    biasColumns,
  };
}
