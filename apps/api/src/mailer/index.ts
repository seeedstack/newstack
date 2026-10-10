// Separate process, same API image (§9: `node mailer.js`). Drains the outbox backlog, then
// idles — a 10s poll tick, not a leader-elected job: a single mailer instance is the MVP
// design (complexity budget §1), so there's no multi-worker contention to guard against.
import { getPool } from "../db.js";
import { WEB_ORIGIN } from "../config.js";
import { processOnce } from "./service.js";
import { ConsoleMailTransport } from "./transport.js";

const TICK_MS = 10_000;
const transport = new ConsoleMailTransport();

async function drain(): Promise<void> {
  while (await processOnce(getPool(), transport, WEB_ORIGIN)) {
    // keep draining while rows are due
  }
}

async function main(): Promise<void> {
  for (;;) {
    try {
      await drain();
    } catch (err) {
      console.error("[mailer] tick failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, TICK_MS));
  }
}

main();
