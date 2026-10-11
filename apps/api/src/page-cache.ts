// Anonymous page cache (§10): first page key = route; later pages key = route + cursor.
// Redis outage: cache misses fall through to Postgres — caching is a perf optimization, so
// unlike rate limiting this fails OPEN (to the DB), never blocking a response.
import { getRedis } from "./redis.js";

export async function getCachedPage(key: string): Promise<string | null> {
  try {
    return await getRedis().get(key);
  } catch {
    return null;
  }
}

export async function setCachedPage(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, value, "EX", ttlSeconds);
  } catch {
    // ignore — a cache write failure just means the next request recomputes too
  }
}
