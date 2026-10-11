import type { Pool } from "pg";

import { buildPage, decodeCursor, type Page } from "../../pagination.js";
import { type BiasBarRow, countUpdatedSince, fetchBiasBar, fetchFeedPage, fetchRatedCounts, type StoryRow } from "./repo.js";

const PAGE_SIZE = 20;
const FEED_NAME = "home";

export interface BiasBarSegment {
  count: number;
  lowConfidenceCount: number;
}

export interface BiasBar {
  left: BiasBarSegment;
  centerLeft: BiasBarSegment;
  center: BiasBarSegment;
  centerRight: BiasBarSegment;
  right: BiasBarSegment;
  notRated: BiasBarSegment;
}

export interface FeedItem {
  id: string;
  title: string;
  summary: string | null;
  lastCoverageAt: string;
  ratedSourceCount: number;
  unratedSourceCount: number;
  biasBar: BiasBar;
}

export interface FeedResponse {
  items: FeedItem[];
  asOf: string;
  nextCursor: string | null;
  updatedCount: number;
}

const EMPTY_SEGMENT: BiasBarSegment = { count: 0, lowConfidenceCount: 0 };
const CATEGORY_KEY: Record<BiasBarRow["category"], keyof BiasBar> = {
  left: "left",
  "center-left": "centerLeft",
  center: "center",
  "center-right": "centerRight",
  right: "right",
  not_rated: "notRated",
};

function emptyBiasBar(): BiasBar {
  return {
    left: { ...EMPTY_SEGMENT },
    centerLeft: { ...EMPTY_SEGMENT },
    center: { ...EMPTY_SEGMENT },
    centerRight: { ...EMPTY_SEGMENT },
    right: { ...EMPTY_SEGMENT },
    notRated: { ...EMPTY_SEGMENT },
  };
}

// Shared by any feed whose rows are {id, title, summary, last_coverage_at} stories — the
// home feed and the topic feed both attach the identical bias-bar/rated-count shape.
export async function buildFeedItems(pool: Pool, storyRows: StoryRow[]): Promise<FeedItem[]> {
  const storyIds = storyRows.map((s) => s.id);
  const [biasRows, ratedRows] = await Promise.all([fetchBiasBar(pool, storyIds), fetchRatedCounts(pool, storyIds)]);

  const biasByStory = new Map<string, BiasBar>();
  for (const row of biasRows) {
    const bar = biasByStory.get(row.story_id) ?? emptyBiasBar();
    bar[CATEGORY_KEY[row.category]] = { count: row.total, lowConfidenceCount: row.low_confidence };
    biasByStory.set(row.story_id, bar);
  }
  const ratedByStory = new Map(ratedRows.map((r) => [r.story_id, r]));

  return storyRows.map((story) => ({
    id: story.id,
    title: story.title,
    summary: story.summary,
    lastCoverageAt: story.last_coverage_at.toISOString(),
    ratedSourceCount: ratedByStory.get(story.id)?.rated_source_count ?? 0,
    unratedSourceCount: ratedByStory.get(story.id)?.unrated_source_count ?? 0,
    biasBar: biasByStory.get(story.id) ?? emptyBiasBar(),
  }));
}

export async function getHomeFeed(pool: Pool, cursorRaw: string | undefined): Promise<FeedResponse> {
  const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw, FEED_NAME);
  const asOf = cursor === null ? new Date() : new Date(cursor.as_of);
  const cursorCoverageAt = cursor === null ? null : new Date(cursor.c);
  const cursorId = cursor === null ? null : cursor.id;

  const rows = await fetchFeedPage(pool, { asOf, cursorCoverageAt, cursorId, limit: PAGE_SIZE + 1 });
  const page: Page<StoryRow> = buildPage(rows, PAGE_SIZE, FEED_NAME, asOf);

  const [items, updatedCount] = await Promise.all([buildFeedItems(pool, page.items), countUpdatedSince(pool, asOf)]);

  return { items, asOf: page.as_of, nextCursor: page.next_cursor, updatedCount };
}
