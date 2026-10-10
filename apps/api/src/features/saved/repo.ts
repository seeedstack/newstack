import type { Pool } from "pg";

// The three saved-item tables (user_saved_sources/stories/topics) are structurally identical
// — one config object per resource type stands in for three near-duplicate modules.
export interface SavedResourceConfig {
  table: string; // developer-controlled constant, never user input — safe to interpolate
  itemColumn: string;
  existsTable: string;
}

export const SAVED_SOURCES: SavedResourceConfig = {
  table: "user_saved_sources",
  itemColumn: "source_id",
  existsTable: "sources",
};
export const SAVED_STORIES: SavedResourceConfig = {
  table: "user_saved_stories",
  itemColumn: "story_id",
  existsTable: "stories",
};
export const SAVED_TOPICS: SavedResourceConfig = {
  table: "user_saved_topics",
  itemColumn: "topic_id",
  existsTable: "topics",
};

export async function itemExists(pool: Pool, config: SavedResourceConfig, itemId: string): Promise<boolean> {
  const result = await pool.query(`SELECT 1 FROM ${config.existsTable} WHERE id = $1`, [itemId]);
  return result.rowCount !== null && result.rowCount > 0;
}

// Idempotent by primary key (§10): saving twice, or unsaving something never saved, are both
// no-ops rather than errors.
export async function saveItem(pool: Pool, config: SavedResourceConfig, userId: string, itemId: string): Promise<void> {
  await pool.query(
    `INSERT INTO ${config.table} (user_id, ${config.itemColumn}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, itemId]
  );
}

export async function unsaveItem(pool: Pool, config: SavedResourceConfig, userId: string, itemId: string): Promise<void> {
  await pool.query(`DELETE FROM ${config.table} WHERE user_id = $1 AND ${config.itemColumn} = $2`, [userId, itemId]);
}

export async function listSavedItems(pool: Pool, config: SavedResourceConfig, userId: string): Promise<string[]> {
  const result = await pool.query<{ id: string }>(
    `SELECT ${config.itemColumn} AS id FROM ${config.table} WHERE user_id = $1`,
    [userId]
  );
  return result.rows.map((r) => r.id);
}
