// Separate process, same API image (§9: `node mailer.js`). Drains the outbox backlog, then
// idles — a 10s poll tick, not a leader-elected job: a single mailer instance is the MVP
// design (complexity budget §1), so there's no multi-worker contention to guard against.
import { getPool } from "../db.js";
import { WEB_ORIGIN } from "../config.js";
import { processOnce } from "./service.js";
import { ConsoleMailTransport, ResendMailTransport, type MailTransport } from "./transport.js";

const TICK_MS = 10_000;

// Dormant until real creds exist (complexity budget §1): no RESEND_API_KEY means dev/test,
// so mail just goes to the console instead of failing to start.
function buildTransport(): MailTransport {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey === undefined) return new ConsoleMailTransport();
  const from = process.env.MAIL_FROM;
  if (from === undefined) throw new Error("mailer: RESEND_API_KEY is set but MAIL_FROM is not");
  return new ResendMailTransport(apiKey, from);
}

const transport = buildTransport();

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
