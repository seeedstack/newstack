import type { Pool } from "pg";

import { fetchSource, fetchSourceDistribution, type SourceDistributionRow } from "./repo.js";

export class SourceNotFoundError extends Error {}

export interface SourceResponse {
  id: string;
  name: string;
  domain: string;
  status: "active" | "deprecated";
  deprecatedAt: string | null;
  logoUrl: string | null;
}

// Source metadata for the web app's saved-sources screen and anywhere else a bare source id
// needs a display name (ARCHITECTURE §10 Redis plan already names "Source metadata, TTL 1h" —
// this fills the endpoint that plan assumed).
export async function getSource(pool: Pool, sourceId: string): Promise<SourceResponse> {
  const source = await fetchSource(pool, sourceId);
  if (source === null) throw new SourceNotFoundError();
  return {
    id: source.id,
    name: source.name,
    domain: source.domain,
    status: source.status,
    deprecatedAt: source.deprecated_at?.toISOString() ?? null,
    logoUrl: source.logo_url,
  };
}

export interface SourceDistributionResponse {
  left: number;
  centerLeft: number;
  center: number;
  centerRight: number;
  right: number;
  notRated: number;
}

const CATEGORY_KEY: Record<SourceDistributionRow["category"], keyof SourceDistributionResponse> = {
  left: "left",
  "center-left": "centerLeft",
  center: "center",
  "center-right": "centerRight",
  right: "right",
  not_rated: "notRated",
};

// Replaces the static color-key legend on the home feed with the real site-wide spread
// (PRODUCT §3.5: counts, never a single left/right score — same rule as the per-story bar,
// just aggregated over every currently active, currently rated source instead of one story).
export async function getSourceDistribution(pool: Pool): Promise<SourceDistributionResponse> {
  const rows = await fetchSourceDistribution(pool);
  const out: SourceDistributionResponse = { left: 0, centerLeft: 0, center: 0, centerRight: 0, right: 0, notRated: 0 };
  for (const row of rows) out[CATEGORY_KEY[row.category]] = row.total;
  return out;
}
