import type { Pool } from "pg";

export const CATEGORIES = ["national", "regional", "language", "business", "geopolitical", "specialist"] as const;
export type Category = (typeof CATEGORIES)[number];

export async function sourceExists(pool: Pool, sourceId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM sources WHERE id = $1", [sourceId]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function fetchCategories(pool: Pool, sourceId: string): Promise<Category[]> {
  const result = await pool.query<{ category: Category }>(
    "SELECT category FROM source_categories WHERE source_id = $1 ORDER BY category",
    [sourceId]
  );
  return result.rows.map((r) => r.category);
}

// Curator assigns the whole set at once (PRODUCT §5.9: a descriptive tag, not a provenance
// record) — delete-then-insert in one transaction, not a per-category add/remove API.
export async function replaceCategories(pool: Pool, sourceId: string, categories: Category[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM source_categories WHERE source_id = $1", [sourceId]);
    for (const category of categories) {
      await client.query("INSERT INTO source_categories (source_id, category) VALUES ($1, $2)", [sourceId, category]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
