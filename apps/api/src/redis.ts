// Redis (§10): anonymous page cache + auth rate-limit counters. Commands fail fast
// (no offline queue, 1 retry) rather than hang, so callers can fall back promptly.
import { Redis } from "ioredis";

export const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let client: Redis | null = null;

export function getRedis(): Redis {
  if (client === null) {
    client = new Redis(REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
      lazyConnect: false,
    });
    // ioredis crashes the process on an unhandled 'error' event; failures already surface
    // to callers as rejected commands, so a no-op listener is enough here.
    client.on("error", () => {});
  }
  return client;
}
