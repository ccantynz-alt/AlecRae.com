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
import type { Context } from "hono";
import type { MimeParser } from "./parser/mime-parser.js";
import type { FilterPipeline } from "./filter/pipeline.js";
import type { MailboxRouter } from "./routing/router.js";
import type { EmailStore } from "./storage/store.js";
import type { SmtpEnvelope, MimeHeader, ResolvedRecipient } from "./types.js";
import { isDsnMessage, processInboundDsn } from "./dsn-suppression.js";
import { localizeForwardResolution, splitRawMessage } from "./inbound-handler.js";

interface HttpInboundConfig {
  /** Shared parser instance (structural type so tests can inject stubs) */
  parser: Pick<MimeParser, "parse">;
  /** Shared filter pipeline instance */
  pipeline: Pick<FilterPipeline, "process">;
  /** Shared mailbox router instance */
  router: Pick<MailboxRouter, "resolve">;
  /** Shared email store instance */
  store: Pick<EmailStore, "store">;
  /**
   * Shared secret for authenticating webhook callers. FAIL-CLOSED: when this
   * is unset the inbound endpoints refuse everything with 503 — an
   * unauthenticated ingest listening on 0.0.0.0 would let anyone on the
   * network inject "received" mail into any mailbox (the dangerous default
   * is the permissive one; same posture as MTA_WARMUP_ENABLED / the relay
   * control).
   */
  webhookSecret?: string | undefined;
  /** DSN detection — injectable for tests; defaults to the real detector. */
  detectDsn?: ((headers: MimeHeader[]) => boolean) | undefined;
  /** DSN processing — injectable for tests; defaults to the real processor. */
  processDsn?: ((rawMessage: string, envelopeTo?: string) => Promise<void>) | undefined;
}

/**
 * Create the Hono app that handles inbound email webhooks.
 */
export function createHttpInbound(config: HttpInboundConfig): Hono {
  const { parser, pipeline, router, store } = config;
  const detectDsn = config.detectDsn ?? isDsnMessage;
  const processDsn = config.processDsn ?? processInboundDsn;
  const app = new Hono();

  // ── Health check ──────────────────────────────────────────────────────
  app.get("/inbound/health", (c) =>
    c.json({ status: "ok", service: "inbound-webhook" }),
  );

  /**
   * Authenticate a webhook request. Returns a Response to short-circuit
   * with, or null when the caller is authenticated.
   */
  const authenticate = (c: Context): Response | null => {
    if (!config.webhookSecret) {
      // Fail closed. Accepting unauthenticated POSTs here would let anyone
      // who can reach this port inject mail as "received".
      console.error(
        "[HTTP-Inbound] INBOUND_WEBHOOK_SECRET is not set — refusing all webhook requests. " +
          "Set INBOUND_WEBHOOK_SECRET in the environment to enable HTTP ingest.",
      );
      return c.json({ error: "HTTP inbound is not configured (webhook secret unset)" }, 503);
    }

    const auth = c.req.header("Authorization");
    const token = auth?.startsWith("Bearer ")
      ? auth.slice(7)
      : c.req.header("X-Webhook-Secret");

    if (token !== config.webhookSecret) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    return null;
  };

  /**
   * Store one message for each resolved recipient. Forward rules deliver
   * locally with a warning — outbound forwarding is not implemented, and
   * silently skipping the store would lose the message (see
   * localizeForwardResolution).
   */
  const deliverToRecipients = async (
    parsed: Awaited<ReturnType<MimeParser["parse"]>>,
    resolved: Map<string, ResolvedRecipient | null>,
    verdict: Awaited<ReturnType<FilterPipeline["process"]>>,
  ): Promise<{ id: string; recipient: string; mailbox: string }[]> => {
    const deliveries: { id: string; recipient: string; mailbox: string }[] = [];

    for (const [recipient, resolution] of resolved) {
      if (!resolution) {
        console.warn(`[HTTP-Inbound] No mailbox found for recipient: ${recipient}`);
        continue;
      }

      let target = resolution;
      if (resolution.rule.action === "forward") {
        console.warn(
          `[HTTP-Inbound] Forwarding is not yet implemented — ${parsed.messageId} for ${recipient} ` +
            `delivered to the local inbox instead of being forwarded to ${resolution.resolvedAddress} ` +
            `(message kept, not forwarded)`,
        );
        target = localizeForwardResolution(resolution);
      }

      const stored = await store.store(parsed, target, verdict);
      console.log(
        `[HTTP-Inbound] Stored ${stored.id} in mailbox ${target.mailboxId} for ${recipient}`,
      );
      deliveries.push({
        id: stored.id,
        recipient,
        mailbox: target.mailboxId,
      });
    }

    return deliveries;
  };

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
    // ── Auth (fail-closed when unconfigured) ──────────────────────────
    const authFailure = authenticate(c);
    if (authFailure) return authFailure;

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

      const senderIp = c.req.header("X-Sender-IP") ?? c.req.header("X-Real-IP") ?? "0.0.0.0";

      console.log(
        `[HTTP-Inbound] Received message ${parsed.messageId} from ${envelopeFrom} (${rawData.length} bytes)`,
      );

      // 2b. DSN detection + suppression processing — mirrors the SMTP path
      // (inbound-handler.ts): a bounce relayed to us over HTTP must update
      // suppression exactly like one arriving on port 25, and must do so
      // BEFORE the filter runs so a spam-scored DSN still suppresses.
      if (detectDsn(parsed.headers)) {
        const rawText = new TextDecoder().decode(rawData);
        await processDsn(rawText, envelope.rcptTo[0]).catch((err) => {
          console.error(
            "[HTTP-Inbound] DSN processing failed:",
            err instanceof Error ? err.message : String(err),
          );
        });
      }

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

      if (verdict.action === "defer") {
        // A filter stage errored — the message could not honestly be
        // evaluated. NOT stored; 503 tells the forwarder this is temporary
        // and the message should be redelivered (the HTTP analogue of the
        // SMTP 451).
        console.warn(
          `[HTTP-Inbound] Deferring ${parsed.messageId}: ${verdict.reason ?? "no reason"} — not stored`,
        );
        return c.json(
          {
            status: "deferred",
            messageId: parsed.messageId,
            error: "Temporary failure, retry later",
          },
          503,
        );
      }

      // 4. Resolve recipients
      const resolved = await router.resolve(envelope.rcptTo);

      // 5. Store for each resolved recipient
      const deliveries = await deliverToRecipients(parsed, resolved, verdict);

      const elapsed = Date.now() - startTime;
      console.log(
        `[HTTP-Inbound] Processed ${parsed.messageId}: ${deliveries.length} deliveries in ${elapsed}ms`,
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
    const authFailure = authenticate(c);
    if (authFailure) return authFailure;

    const body = await c.req.json<{ messages: { raw: string; envelope?: { from?: string; to?: string[] }; senderIp?: string }[] }>();
    if (!body.messages || !Array.isArray(body.messages)) {
      return c.json({ error: "Request must contain a 'messages' array" }, 400);
    }

    const results: { messageId?: string | undefined; status: string; error?: string | undefined }[] = [];

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

        // DSN detection + suppression — same ordering as the single-message
        // path: before the filter, so a spam-scored DSN still suppresses.
        if (detectDsn(parsed.headers)) {
          const rawText = new TextDecoder().decode(rawData);
          await processDsn(rawText, envelope.rcptTo[0]).catch((err) => {
            console.error(
              "[HTTP-Inbound] DSN processing failed:",
              err instanceof Error ? err.message : String(err),
            );
          });
        }

        const { rawHeaders: hdrs2, rawBody: bdy2 } = splitRawMessage(rawData);
        const verdict = await pipeline.process(envelope, parsed, senderIp, hdrs2, bdy2);
        if (verdict.action === "reject") {
          results.push({ messageId: parsed.messageId, status: "rejected", error: verdict.reason ?? "Rejected" });
          continue;
        }

        if (verdict.action === "defer") {
          // NOT stored — reported as deferred so the forwarder can retry.
          console.warn(
            `[HTTP-Inbound] Deferring ${parsed.messageId}: ${verdict.reason ?? "no reason"} — not stored`,
          );
          results.push({
            messageId: parsed.messageId,
            status: "deferred",
            error: "Temporary failure, retry later",
          });
          continue;
        }

        const resolved = await router.resolve(envelope.rcptTo);
        await deliverToRecipients(parsed, resolved, verdict);

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
