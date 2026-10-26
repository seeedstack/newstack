// Entitlement rule, PAYPAL_SPEC.md §6, verbatim:
// A user is entitled when status = 'active' OR (status = 'past_due' AND now() < grace_until)
// OR (status = 'canceled' AND now() < current_period_end).
// Pure function — the highest-value test in this feature (CLAUDE.md "unit tests mirror the
// doc's pure logic exactly"), kept separate from any DB/request code so it's trivial to
// exhaust by table test.
export interface SubscriptionState {
  status: "incomplete" | "trialing" | "active" | "past_due" | "canceled" | "expired";
  grace_until?: Date | null;
  current_period_end?: Date | null;
}

export function isEntitled(sub: SubscriptionState | null, now: Date = new Date()): boolean {
  if (sub === null) return false;
  if (sub.status === "active") return true;
  if (sub.status === "past_due") return sub.grace_until != null && now < sub.grace_until;
  if (sub.status === "canceled") return sub.current_period_end != null && now < sub.current_period_end;
  return false;
}

// Free tier metering (PAYPAL_SPEC §4.2 FR-P2): default 3 premium reads per rolling calendar
// month, tunable post-launch per A6.
export const FREE_PREMIUM_READS_PER_MONTH = 3;

export function hasFreeReadsRemaining(viewsThisMonth: number): boolean {
  return viewsThisMonth < FREE_PREMIUM_READS_PER_MONTH;
}
