import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./test/global-setup.ts",
    // Tests hit a real shared dev Postgres (no mocking, matching apps/ingestion's pytest
    // convention) — pytest runs files serially for the same reason. Some tables (email_outbox
    // especially, since the mailer's claim query deliberately scans the whole table) aren't
    // scoped per test file, so parallel file execution causes real cross-file lock
    // contention and claim races, not just slower tests.
    fileParallelism: false,
  },
});
