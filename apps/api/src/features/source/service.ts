import type { Pool } from "pg";

import { fetchSource, fetchSourceDistribution, fetchSourceList, type SourceDistributionRow, type SourceListRow } from "./repo.js";
import { CATEGORIES } from "../source-category/repo.js";

const CATEGORY_SET: ReadonlySet<string> = new Set(CATEGORIES);

export class SourceNotFoundError extends Error {}
export class ValidationError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

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

export interface SourceListItemResponse {
  id: string;
  name: string;
  domain: string;
  countryCode: string;
  coverageRegion: string | null;
  language: string;
  categories: string[];
}

export interface SourceListResponse {
  items: SourceListItemResponse[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function toListItem(row: SourceListRow): SourceListItemResponse {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    countryCode: row.country_code,
    coverageRegion: row.coverage_region,
    language: row.language,
    categories: row.categories,
  };
}

export interface RawSourceListQuery {
  category?: unknown;
  country?: unknown;
  language?: unknown;
  q?: unknown;
  limit?: unknown;
  offset?: unknown;
}

// Structural filters only (ARCHITECTURE §10, PRODUCT §5.9's fixed category list) — rejects an
// unknown category rather than silently returning zero rows for a typo.
export async function listSources(pool: Pool, query: RawSourceListQuery): Promise<SourceListResponse> {
  const category = typeof query.category === "string" && query.category !== "" ? query.category : null;
  if (category !== null && !CATEGORY_SET.has(category)) throw new ValidationError("invalid_category");

  const country = typeof query.country === "string" && query.country !== "" ? query.country : null;
  const language = typeof query.language === "string" && query.language !== "" ? query.language : null;
  const q = typeof query.q === "string" && query.q !== "" ? query.q : null;

  const limitRaw = typeof query.limit === "string" ? Number(query.limit) : DEFAULT_LIMIT;
  if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > MAX_LIMIT) throw new ValidationError("invalid_limit");

  const offsetRaw = typeof query.offset === "string" ? Number(query.offset) : 0;
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0) throw new ValidationError("invalid_offset");

  const { items, total } = await fetchSourceList(pool, { category, country, language, q, limit: limitRaw, offset: offsetRaw });
  return { items: items.map(toListItem), total, limit: limitRaw, offset: offsetRaw };
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
