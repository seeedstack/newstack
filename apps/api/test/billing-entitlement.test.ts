import { describe, expect, it } from "vitest";

import { hasFreeReadsRemaining, isEntitled } from "../src/features/billing/entitlement.js";

const NOW = new Date("2026-06-15T00:00:00Z");
const PAST = new Date("2026-06-01T00:00:00Z");
const FUTURE = new Date("2026-07-01T00:00:00Z");

// PAYPAL_SPEC.md §6 entitlement rule, exhaustive over every status x grace/period-end
// combination — the highest-value test in this feature (CLAUDE.md: unit tests mirror the
// doc's pure logic exactly).
describe("isEntitled", () => {
  it("is false for no subscription", () => {
    expect(isEntitled(null, NOW)).toBe(false);
  });

  it.each(["incomplete", "trialing", "expired"] as const)("is false for status=%s regardless of dates", (status) => {
    expect(isEntitled({ status, grace_until: FUTURE, current_period_end: FUTURE }, NOW)).toBe(false);
  });

  it("is true for active, regardless of grace/period fields", () => {
    expect(isEntitled({ status: "active" }, NOW)).toBe(true);
    expect(isEntitled({ status: "active", grace_until: PAST, current_period_end: PAST }, NOW)).toBe(true);
  });

  it("past_due: entitled only while now < grace_until", () => {
    expect(isEntitled({ status: "past_due", grace_until: FUTURE }, NOW)).toBe(true);
    expect(isEntitled({ status: "past_due", grace_until: PAST }, NOW)).toBe(false);
    expect(isEntitled({ status: "past_due", grace_until: null }, NOW)).toBe(false);
    expect(isEntitled({ status: "past_due" }, NOW)).toBe(false);
  });

  it("canceled: entitled only while now < current_period_end", () => {
    expect(isEntitled({ status: "canceled", current_period_end: FUTURE }, NOW)).toBe(true);
    expect(isEntitled({ status: "canceled", current_period_end: PAST }, NOW)).toBe(false);
    expect(isEntitled({ status: "canceled", current_period_end: null }, NOW)).toBe(false);
    expect(isEntitled({ status: "canceled" }, NOW)).toBe(false);
  });

  it("boundary: exactly at grace_until/current_period_end is NOT entitled (strict <)", () => {
    expect(isEntitled({ status: "past_due", grace_until: NOW }, NOW)).toBe(false);
    expect(isEntitled({ status: "canceled", current_period_end: NOW }, NOW)).toBe(false);
  });
});

describe("hasFreeReadsRemaining", () => {
  it.each([
    [0, true],
    [1, true],
    [2, true],
    [3, false],
    [4, false],
  ])("views=%i -> %s", (views, expected) => {
    expect(hasFreeReadsRemaining(views)).toBe(expected);
  });
});
