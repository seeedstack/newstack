import type { Pool } from "pg";

import { buildPage, decodeCursor } from "../../pagination.js";
import { buildFeedItems, type FeedResponse } from "../feed/service.js";
import { countTopicUpdatedSince, fetchTopic, fetchTopicFeedPage, listTopics, type TopicRow } from "./repo.js";

const PAGE_SIZE = 20;

export class TopicNotFoundError extends Error {}

export async function getTopics(pool: Pool): Promise<TopicRow[]> {
  return listTopics(pool);
}

export async function getTopicFeed(pool: Pool, topicId: string, cursorRaw: string | undefined): Promise<FeedResponse> {
  const topic = await fetchTopic(pool, topicId);
  if (topic === null) throw new TopicNotFoundError();

  const feedName = `topic:${topicId}`;
  const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw, feedName);
  const asOf = cursor === null ? new Date() : new Date(cursor.as_of);
  const cursorCoverageAt = cursor === null ? null : new Date(cursor.c);
  const cursorId = cursor === null ? null : cursor.id;

  const rows = await fetchTopicFeedPage(pool, { topicId, asOf, cursorCoverageAt, cursorId, limit: PAGE_SIZE + 1 });
  const page = buildPage(rows, PAGE_SIZE, feedName, asOf);
  const [items, updatedCount] = await Promise.all([
    buildFeedItems(pool, page.items),
    countTopicUpdatedSince(pool, topicId, asOf),
  ]);

  return { items, asOf: page.as_of, nextCursor: page.next_cursor, updatedCount };
}
