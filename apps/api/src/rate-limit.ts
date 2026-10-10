// Auth rate limits (§9), CGNAT-aware: a primary key (email / token hash) plus a looser
// per-IP backstop. Redis-backed fixed window; falls back to a per-instance in-memory
// window when Redis is unreachable — fail-safe (still enforced), never fail-open.
import { getRedis } from "./redis.js";

export interface LimitSpec {
  key: string;
  limit: number;
  windowSeconds: number;
}

const memoryWindows = new Map<string, { count: number; expiresAt: number }>();
let warnedRedisDown = false;

function checkInMemory(spec: LimitSpec): boolean {
  const now = Date.now();
  const existing = memoryWindows.get(spec.key);
  if (existing === undefined || now >= existing.expiresAt) {
    memoryWindows.set(spec.key, { count: 1, expiresAt: now + spec.windowSeconds * 1000 });
    return true;
  }
  existing.count += 1;
  return existing.count <= spec.limit;
}

// Returns true when the request is within the limit (and has been counted against it).
export async function checkLimit(spec: LimitSpec): Promise<boolean> {
  try {
    const redis = getRedis();
    const fullKey = `ratelimit:${spec.key}:${spec.windowSeconds}`;
    const count = await redis.incr(fullKey);
    if (count === 1) await redis.expire(fullKey, spec.windowSeconds);
    warnedRedisDown = false;
    return count <= spec.limit;
  } catch {
    if (!warnedRedisDown) {
      // ponytail: §11-grade alerting isn't wired yet (no Sentry/metrics pipeline) —
      // this console.warn is the placeholder until that exists.
      console.warn("[rate-limit] Redis unavailable, falling back to in-memory limiter");
      warnedRedisDown = true;
    }
    return checkInMemory(spec);
  }
}

export async function checkAllLimits(specs: LimitSpec[]): Promise<boolean> {
  const results = await Promise.all(specs.map(checkLimit));
  return results.every(Boolean);
}
