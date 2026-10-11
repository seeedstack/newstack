import type { Pool } from "pg";

import { fetchSource } from "./repo.js";

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
