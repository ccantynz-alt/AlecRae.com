import { SmtpReceiver } from "./receiver/smtp-receiver.js";
import { MimeParser } from "./parser/mime-parser.js";
import { FilterPipeline } from "./filter/pipeline.js";
import { MailboxRouter } from "./routing/router.js";
import { createDomainVerifier } from "./routing/domain-verifier.js";
import { InMemoryEmailStore } from "./storage/store.js";
import { PostgresEmailStore } from "./storage/postgres-store.js";
import { createHttpInbound } from "./http-inbound.js";
import { createInboundHandler } from "./inbound-handler.js";
import { initTelemetry, shutdownTelemetry } from "@alecrae/shared";

/**
 * Inbound email processing service.
 *
 * Pipeline: SMTP/HTTP receive -> MIME parse -> filter -> route -> store
 *
 * Two ingress paths:
 *  1. SMTP receiver (port 25 / SMTP_PORT) — direct MX delivery
 *  2. HTTP webhook (port 8025 / HTTP_PORT) — Cloudflare Email Workers or
 *     other HTTP-based forwarders POST raw MIME to /inbound/webhook
 *
 * The message handler itself lives in inbound-handler.ts; this file only
 * wires the real dependencies and starts/stops the listeners.
 */

const parser = new MimeParser();
const pipeline = new FilterPipeline();
const router = new MailboxRouter();
const store = process.env["DATABASE_URL"]
  ? new PostgresEmailStore()
  : new InMemoryEmailStore();

const handleInboundMessage = createInboundHandler({ parser, pipeline, router, store });

// --- Service Startup ---

const hostname = process.env["SMTP_HOSTNAME"] ?? "mx1.alecrae.com";
const smtpPort = parseInt(process.env["SMTP_PORT"] ?? "25", 10);
const httpPort = parseInt(process.env["HTTP_PORT"] ?? "8025", 10);
const enableSmtp = process.env["DISABLE_SMTP"] !== "true";
const enableHttp = process.env["DISABLE_HTTP"] !== "true";

const receiver = new SmtpReceiver({
  hostname,
  port: smtpPort,
  // The relay control. Without this the receiver answers 250 to any recipient
  // on any domain — see routing/domain-verifier.ts and issue #105.
  domainVerifier: createDomainVerifier(),
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

  // Initialize OpenTelemetry
  await initTelemetry("alecrae-inbound").catch((err) => {
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
    httpServer = Bun.serve({
      port: httpPort,
      fetch: httpApp.fetch,
    });
    console.log(`[Inbound] HTTP webhook: http://0.0.0.0:${httpPort}/inbound/webhook`);
  } else {
    console.log(`[Inbound] HTTP webhook: disabled`);
  }

  console.log(`[Inbound] Service started. Store stats:`, store.getStats());
}

// Handle graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[Inbound] Received ${signal} — shutting down...`);
  if (enableSmtp) await receiver.stop();
  if (httpServer) httpServer.stop();
  await shutdownTelemetry().catch(() => { /* no-op */ });
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
