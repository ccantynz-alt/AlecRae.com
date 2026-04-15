import { SmtpReceiver } from "./receiver/smtp-receiver.js";
import { MimeParser } from "./parser/mime-parser.js";
import { FilterPipeline } from "./filter/pipeline.js";
import { MailboxRouter } from "./routing/router.js";
import { InMemoryEmailStore } from "./storage/store.js";
import { PostgresEmailStore } from "./storage/postgres-store.js";
import { createHttpInbound } from "./http-inbound.js";
import {
  initTelemetry,
  shutdownTelemetry,
  recordEmailReceived,
  recordEmailFilterDuration,
} from "@emailed/shared";
import type { SmtpSession, SmtpEnvelope } from "./types.js";

function splitRawMessage(rawData: Uint8Array): { rawHeaders: string; rawBody: Uint8Array } {
  const bytes = rawData;
  let splitIndex = -1;
  let separatorLength = 0;
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 0x0d && bytes[i + 1] === 0x0a &&
        i + 3 < bytes.length && bytes[i + 2] === 0x0d && bytes[i + 3] === 0x0a) {
      splitIndex = i;
      separatorLength = 4;
      break;
    }
    if (bytes[i] === 0x0a && bytes[i + 1] === 0x0a) {
      splitIndex = i;
      separatorLength = 2;
      break;
    }
  }
  if (splitIndex === -1) {
    return { rawHeaders: new TextDecoder().decode(bytes), rawBody: new Uint8Array(0) };
  }
  return {
    rawHeaders: new TextDecoder().decode(bytes.subarray(0, splitIndex)),
    rawBody: bytes.subarray(splitIndex + separatorLength),
  };
}

const parser = new MimeParser();
const pipeline = new FilterPipeline();
const router = new MailboxRouter();
const store = process.env["DATABASE_URL"] ? new PostgresEmailStore() : new InMemoryEmailStore();

async function handleInboundMessage(
  session: SmtpSession,
  envelope: SmtpEnvelope,
  rawData: Uint8Array,
): Promise<void> {
  const startTime = Date.now();
  const parsed = await parser.parse(rawData);
  console.log(`[Inbound] Parsed message ${parsed.messageId} from ${envelope.mailFrom} (${rawData.length} bytes)`);
  const { rawHeaders, rawBody } = splitRawMessage(rawData);
  const filterStart = performance.now();
  const verdict = await pipeline.process(envelope, parsed, session.remoteAddress, rawHeaders, rawBody);
  const filterDurationMs = performance.now() - filterStart;
  recordEmailFilterDuration("full-pipeline", filterDurationMs);
  console.log(`[Inbound] Filter verdict for ${parsed.messageId}: ${verdict.action} (score: ${verdict.score})`);
  if (verdict.action === "reject") {
    const senderDomain = (envelope.mailFrom ?? "").split("@")[1] ?? "unknown";
    recordEmailReceived(senderDomain, "rejected");
    throw new Error(`Message rejected: ${verdict.reason}`);
  }
  const resolved = await router.resolve(envelope.rcptTo);
  let deliveryCount = 0;
  for (const [recipient, resolution] of resolved) {
    if (!resolution) {
      console.warn(`[Inbound] No mailbox found for recipient: ${recipient}`);
      continue;
    }
    if (resolution.rule.action === "forward") {
      console.log(`[Inbound] Forwarding ${parsed.messageId} to ${resolution.resolvedAddress}`);
      continue;
    }
    const stored = await store.store(parsed, resolution, verdict);
    console.log(`[Inbound] Stored ${stored.id} in mailbox ${resolution.mailboxId} for ${recipient}`);
    deliveryCount++;
  }
  const elapsed = Date.now() - startTime;
  const senderDomain = (envelope.mailFrom ?? "").split("@")[1] ?? "unknown";
  recordEmailReceived(senderDomain, verdict.action === "quarantine" ? "quarantined" : "accepted");
  console.log(`[Inbound] Processed ${parsed.messageId}: ${deliveryCount} deliveries in ${elapsed}ms`);
}

const hostname = process.env["SMTP_HOSTNAME"] ?? "mx.emailed.dev";
const smtpPort = parseInt(process.env["SMTP_PORT"] ?? "25", 10);
const httpPort = parseInt(process.env["HTTP_PORT"] ?? "8025", 10);
const enableSmtp = process.env["DISABLE_SMTP"] !== "true";
const enableHttp = process.env["DISABLE_HTTP"] !== "true";

const receiver = new SmtpReceiver({
  hostname,
  port: smtpPort,
  onMessage: handleInboundMessage,
});

const httpApp = createHttpInbound({
  parser,
  pipeline,
  router,
  store,
  webhookSecret: process.env["INBOUND_WEBHOOK_SECRET"],
});

let httpServer: ReturnType<typeof Bun.serve> | null = null;

async function main(): Promise<void> {
  console.log(`[Inbound] Starting inbound email processing service`);
  await initTelemetry("emailed-inbound").catch((err) => {
    console.warn("[Inbound] OpenTelemetry init failed:", err);
  });
  console.log(`[Inbound] Store backend: ${process.env["DATABASE_URL"] ? "PostgreSQL" : "in-memory"}`);
  if (enableSmtp) {
    console.log(`[Inbound] SMTP receiver: ${hostname}:${smtpPort}`);
    await receiver.start();
  } else {
    console.log(`[Inbound] SMTP receiver: disabled`);
  }
  if (enableHttp) {
    httpServer = Bun.serve({ port: httpPort, fetch: httpApp.fetch });
    console.log(`[Inbound] HTTP webhook: http://0.0.0.0:${httpPort}/inbound/webhook`);
  } else {
    console.log(`[Inbound] HTTP webhook: disabled`);
  }
  console.log(`[Inbound] Service started. Store stats:`, store.getStats());
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[Inbound] Received ${signal} — shutting down...`);
  if (enableSmtp) await receiver.stop();
  if (httpServer) httpServer.stop();
  await shutdownTelemetry().catch(() => {});
  console.log("[Inbound] Shutdown complete");
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((err) => {
  console.error("[Inbound] Fatal error:", err);
  process.exit(1);
});

export { receiver, httpApp, parser, pipeline, router, store };
