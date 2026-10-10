// Rate-limit counters live in Redis and persist across test runs (and across repeated
// `vitest run` invocations against the same fixed test emails/IP within a single run) —
// without this, a rerun inherits counts from the previous one and trips limits spuriously.
// This Redis instance is this project's own dev instance, so a full flush is safe.
import { Redis } from "ioredis";

export default async function setup(): Promise<void> {
  const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
  await redis.flushdb();
  await redis.quit();
}
