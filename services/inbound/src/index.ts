import { SmtpReceiver } from "./receiver/smtp-receiver.js";
import { MimeParser } from "./parser/mime-parser.js";
import { FilterPipeline } from "./filter/pipeline.js";
import { MailboxRouter } from "./routing/router.js";
import { InMemoryEmailStore } from "./storage/store.js";
import { PostgresEmailStore } from "./storage/postgres-store.js";
import type { SmtpSession, SmtpEnvelope } from "./types.js";

/**
 * Inbound email processing service.
 *
 * Pipeline: SMTP receive -> MIME parse -> filter -> route -> store
 */

const parser = new MimeParser();
const pipeline = new FilterPipeline();
const router = new MailboxRouter();
const store = process.env["DATABASE_URL"]
  ? new PostgresEmailStore()
  : new InMemoryEmailStore();

async function handleInboundMessage(
  session: SmtpSession,
  envelope: SmtpEnvelope,
  rawData: Uint8Array,
): Promise<void> {
  const startTime = Date.now();

  // 1. Parse the MIME message
  const parsed = await parser.parse(rawData);
  console.log(
    `[Inbound] Parsed message ${parsed.messageId} from ${envelope.mailFrom} (${rawData.length} bytes)`,
  );

  // 2. Run the filter pipeline
  const verdict = await pipeline.process(envelope, parsed);
  console.log(
    `[Inbound] Filter verdict for ${parsed.messageId}: ${verdict.action} (score: ${verdict.score})`,
  );

  if (verdict.action === "reject") {
    throw new Error(`Message rejected: ${verdict.reason}`);
  }

  // 3. Resolve recipients
  const resolved = await router.resolve(envelope.rcptTo);

  // 4. Store for each resolved recipient
  let deliveryCount = 0;
  for (const [recipient, resolution] of resolved) {
    if (!resolution) {
      console.warn(`[Inbound] No mailbox found for recipient: ${recipient}`);
      continue;
    }

    if (resolution.rule.action === "forward") {
      // In production: enqueue for outbound delivery to forwarding address
      console.log(`[Inbound] Forwarding ${parsed.messageId} to ${resolution.resolvedAddress}`);
      continue;
    }

    const stored = await store.store(parsed, resolution, verdict);
    console.log(
      `[Inbound] Stored ${stored.id} in mailbox ${resolution.mailboxId} for ${recipient}`,
    );
    deliveryCount++;
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[Inbound] Processed ${parsed.messageId}: ${deliveryCount} deliveries in ${elapsed}ms`,
  );
}

// --- Service Startup ---

const hostname = process.env.SMTP_HOSTNAME ?? "mx.emailed.dev";
const port = parseInt(process.env.SMTP_PORT ?? "25", 10);

const receiver = new SmtpReceiver({
  hostname,
  port,
  onMessage: handleInboundMessage,
});

async function main(): Promise<void> {
  console.log(`[Inbound] Starting inbound email processing service`);
  console.log(`[Inbound] SMTP receiver: ${hostname}:${port}`);

  await receiver.start();

  console.log(`[Inbound] Service started. Store stats:`, store.getStats());
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("[Inbound] Shutting down...");
  await receiver.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Inbound] Shutting down...");
  await receiver.stop();
  process.exit(0);
});

main().catch((err) => {
  console.error("[Inbound] Fatal error:", err);
  process.exit(1);
});

export { receiver, parser, pipeline, router, store };
