// Opaque feed cursors (§10). The client never handles `as_of` or keys: the first request
// sends no cursor, the server picks `as_of = now()`, and every response returns
// { items, as_of, next_cursor }; the client sends next_cursor back unchanged.
import { createHmac, timingSafeEqual } from "node:crypto";

export interface CursorPayload {
  v: 1;
  feed: string;
  as_of: string;
  c: string; // last_coverage_at of the last item on the page
  id: string; // that item's id (tiebreaker)
}

// Keys rotate like JWT keys (current + previous): verification tries each in turn, since
// there's no kid marker in the payload — only ever two candidates.
const CURSOR_KEYS = (process.env.CURSOR_KEYS ?? "dev-insecure-cursor-key").split(",");
const SIGNATURE_LENGTH = 16;
const MAX_AS_OF_AGE_MS = 24 * 60 * 60 * 1000;

export class InvalidCursorError extends Error {}

function sign(key: string, payloadBytes: Buffer): Buffer {
  return createHmac("sha256", key).update(payloadBytes).digest().subarray(0, SIGNATURE_LENGTH);
}

export function encodeCursor(payload: CursorPayload): string {
  const payloadBytes = Buffer.from(JSON.stringify(payload), "utf8");
  const signature = sign(CURSOR_KEYS[0], payloadBytes);
  return Buffer.concat([payloadBytes, signature]).toString("base64url");
}

export function decodeCursor(cursor: string, feed: string): CursorPayload {
  const buf = Buffer.from(cursor, "base64url");
  if (buf.length <= SIGNATURE_LENGTH) throw new InvalidCursorError("malformed");

  const payloadBytes = buf.subarray(0, buf.length - SIGNATURE_LENGTH);
  const signature = buf.subarray(buf.length - SIGNATURE_LENGTH);
  const signatureOk = CURSOR_KEYS.some((key) => timingSafeEqual(sign(key, payloadBytes), signature));
  if (!signatureOk) throw new InvalidCursorError("bad_signature");

  let payload: CursorPayload;
  try {
    payload = JSON.parse(payloadBytes.toString("utf8"));
  } catch {
    throw new InvalidCursorError("malformed_payload");
  }
  if (payload.v !== 1) throw new InvalidCursorError("unknown_version");
  if (payload.feed !== feed) throw new InvalidCursorError("wrong_feed");
  if (Date.now() - Date.parse(payload.as_of) > MAX_AS_OF_AGE_MS) throw new InvalidCursorError("as_of_too_old");
  return payload;
}

export interface Page<T extends { id: string; last_coverage_at: Date }> {
  items: T[];
  as_of: string;
  next_cursor: string | null;
}

// `items` is the page fetched with LIMIT pageSize + 1 (one extra row to detect "more pages"
// without a separate count query); this trims it back to pageSize and builds the cursor.
export function buildPage<T extends { id: string; last_coverage_at: Date }>(
  items: T[],
  pageSize: number,
  feed: string,
  asOf: Date
): Page<T> {
  const hasMore = items.length > pageSize;
  const pageItems = hasMore ? items.slice(0, pageSize) : items;
  const last = pageItems[pageItems.length - 1];
  const next_cursor = hasMore
    ? encodeCursor({ v: 1, feed, as_of: asOf.toISOString(), c: last.last_coverage_at.toISOString(), id: last.id })
    : null;
  return { items: pageItems, as_of: asOf.toISOString(), next_cursor };
}
