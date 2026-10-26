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
  // Reader subscription gate (PAYPAL_SPEC.md): this aggregator links out to publishers rather
  // than hosting full article bodies, so there's no article text to paywall — the premium
  // feature gated instead is the full cross-source bias breakdown. `GET /api/public/stories/:id`
  // (shared cache, no user identity per ARCHITECTURE §10) always returns this capped; the
  // entitled-only full list is `GET /api/stories/:id/full-breakdown` (authenticated, uncached).
  premiumBreakdown: { locked: boolean; hiddenCardCount: number };
}

// Free-tier cap per bias column (PAYPAL_SPEC §4.2 FR-P3 teaser analog). Tunable post-launch,
// same complexity-budget footing as FREE_PREMIUM_READS_PER_MONTH.
export const FREE_SOURCE_CARDS_PER_CATEGORY = 2;

export function applyFreeTierCap(detail: StoryDetailResponse): StoryDetailResponse {
  let hiddenCardCount = 0;
  const capped: BiasColumns = { left: [], centerLeft: [], center: [], centerRight: [], right: [], notRated: [] };
  for (const key of Object.keys(detail.biasColumns) as (keyof BiasColumns)[]) {
    const cards = detail.biasColumns[key];
    capped[key] = cards.slice(0, FREE_SOURCE_CARDS_PER_CATEGORY);
    hiddenCardCount += Math.max(0, cards.length - FREE_SOURCE_CARDS_PER_CATEGORY);
  }
  return { ...detail, biasColumns: capped, premiumBreakdown: { locked: hiddenCardCount > 0, hiddenCardCount } };
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
      premiumBreakdown: { locked: false, hiddenCardCount: 0 },
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
    premiumBreakdown: { locked: false, hiddenCardCount: 0 }, // set by applyFreeTierCap for the public route
  };
}
