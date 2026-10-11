import { describe, expect, it } from "vitest";

import { getPool } from "../src/db.js";

describe("db pool", () => {
  it("returns a working connection", async () => {
    const result = await getPool().query("SELECT 1 AS one");
    expect(result.rows[0]).toEqual({ one: 1 });
  });
});
