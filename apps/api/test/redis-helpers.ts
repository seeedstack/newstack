// A fresh worker process's Redis client (enableOfflineQueue: false, src/redis.ts) can still be
// mid-connect when a test's first command fires — not just the very first call; it can take
// longer than a short test's whole runtime. Tests that need a command to actually reach Redis
// (not just tolerate the app's own fail-open/fail-safe fallback, which rate-limit/page-cache
// call sites already handle) should wait for readiness via these helpers.
import { getRedis } from "../src/redis.js";

async function waitForReady(): Promise<void> {
  const redis = getRedis();
  if (redis.status === "ready") return;
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      redis.off("error", onError);
      resolve();
    };
    const onError = (err: Error) => {
      redis.off("ready", onReady);
      reject(err);
    };
    redis.once("ready", onReady);
    redis.once("error", onError);
  });
}

export async function setTestCache(key: string, value: string, ttlSeconds: number): Promise<void> {
  await waitForReady();
  await getRedis().set(key, value, "EX", ttlSeconds);
}

export async function delTestCache(key: string): Promise<void> {
  await waitForReady();
  await getRedis().del(key);
}
