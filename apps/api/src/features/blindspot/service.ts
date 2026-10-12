import type { Pool } from "pg";

import { buildPage, decodeCursor } from "../../pagination.js";
import { loadBlindspotConfig } from "./config.js";
import { fetchBlindspotPage, type BlindspotRow } from "./repo.js";

const PAGE_SIZE = 20;
const FEED_NAME = "blindspot";
// Loaded once per process, not per request -- config/product/blindspot.yaml (PRODUCT §4.4)
// changes only through a deploy, same as every other config/*.yaml this codebase reads.
const BLINDSPOT_PARAMS = loadBlindspotConfig();

export interface BlindspotItem {
  id: string;
  title: string;
  lastCoverageAt: string;
  side: "L" | "R";
  countedLeft: number;
  countedCenter: number;
  countedRight: number;
}

export interface BlindspotResponse {
  items: BlindspotItem[];
  asOf: string;
  nextCursor: string | null;
}

// PRODUCT §4.9: registered curator-only (routes.ts) — no calibration round has run yet, so
// no blindspot flag may be shown publicly. Promoting this to /api/public/* is the trigger-fire
// moment §4.9 describes, same pattern as every other "designed now, built when its trigger
// fires" item in the complexity budget.
export async function getBlindspotFeed(pool: Pool, cursorRaw: string | undefined): Promise<BlindspotResponse> {
  const cursor = cursorRaw === undefined ? null : decodeCursor(cursorRaw, FEED_NAME);
  const asOf = cursor === null ? new Date() : new Date(cursor.as_of);
  const cursorCoverageAt = cursor === null ? null : new Date(cursor.c);
  const cursorId = cursor === null ? null : cursor.id;

  const rows = await fetchBlindspotPage(pool, {
    asOf,
    cursorCoverageAt,
    cursorId,
    limit: PAGE_SIZE + 1,
    params: BLINDSPOT_PARAMS,
  });
  const page = buildPage(rows, PAGE_SIZE, FEED_NAME, asOf);

  const items: BlindspotItem[] = page.items.map((row: BlindspotRow) => ({
    id: row.id,
    title: row.title,
    lastCoverageAt: row.last_coverage_at.toISOString(),
    side: row.side,
    countedLeft: row.k_left,
    countedCenter: row.k_center,
    countedRight: row.k_right,
  }));

  return { items, asOf: page.as_of, nextCursor: page.next_cursor };
}
