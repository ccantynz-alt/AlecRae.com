/**
 * Core inbound message handler: MIME parse -> DSN detection -> filter ->
 * route -> store.
 *
 * Extracted from index.ts so it can be constructed with test doubles —
 * index.ts wires the real parser/pipeline/router/store and starts the
 * listeners; nothing here opens a socket.
 */

import type { MimeParser } from "./parser/mime-parser.js";
import type { FilterPipeline } from "./filter/pipeline.js";
import type { MailboxRouter } from "./routing/router.js";
import type { EmailStore } from "./storage/store.js";
import type { SmtpSession, SmtpEnvelope, ResolvedRecipient, MimeHeader } from "./types.js";
import { isDsnMessage, processInboundDsn } from "./dsn-suppression.js";
import { smtpReject, smtpDefer } from "./errors.js";
import { recordEmailReceived, recordEmailFilterDuration } from "@alecrae/shared";

/**
 * Split raw email bytes into the header block (as string) and body (as Uint8Array).
 * Headers and body are separated by a blank line (CRLF CRLF or LF LF).
 */
export function splitRawMessage(rawData: Uint8Array): { rawHeaders: string; rawBody: Uint8Array } {
  const bytes = rawData;
  // Search for CRLFCRLF (\r\n\r\n) or LFLF (\n\n)
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
    // No body found — entire message is headers
    return {
      rawHeaders: new TextDecoder().decode(bytes),
      rawBody: new Uint8Array(0),
    };
  }

  return {
    rawHeaders: new TextDecoder().decode(bytes.subarray(0, splitIndex)),
    rawBody: bytes.subarray(splitIndex + separatorLength),
  };
}

export interface InboundHandlerDeps {
  // Structural (Pick) types rather than the concrete classes so tests can
  // supply plain typed stubs — no casts needed, and the handler only ever
  // calls these members anyway.
  parser: Pick<MimeParser, "parse">;
  pipeline: Pick<FilterPipeline, "process">;
  router: Pick<MailboxRouter, "resolve">;
  store: Pick<EmailStore, "store">;
  /** DSN detection — injectable for tests; defaults to the real detector. */
  detectDsn?: (headers: MimeHeader[]) => boolean;
  /** DSN processing — injectable for tests; defaults to the real processor. */
  processDsn?: (rawMessage: string, envelopeTo?: string) => Promise<void>;
}

export type InboundMessageHandler = (
  session: SmtpSession,
  envelope: SmtpEnvelope,
  rawData: Uint8Array,
) => Promise<void>;

/**
 * When a routing rule says "forward", actual outbound forwarding needs the
 * send path (MTA + pre-send gates), which this service does not have. Until
 * that is built, silently `continue`-ing here LOSES the message — nothing is
 * stored and nothing is forwarded. The bounded honest behaviour is to keep
 * the message: deliver it to the local account inbox and warn loudly that
 * forwarding did not happen.
 */
export function localizeForwardResolution(resolution: ResolvedRecipient): ResolvedRecipient {
  return {
    ...resolution,
    // Deliver under the ORIGINAL (hosted) address, never the forward target —
    // the store resolves the recipient's domain from resolvedAddress, and a
    // foreign forward destination must not create a domains row for a domain
    // we do not host.
    resolvedAddress: resolution.originalAddress,
    mailboxId: "inbox",
  };
}

export function createInboundHandler(deps: InboundHandlerDeps): InboundMessageHandler {
  const { parser, pipeline, router, store } = deps;
  const detectDsn = deps.detectDsn ?? isDsnMessage;
  const processDsn = deps.processDsn ?? processInboundDsn;

  return async function handleInboundMessage(
    session: SmtpSession,
    envelope: SmtpEnvelope,
    rawData: Uint8Array,
  ): Promise<void> {
    const startTime = Date.now();
    const senderDomain = (envelope.mailFrom ?? "").split("@")[1] ?? "unknown";

    // 1. Parse the MIME message
    const parsed = await parser.parse(rawData);
    console.log(
      `[Inbound] Parsed message ${parsed.messageId} from ${envelope.mailFrom} (${rawData.length} bytes)`,
    );

    // 1b. Detect + process delivery-status notifications (bounces) — an async
    // DSN is the common real-world bounce path (the sending MTA already
    // handles same-connection SMTP-time rejections separately); this is what
    // actually keeps suppression in sync for bounces that arrive later.
    // Runs BEFORE the filter pipeline deliberately: a DSN that the spam
    // filter would refuse must still update suppression first.
    const isDsn = detectDsn(parsed.headers);
    if (isDsn) {
      const rawText = new TextDecoder().decode(rawData);
      // The envelope recipient is our VERP return path
      // (bounces+<emailId>@bounce.<domain>), which attributes the bounce to the
      // exact message rather than guessing from recency. A DSN is addressed to a
      // single recipient, so the first entry is the one.
      const dsnEnvelopeTo = Array.isArray(envelope.rcptTo) ? envelope.rcptTo[0] : envelope.rcptTo;
      await processDsn(rawText, dsnEnvelopeTo).catch((err) => {
        console.error("[Inbound] DSN processing failed:", err instanceof Error ? err.message : String(err));
      });
    }

    // 1c. Recipients accepted via a `bounce.<hosted-domain>` address (see
    // routing/domain-verifier.ts) are the VERP return path, not user
    // mailboxes: nothing is ever stored for them. When EVERY recipient is a
    // bounce-domain address, the whole message is consumed here — DSNs were
    // just processed above, and a non-DSN message to a bounce address is
    // logged and dropped. Either way the answer is 250: NEVER bounce a
    // bounce (rejecting a DSN generates a new DSN at the sender, and a
    // reject/defer here would make remote MTAs retry or double-bounce).
    const bounceRecipients = new Set(
      (session.bounceRcptTo ?? []).map((r) => r.toLowerCase()),
    );
    const mailboxRecipients = envelope.rcptTo.filter(
      (r) => !bounceRecipients.has(r.toLowerCase()),
    );

    if (bounceRecipients.size > 0 && !isDsn) {
      console.warn(
        `[Inbound] Non-DSN message ${parsed.messageId} addressed to bounce domain recipient(s) ` +
          `${[...bounceRecipients].join(", ")} — dropped without storage (not a user mailbox)`,
      );
    }

    if (mailboxRecipients.length === 0) {
      recordEmailReceived(senderDomain, isDsn ? "dsn" : "bounce-domain-dropped");
      console.log(
        `[Inbound] Message ${parsed.messageId} had only bounce-domain recipients — consumed, nothing stored`,
      );
      return;
    }

    // 2. Run the filter pipeline (pass sender IP for SPF validation, raw data for DKIM)
    const { rawHeaders, rawBody } = splitRawMessage(rawData);
    const filterStart = performance.now();
    const verdict = await pipeline.process(envelope, parsed, session.remoteAddress, rawHeaders, rawBody);
    const filterDurationMs = performance.now() - filterStart;
    recordEmailFilterDuration("full-pipeline", filterDurationMs);
    console.log(
      `[Inbound] Filter verdict for ${parsed.messageId}: ${verdict.action} (score: ${verdict.score})`,
    );

    if (verdict.action === "reject") {
      recordEmailReceived(senderDomain, "rejected");
      // Full detail to the logs only. The wire gets a generic 550 — echoing
      // the reason (spam score, which filter fired) hands spammers a tuning
      // oracle, and answering 451 (the old behaviour for every throw) made
      // senders retry permanently-rejected spam for days.
      console.warn(
        `[Inbound] Rejecting ${parsed.messageId}: ${verdict.reason ?? "no reason"} (score: ${verdict.score})`,
      );
      throw smtpReject();
    }

    if (verdict.action === "defer") {
      // A defer verdict means a filter stage errored (filter/pipeline.ts):
      // we could not honestly evaluate the message. Storing it anyway would
      // silently accept unfiltered mail; 451 makes the sender retry when the
      // pipeline is healthy again. NOT stored.
      recordEmailReceived(senderDomain, "deferred");
      console.warn(
        `[Inbound] Deferring ${parsed.messageId}: ${verdict.reason ?? "no reason"} — not stored, sender will retry`,
      );
      throw smtpDefer();
    }

    // 3. Resolve recipients (bounce-domain recipients were consumed above)
    const resolved = await router.resolve(mailboxRecipients);

    // 4. Store for each resolved recipient
    let deliveryCount = 0;
    for (const [recipient, resolution] of resolved) {
      if (!resolution) {
        console.warn(`[Inbound] No mailbox found for recipient: ${recipient}`);
        continue;
      }

      let target = resolution;
      if (resolution.rule.action === "forward") {
        // Outbound forwarding is NOT implemented (needs the send path).
        // Deliver locally instead of losing the message.
        console.warn(
          `[Inbound] Forwarding is not yet implemented — ${parsed.messageId} for ${recipient} ` +
            `delivered to the local inbox instead of being forwarded to ${resolution.resolvedAddress} ` +
            `(message kept, not forwarded)`,
        );
        target = localizeForwardResolution(resolution);
      }

      const stored = await store.store(parsed, target, verdict);
      console.log(
        `[Inbound] Stored ${stored.id} in mailbox ${target.mailboxId} for ${recipient}`,
      );
      deliveryCount++;
    }

    const elapsed = Date.now() - startTime;

    // Record telemetry
    recordEmailReceived(senderDomain, verdict.action === "quarantine" ? "quarantined" : "accepted");

    console.log(
      `[Inbound] Processed ${parsed.messageId}: ${deliveryCount} deliveries in ${elapsed}ms`,
    );
  };
}
