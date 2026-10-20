import type { Pool } from "pg";

import { fetchOwnership, sourceExists, upsertOwnership, type OwnershipInput, type SourceOwnershipRow } from "./repo.js";

export class SourceNotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const TRANSPARENCY_VALUES = new Set(["disclosed", "partially_disclosed", "undisclosed", "insufficient_evidence"]);
const INDEPENDENCE_VALUES = new Set(["no_documented_influence", "documented_instances", "insufficient_evidence"]);

export interface OwnershipResponse {
  sourceId: string;
  ownershipTransparency: string;
  editorialIndependence: string;
  evidence: unknown;
  ratedBy: string | null;
  notes: string | null;
  updatedAt: string;
}

function toResponse(row: SourceOwnershipRow): OwnershipResponse {
  return {
    sourceId: row.source_id,
    ownershipTransparency: row.ownership_transparency,
    editorialIndependence: row.editorial_independence,
    evidence: row.evidence,
    ratedBy: row.rated_by,
    notes: row.notes,
    updatedAt: row.updated_at.toISOString(),
  };
}

// Absence of a row = not yet researched (PRODUCT §5.8), same convention as source_ratings.
export async function getSourceOwnership(pool: Pool, sourceId: string): Promise<OwnershipResponse | null> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const row = await fetchOwnership(pool, sourceId);
  return row === null ? null : toResponse(row);
}

// §5.8: the two fields are independent and never derived from each other. source_ownership has
// no DB CHECK for the evidence requirement below (unlike the manual-curation CHECKs on the
// append-only rating tables), so it's enforced here instead.
export function validateOwnershipInput(body: unknown): OwnershipInput {
  const b = (body ?? {}) as Record<string, unknown>;

  if (typeof b.ownershipTransparency !== "string" || !TRANSPARENCY_VALUES.has(b.ownershipTransparency)) {
    throw new ValidationError("invalid_ownership_transparency");
  }
  if (typeof b.editorialIndependence !== "string" || !INDEPENDENCE_VALUES.has(b.editorialIndependence)) {
    throw new ValidationError("invalid_editorial_independence");
  }

  const evidence = Array.isArray(b.evidence) ? b.evidence : undefined;
  if (b.editorialIndependence === "documented_instances" && (evidence === undefined || evidence.length === 0)) {
    throw new ValidationError("documented_instances_needs_evidence");
  }

  return {
    ownershipTransparency: b.ownershipTransparency as OwnershipInput["ownershipTransparency"],
    editorialIndependence: b.editorialIndependence as OwnershipInput["editorialIndependence"],
    evidence,
    ratedBy: typeof b.ratedBy === "string" ? b.ratedBy : null,
    notes: typeof b.notes === "string" ? b.notes : null,
  };
}

export async function submitOwnership(pool: Pool, sourceId: string, input: OwnershipInput): Promise<OwnershipResponse> {
  if (!(await sourceExists(pool, sourceId))) throw new SourceNotFoundError();
  const row = await upsertOwnership(pool, sourceId, input);
  return toResponse(row);
}
