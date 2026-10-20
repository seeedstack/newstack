import type { Pool } from "pg";

export interface SourceOwnershipRow {
  source_id: string;
  ownership_transparency: "disclosed" | "partially_disclosed" | "undisclosed" | "insufficient_evidence";
  editorial_independence: "no_documented_influence" | "documented_instances" | "insufficient_evidence";
  evidence: unknown;
  rated_by: string | null;
  notes: string | null;
  updated_at: Date;
}

const COLUMNS = `source_id, ownership_transparency, editorial_independence, evidence, rated_by, notes, updated_at`;

export async function sourceExists(pool: Pool, sourceId: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM sources WHERE id = $1", [sourceId]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function fetchOwnership(pool: Pool, sourceId: string): Promise<SourceOwnershipRow | null> {
  const result = await pool.query<SourceOwnershipRow>(`SELECT ${COLUMNS} FROM source_ownership WHERE source_id = $1`, [
    sourceId,
  ]);
  return result.rows[0] ?? null;
}

export interface OwnershipInput {
  ownershipTransparency: "disclosed" | "partially_disclosed" | "undisclosed" | "insufficient_evidence";
  editorialIndependence: "no_documented_influence" | "documented_instances" | "insufficient_evidence";
  evidence: unknown;
  ratedBy: string | null;
  notes: string | null;
}

// Plain upsert (PRODUCT §5.8): a correction overwrites in place, no supersedes chain like
// rating/geo-rating/sensationalism-rating — source_ownership is current-state only.
export async function upsertOwnership(pool: Pool, sourceId: string, input: OwnershipInput): Promise<SourceOwnershipRow> {
  const result = await pool.query<SourceOwnershipRow>(
    `INSERT INTO source_ownership (source_id, ownership_transparency, editorial_independence, evidence, rated_by, notes, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (source_id) DO UPDATE SET
       ownership_transparency = EXCLUDED.ownership_transparency,
       editorial_independence = EXCLUDED.editorial_independence,
       evidence = EXCLUDED.evidence,
       rated_by = EXCLUDED.rated_by,
       notes = EXCLUDED.notes,
       updated_at = now()
     RETURNING ${COLUMNS}`,
    [
      sourceId,
      input.ownershipTransparency,
      input.editorialIndependence,
      input.evidence === undefined ? null : JSON.stringify(input.evidence),
      input.ratedBy,
      input.notes,
    ]
  );
  return result.rows[0];
}
