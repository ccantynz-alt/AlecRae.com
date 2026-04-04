/**
 * HTTP inbound webhook endpoint for receiving forwarded emails.
 *
 * This provides an alternative to direct SMTP reception. Cloudflare Email
 * Workers (or any HTTP-based forwarder) can POST raw MIME email data to
 * this endpoint, which then feeds it through the same parse -> filter ->
 * route -> store pipeline used by the SMTP receiver.
 *
 * Uses Hono for consistency with the main API service.
 */

import { Hono } from "hono";
import { MimeParser } from "./parser/mime-parser.js";
import { FilterPipeline } from "./filter/pipeline.js";
import { MailboxRouter } from "./routing/router.js";
import type { EmailStore } from "./storage/store.js";
import type { SmtpSession, SmtpEnvelope } from "./types.js";

/**
 * Split raw email bytes into header block (string) and body (Uint8Array).
 */
function splitRawMessage(rawData: Uint8Array): { rawHeaders: string; rawBody: Uint8Array } {
  for (let i = 0; i < rawData.length - 1; i++) {
    if (rawData[i] === 0x0d && rawData[i + 1] === 0x0a &&
        i + 3 < rawData.length && rawData[i + 2] === 0x0d && rawData[i + 3] === 0x0a) {
      return {
        rawHeaders: new TextDecoder().decode(rawData.subarray(0, i)),
        rawBody: rawData.subarray(i + 4),
      };
    }
    if (rawData[i] === 0x0a && rawData[i + 1] === 0x0a) {
      return {
        rawHeaders: new TextDecoder().decode(rawData.subarray(0, i)),
        rawBody: rawData.subarray(i + 2),
      };
    }
  }
  return { rawHeaders: new TextDecoder().decode(rawData), rawBody: new Uint8Array(0) };
}

interface HttpInboundConfig {
  /** Shared parser instance */
  parser: MimeParser;
  /** Shared filter pipeline instance */
  pipeline: FilterPipeline;
  /** Shared mailbox router instance */
  router: MailboxRouter;
  /** Shared email store instance */
  store: EmailStore;
  /** Optional shared secret for authenticating webhook callers */
  webhookSecret?: string | undefined;
}

/**
 * Create the Hono app that handles inbound email webhooks.
 */
export function createHttpInbound(config: HttpInboundConfig): Hono {
  const { parser, pipeline, router, store } = config;
  const app = new Hono();

  // ── Health check ──────────────────────────────────────────────────────
  app.get("/inbound/health", (c) =>
    c.json({ status: "ok", service: "inbound-webhook" }),
  );

  // ── Main inbound webhook ─────────────────────────────────────────────
  // Accepts raw MIME email data as the request body.
  //
  // Required headers:
  //   Content-Type: message/rfc822  (or application/octet-stream)
  //
  // Optional headers (set by the forwarder):
  //   X-Envelope-From: sender@example.com
  //   X-Envelope-To:   recipient@example.com  (comma-separated for multiple)
  //   X-Sender-IP:     1.2.3.4
  //
  // When the forwarder cannot set custom headers, envelope information is
  // extracted from the parsed MIME headers (From / To / Cc).
  app.post("/inbound/webhook", async (c) => {
    // ── Auth ──────────────────────────────────────────────────────────
    if (config.webhookSecret) {
      const auth = c.req.header("Authorization");
      const token = auth?.startsWith("Bearer ")
        ? auth.slice(7)
        : c.req.header("X-Webhook-Secret");

      if (token !== config.webhookSecret) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }

    // ── Read raw body ────────────────────────────────────────────────
    const rawBody = await c.req.arrayBuffer();
    if (rawBody.byteLength === 0) {
      return c.json({ error: "Empty request body" }, 400);
    }

    const rawData = new Uint8Array(rawBody);
    const startTime = Date.now();

    try {
      // 1. Parse the MIME message
      const parsed = await parser.parse(rawData);

      // 2. Build envelope from headers or parsed data
      const envelopeFrom =
        c.req.header("X-Envelope-From") ??
        parsed.from[0]?.address ??
        "";
      const envelopeToHeader = c.req.header("X-Envelope-To");
      const envelopeTo = envelopeToHeader
        ? envelopeToHeader.split(",").map((a) => a.trim())
        : [...parsed.to, ...parsed.cc].map((a) => a.address);

      if (envelopeTo.length === 0) {
        return c.json({ error: "No recipients found" }, 400);
      }

      const envelope: SmtpEnvelope = {
        mailFrom: envelopeFrom,
        rcptTo: envelopeTo,
      };

      // Build a synthetic SMTP session for the pipeline
      const senderIp = c.req.header("X-Sender-IP") ?? c.req.header("X-Real-IP") ?? "0.0.0.0";
      const session: SmtpSession = {
        id: `http-${crypto.randomUUID()}`,
        remoteAddress: senderIp,
        remotePort: 0,
        secure: true, // HTTP endpoint is behind TLS
        rcptTo: envelopeTo,
        startedAt: new Date(),
      };

      console.log(
        `[HTTP-Inbound] Received message ${parsed.messageId} from ${envelopeFrom} (${rawData.length} bytes)`,
      );

      // 3. Run the filter pipeline (with raw headers/body for DKIM verification)
      const { rawHeaders: hdrs, rawBody: bdy } = splitRawMessage(rawData);
      const verdict = await pipeline.process(envelope, parsed, senderIp, hdrs, bdy);
      console.log(
        `[HTTP-Inbound] Filter verdict for ${parsed.messageId}: ${verdict.action} (score: ${verdict.score})`,
      );

      if (verdict.action === "reject") {
        return c.json(
          {
            status: "rejected",
            messageId: parsed.messageId,
            reason: verdict.reason,
          },
          422,
        );
      }

      // 4. Resolve recipients
      const resolved = await router.resolve(envelope.rcptTo);

      // 5. Store for each resolved recipient
      let deliveryCount = 0;
      const deliveries: Array<{ id: string; recipient: string; mailbox: string }> = [];

      for (const [recipient, resolution] of resolved) {
        if (!resolution) {
          console.warn(`[HTTP-Inbound] No mailbox found for recipient: ${recipient}`);
          continue;
        }

        if (resolution.rule.action === "forward") {
          console.log(
            `[HTTP-Inbound] Forwarding ${parsed.messageId} to ${resolution.resolvedAddress}`,
          );
          continue;
        }

        const stored = await store.store(parsed, resolution, verdict);
        console.log(
          `[HTTP-Inbound] Stored ${stored.id} in mailbox ${resolution.mailboxId} for ${recipient}`,
        );
        deliveries.push({
          id: stored.id,
          recipient,
          mailbox: resolution.mailboxId,
        });
        deliveryCount++;
      }

      const elapsed = Date.now() - startTime;
      console.log(
        `[HTTP-Inbound] Processed ${parsed.messageId}: ${deliveryCount} deliveries in ${elapsed}ms`,
      );

      return c.json({
        status: "accepted",
        messageId: parsed.messageId,
        deliveries,
        processingTimeMs: elapsed,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[HTTP-Inbound] Processing error:", err);
      return c.json({ error: "Processing failed", details: message }, 500);
    }
  });

  // ── Batch inbound (accepts JSON with multiple raw messages) ──────────
  app.post("/inbound/webhook/batch", async (c) => {
    if (config.webhookSecret) {
      const auth = c.req.header("Authorization");
      const token = auth?.startsWith("Bearer ")
        ? auth.slice(7)
        : c.req.header("X-Webhook-Secret");

      if (token !== config.webhookSecret) {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }

    const body = await c.req.json<{ messages: Array<{ raw: string; envelope?: { from?: string; to?: string[] }; senderIp?: string }> }>();
    if (!body.messages || !Array.isArray(body.messages)) {
      return c.json({ error: "Request must contain a 'messages' array" }, 400);
    }

    const results: Array<{ messageId?: string | undefined; status: string; error?: string | undefined }> = [];

    for (const msg of body.messages) {
      try {
        const rawData = Uint8Array.from(atob(msg.raw), (c) => c.charCodeAt(0));
        const parsed = await parser.parse(rawData);

        const envelopeFrom = msg.envelope?.from ?? parsed.from[0]?.address ?? "";
        const envelopeTo =
          msg.envelope?.to ??
          [...parsed.to, ...parsed.cc].map((a) => a.address);

        if (envelopeTo.length === 0) {
          results.push({ messageId: parsed.messageId, status: "error", error: "No recipients" });
          continue;
        }

        const envelope: SmtpEnvelope = { mailFrom: envelopeFrom, rcptTo: envelopeTo };
        const senderIp = msg.senderIp ?? "0.0.0.0";

        const { rawHeaders: hdrs2, rawBody: bdy2 } = splitRawMessage(rawData);
        const verdict = await pipeline.process(envelope, parsed, senderIp, hdrs2, bdy2);
        if (verdict.action === "reject") {
          results.push({ messageId: parsed.messageId, status: "rejected", error: verdict.reason ?? "Rejected" });
          continue;
        }

        const resolved = await router.resolve(envelope.rcptTo);
        let deliveryCount = 0;
        for (const [, resolution] of resolved) {
          if (!resolution || resolution.rule.action === "forward") continue;
          await store.store(parsed, resolution, verdict);
          deliveryCount++;
        }

        results.push({ messageId: parsed.messageId, status: "accepted" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        results.push({ status: "error", error: message });
      }
    }

    return c.json({ results });
  });

  return app;
}
