import { describe, expect, it } from "vitest";

import { buildPage, decodeCursor, encodeCursor, InvalidCursorError } from "../src/pagination.js";

describe("cursor encode/decode", () => {
  const payload = { v: 1 as const, feed: "home", as_of: new Date().toISOString(), c: new Date().toISOString(), id: "abc" };

  it("round-trips a valid cursor", () => {
    const cursor = encodeCursor(payload);
    expect(decodeCursor(cursor, "home")).toEqual(payload);
  });

  it("rejects a cursor issued for a different feed", () => {
    const cursor = encodeCursor(payload);
    expect(() => decodeCursor(cursor, "topic:123")).toThrow(InvalidCursorError);
  });

  it("rejects a tampered cursor", () => {
    const cursor = encodeCursor(payload);
    const buf = Buffer.from(cursor, "base64url");
    buf[0] ^= 0xff;
    expect(() => decodeCursor(buf.toString("base64url"), "home")).toThrow(InvalidCursorError);
  });

  it("rejects a cursor whose as_of is older than 24h", () => {
    const old = { ...payload, as_of: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() };
    const cursor = encodeCursor(old);
    expect(() => decodeCursor(cursor, "home")).toThrow(InvalidCursorError);
  });

  it("rejects garbage input", () => {
    expect(() => decodeCursor("not-a-real-cursor", "home")).toThrow(InvalidCursorError);
  });
});

describe("buildPage", () => {
  const asOf = new Date();
  function item(id: string, hoursAgo: number) {
    return { id, last_coverage_at: new Date(asOf.getTime() - hoursAgo * 3600_000) };
  }

  it("has no next_cursor when there are no more rows than the page size", () => {
    const page = buildPage([item("1", 0), item("2", 1)], 2, "home", asOf);
    expect(page.items).toHaveLength(2);
    expect(page.next_cursor).toBeNull();
    expect(page.as_of).toBe(asOf.toISOString());
  });

  it("trims the extra row and sets a usable next_cursor when there are more", () => {
    const page = buildPage([item("1", 0), item("2", 1), item("3", 2)], 2, "home", asOf);
    expect(page.items.map((i) => i.id)).toEqual(["1", "2"]);
    expect(page.next_cursor).not.toBeNull();

    const decoded = decodeCursor(page.next_cursor as string, "home");
    expect(decoded.id).toBe("2");
    expect(decoded.c).toBe(item("2", 1).last_coverage_at.toISOString());
  });
});
