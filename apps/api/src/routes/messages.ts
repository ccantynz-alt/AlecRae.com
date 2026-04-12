/**
 * Messages Route — Production Email Sending Pipeline
 *
 * POST /v1/messages/send  — Validate, store in Postgres, enqueue to MTA
 * POST /v1/messages       — Alias for /send
 * GET  /v1/messages/:id   — Retrieve message status
 * GET  /v1/messages       — List messages with cursor pagination
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, desc, and, lt, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { SendMessageSchema, PaginationSchema } from "../types.js";
import type {
  SendMessageInput,
  PaginationParams,
  PaginatedResponse,
} from "../types.js";
import { getDatabase, emails, deliveryResults, domains, accounts, suppressionLists } from "@emailed/db";
import { getSendQueue } from "../lib/queue.js";
import { checkQuota, incrementQuota } from "../lib/quota.js";
import { indexEmail, searchEmails } from "@emailed/shared";
import { usageEnforcement } from "../middleware/usage.js";
import { idempotency } from "../middleware/idempotency.js";
import { getWarmupOrchestrator, WARMUP_LIMIT_EXCEEDED } from "@emailed/reputation";
import {
  validateCustomHeaders,
  HEADER_INJECTION_REJECTED,
} from "@emailed/mta/lib";
import { scanAttachment, isSafe } from "@emailed/security";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateMessageId(domain: string): string {
  const id = generateId();
  return `<${id}@${domain}>`;
}

function domainOf(address: string): string {
  const idx = address.lastIndexOf("@");
  return idx === -1 ? address : address.slice(idx + 1).toLowerCase();
}

const API_BASE_URL = process.env["API_URL"] ?? "http://localhost:3001";

/**
 * Inject open-tracking pixel and rewrite links for click tracking.
 */
function injectTracking(html: string, emailId: string): string {
  // Inject open-tracking pixel before </body> or at end
  const pixel = `<img src="${API_BASE_URL}/t/${emailId}/open.gif" width="1" height="1" alt="" style="display:none" />`;
  const tracked = html.includes("</body>")
    ? html.replace("</body>", `${pixel}</body>`)
    : html + pixel;

  // Rewrite <a href="..."> links for click tracking (skip mailto: and tel:)
  return tracked.replace(
    /<a\s([^>]*?)href=["']([^"']+)["']/gi,
    (_match, prefix: string, url: string) => {
      if (url.startsWith("mailto:") || url.startsWith("tel:") || url.startsWith("#")) {
        return `<a ${prefix}href="${url}"`;
      }
      const trackedUrl = `${API_BASE_URL}/t/${emailId}/click?url=${encodeURIComponent(url)}`;
      return `<a ${prefix}href="${trackedUrl}"`;
    },
  );
}

/**
 * Build an RFC 5322 raw message from the API input.
 * Produces headers + body separated by a blank line.
 */
function buildRawMessage(
  input: SendMessageInput,
  messageId: string,
  emailId?: string,
): string {
  const lines: string[] = [];

  // From
  const fromStr = input.from.name
    ? `${input.from.name} <${input.from.email}>`
    : input.from.email;
  lines.push(`From: ${fromStr}`);

  // To
  const toStr = input.to
    .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
    .join(", ");
  lines.push(`To: ${toStr}`);

  // Cc
  if (input.cc && input.cc.length > 0) {
    const ccStr = input.cc
      .map((r) => (r.name ? `${r.name} <${r.email}>` : r.email))
      .join(", ");
    lines.push(`Cc: ${ccStr}`);
  }

  // Subject
  lines.push(`Subject: ${input.subject}`);

  // Message-ID
  lines.push(`Message-ID: ${messageId}`);

  // Date
  lines.push(`Date: ${new Date().toUTCString()}`);

  // MIME-Version
  lines.push("MIME-Version: 1.0");

  // Reply-To
  if (input.replyTo) {
    const replyStr = input.replyTo.name
      ? `${input.replyTo.name} <${input.replyTo.email}>`
      : input.replyTo.email;
    lines.push(`Reply-To: ${replyStr}`);
  }

  // List-Unsubscribe (RFC 8058) — required by Gmail/Yahoo for bulk senders
  if (emailId) {
    const unsubUrl = `${API_BASE_URL}/t/${emailId}/unsubscribe`;
    lines.push(`List-Unsubscribe: <${unsubUrl}>`);
    lines.push("List-Unsubscribe-Post: List-Unsubscribe=One-Click");
  }

  // Custom headers — already validated and sanitized by
  // validateCustomHeaders() at queue-accept time. We still skip the
  // handful of names the platform sets itself so customer-supplied
  // Message-ID (etc) can't collide with the header lines already
  // emitted above; everything else is guaranteed safe by the validator.
  if (input.headers) {
    const platformOwned = new Set([
      "from",
      "to",
      "cc",
      "bcc",
      "subject",
      "message-id",
      "date",
      "mime-version",
      "content-type",
      "content-transfer-encoding",
    ]);
    for (const [key, value] of Object.entries(input.headers)) {
      if (platformOwned.has(key.toLowerCase())) continue;
      lines.push(`${key}: ${value}`);
    }
  }

  // Content type + body (with tracking pixel injection for HTML)
  const trackedHtml = input.html && emailId ? injectTracking(input.html, emailId) : input.html;

  if (trackedHtml && input.text) {
    const boundary = `----=_Part_${generateId().slice(0, 16)}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/plain; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(input.text);
    lines.push(`--${boundary}`);
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(trackedHtml);
    lines.push(`--${boundary}--`);
  } else if (trackedHtml) {
    lines.push("Content-Type: text/html; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(trackedHtml);
  } else {
    lines.push("Content-Type: text/plain; charset=utf-8");
    lines.push("Content-Transfer-Encoding: quoted-printable");
    lines.push("");
    lines.push(input.text ?? "");
  }

  return lines.join("\r\n");
}

// ─── Query schemas ──────────────────────────────────────────────────────────

const ListMessagesQuery = PaginationSchema.extend({
  status: z
    .enum([
      "draft",
      "queued",
      "sending",
      "delivered",
      "bounced",
      "deferred",
      "complained",
      "failed",
    ])
    .optional(),
  tag: z.string().optional(),
});

// ─── Shared send handler ───────────────────────────────────────────────────

import type { Context } from "hono";

async function handleSend(c: Context) {
  const input = getValidatedBody<SendMessageInput>(c);
  const auth = c.get("auth");
  const db = getDatabase();

  const id = generateId();
  const senderDomain = domainOf(input.from.email);
  const messageId = generateMessageId(senderDomain);

  // ── 1. Resolve the sender domain in our database ──────────────────
  const [domainRecord] = await db
    .select({
      id: domains.id,
      dkimSelector: domains.dkimSelector,
      verificationStatus: domains.verificationStatus,
      isActive: domains.isActive,
    })
    .from(domains)
    .where(and(eq(domains.domain, senderDomain), eq(domains.accountId, auth.accountId)))
    .limit(1);

  if (!domainRecord) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message: `Domain "${senderDomain}" is not verified for this account. Add it via POST /v1/domains first.`,
          code: "domain_not_found",
        },
      },
      422,
    );
  }

  // ── 1.1 DNS records stale check ──────────────────────────────────
  // If the daily liveness checker has detected missing/changed DNS
  // records, the domain is marked as failed + inactive. Block sends
  // with a clear error and re-verification path.
  if (domainRecord.verificationStatus === "failed" || !domainRecord.isActive) {
    return c.json(
      {
        error: "DNS_RECORDS_STALE",
        message: `DNS records for "${senderDomain}" are stale or unverified. Sending is paused until records are corrected and re-verified via POST /v1/domains/${domainRecord.id}/verify.`,
        domain: senderDomain,
      },
      422,
    );
  }

  // ── 1a. Hard quota enforcement ────────────────────────────────────
  // Must be checked BEFORE warmup, suppression, and enqueue so that
  // over-quota accounts cannot consume warmup slots or queue capacity.
  const quota = await checkQuota(auth.accountId);
  if (!quota.allowed) {
    return c.json(
      {
        error: "QUOTA_EXCEEDED",
        message: `Monthly email limit reached (${quota.sent}/${quota.limit}). Upgrade your plan or wait until next billing cycle.`,
        plan: quota.plan,
        limit: quota.limit,
        sent: quota.sent,
        resetsAt: quota.resetsAt,
      },
      429,
    );
  }

  // ── 1b. Suppression list check ────────────────────────────────────
  // Reject sends to suppressed recipients BEFORE warmup and enqueue
  // so a suppressed address cannot waste a warmup slot or quota count.
  const allRecipientAddresses = [
    ...input.to.map((r) => r.email),
    ...(input.cc ?? []).map((r) => r.email),
    ...(input.bcc ?? []).map((r) => r.email),
  ];

  for (const recipientEmail of allRecipientAddresses) {
    const [suppressed] = await db
      .select({
        email: suppressionLists.email,
        reason: suppressionLists.reason,
      })
      .from(suppressionLists)
      .where(
        and(
          eq(suppressionLists.email, recipientEmail.toLowerCase()),
          eq(suppressionLists.domainId, domainRecord.id),
        ),
      )
      .limit(1);

    if (suppressed) {
      return c.json(
        {
          error: "RECIPIENT_SUPPRESSED",
          reason: suppressed.reason === "bounce" ? "hard_bounce"
            : suppressed.reason === "complaint" ? "complaint"
            : suppressed.reason === "unsubscribe" ? "manual_unsubscribe"
            : suppressed.reason,
          address: suppressed.email,
        },
        422,
      );
    }
  }

  // ── 1c. Validate customer-supplied custom headers ─────────────────
  // Reputation-protection: Bcc/CRLF injection and platform-controlled
  // headers (DKIM-Signature, Authentication-Results, etc) must never
  // reach the SMTP DATA stream. Hard-reject at queue-accept time so
  // the customer gets a clear error and no bad send is enqueued.
  const headerCheck = validateCustomHeaders(
    (input.headers ?? null) as Record<string, unknown> | null,
  );
  if (!headerCheck.ok) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message: headerCheck.reason,
          code: HEADER_INJECTION_REJECTED,
        },
      },
      400,
    );
  }
  const sanitizedHeaders = headerCheck.sanitized;

  // ── 1d. Auto-enrol the domain in warm-up + hard-enforce day limit ─
  // `ensureWarmupAndCheck` creates a session on-the-fly for any domain
  // that doesn't have one, so new customers cannot bypass warm-up by
  // "not starting one". Reputation destruction is permanent — this
  // gate MUST hard-reject. No silent drops.
  const warmupOrchestrator = getWarmupOrchestrator();
  const warmupCheck = await warmupOrchestrator.ensureWarmupAndCheck(
    domainRecord.id,
    auth.accountId,
  );

  if (!warmupCheck.allowed) {
    return c.json(
      {
        error: {
          type: "rate_limit",
          message:
            warmupCheck.message ??
            "Domain warm-up sending limit reached",
          code: warmupCheck.code ?? WARMUP_LIMIT_EXCEEDED,
          retryAfter: warmupCheck.retryAfter?.toISOString() ?? null,
          warmup: {
            currentDay: warmupCheck.currentDay ?? null,
            dailyLimit:
              warmupCheck.dailyLimit === Number.MAX_SAFE_INTEGER
                ? null
                : warmupCheck.dailyLimit ?? null,
            sentToday: warmupCheck.sentToday ?? null,
          },
        },
      },
      429,
    );
  }

  // ── 2. Build the raw RFC-5322 message ─────────────────────────────
  // Pass sanitized headers so buildRawMessage never sees unvalidated input.
  const rawMessage = buildRawMessage(
    { ...input, headers: sanitizedHeaders },
    messageId,
    id,
  );

  // ── 2a. Virus scan attachments (before persist + enqueue) ─────────
  if (input.attachments && input.attachments.length > 0) {
    for (const attachment of input.attachments) {
      try {
        const buffer = Buffer.from(attachment.content, "base64");
        const scanResult = await scanAttachment(buffer, attachment.filename);

        if (!isSafe(scanResult)) {
          return c.json(
            {
              error: "ATTACHMENT_MALWARE_DETECTED",
              filename: attachment.filename,
              threats: scanResult.threats,
            },
            422,
          );
        }
      } catch (scanError) {
        // VirusTotal unavailable — degrade gracefully, allow send
        console.warn(
          `[messages] Virus scan failed for "${attachment.filename}", allowing send:`,
          scanError instanceof Error ? scanError.message : scanError,
        );
      }
    }
  }

  // ── 3. Collect all recipient addresses (to + cc + bcc) ────────────
  const allRecipients = [
    ...input.to.map((r) => r.email),
    ...(input.cc ?? []).map((r) => r.email),
    ...(input.bcc ?? []).map((r) => r.email),
  ];

  // ── 4. Persist the email record in Postgres ───────────────────────
  const now = new Date();

  await db.insert(emails).values({
    id,
    accountId: auth.accountId,
    domainId: domainRecord.id,
    messageId,
    fromAddress: input.from.email,
    fromName: input.from.name ?? null,
    toAddresses: input.to.map((r) => ({
      address: r.email,
      name: r.name,
    })),
    ccAddresses: input.cc
      ? input.cc.map((r) => ({ address: r.email, name: r.name }))
      : null,
    bccAddresses: input.bcc
      ? input.bcc.map((r) => ({ address: r.email, name: r.name }))
      : null,
    replyToAddress: input.replyTo?.email ?? null,
    replyToName: input.replyTo?.name ?? null,
    subject: input.subject,
    textBody: input.text ?? null,
    htmlBody: input.html ?? null,
    customHeaders:
      Object.keys(sanitizedHeaders).length > 0 ? sanitizedHeaders : null,
    status: "queued",
    tags: input.tags ?? [],
    scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
    createdAt: now,
    updatedAt: now,
  });

  // ── 5. Create delivery_results rows (one per recipient) ───────────
  const deliveryRows = allRecipients.map((recipient) => ({
    id: generateId(),
    emailId: id,
    recipientAddress: recipient,
    status: "queued" as const,
    attemptCount: 0,
  }));

  if (deliveryRows.length > 0) {
    await db.insert(deliveryResults).values(deliveryRows);
  }

  // ── 6. Enqueue to MTA via BullMQ ─────────────────────────────────
  const queue = getSendQueue();

  let delay: number | undefined;
  if (input.scheduledAt) {
    const delayMs = new Date(input.scheduledAt).getTime() - Date.now();
    if (delayMs > 0) {
      delay = delayMs;
    }
  }

  await queue.add(
    id,
    {
      email: {
        id,
        accountId: auth.accountId,
        messageId,
        from: input.from.email,
        to: allRecipients,
        rawMessage,
        priority: 3 as const,
        attempts: 0,
        maxAttempts: 8,
        scheduledAt: input.scheduledAt
          ? new Date(input.scheduledAt)
          : new Date(),
        createdAt: now,
        domain: senderDomain,
        metadata: {
          domainId: domainRecord.id,
          tags: input.tags ?? [],
        },
      },
      addedAt: now.toISOString(),
    },
    {
      priority: 3,
      attempts: 8,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: true,
      removeOnFail: false,
      ...(delay !== undefined ? { delay } : {}),
    },
  );

  // ── 6b. Record send against warm-up counter (fire-and-forget) ────
  warmupOrchestrator.recordSend(domainRecord.id).catch(() => {});

  // ── 6c. Increment quota counter in Redis (fire-and-forget) ──────
  incrementQuota(auth.accountId).catch(() => {});

  // ── 7. Index in Meilisearch (fire-and-forget) ────────────────────
  indexEmail({
    id,
    accountId: auth.accountId,
    mailboxId: "sent",
    subject: input.subject,
    textBody: input.text ?? null,
    fromAddress: input.from.email,
    fromName: input.from.name ?? null,
    toAddresses: input.to.map((r) => ({
      address: r.email,
      name: r.name,
    })),
    snippet: (input.text ?? input.html ?? "").replace(/<[^>]+>/g, " ").slice(0, 200),
    hasAttachments: false,
    status: "queued",
    createdAt: now,
  }).catch((err) => {
    console.warn("[messages] Meilisearch indexing failed:", err);
  });

  // ── 8. Increment account usage counter (fire-and-forget) ─────────
  db.update(accounts)
    .set({
      emailsSentThisPeriod: sql`${accounts.emailsSentThisPeriod} + 1`,
      updatedAt: now,
    })
    .where(eq(accounts.id, auth.accountId))
    .catch(() => {});

  // ── 9. Return response ────────────────────────────────────────────
  return c.json({ id, messageId, status: "queued" as const }, 202);
}

// ─── Route handler ──────────────────────────────────────────────────────────

const messages = new Hono();

const sendMiddleware = [idempotency(), requireScope("messages:send"), usageEnforcement, validateBody(SendMessageSchema)] as const;

// POST /v1/messages/send — Send an email (production pipeline)
messages.post("/send", ...sendMiddleware, handleSend);

// POST /v1/messages — Alias for /send
messages.post("/", ...sendMiddleware, handleSend);

// GET /v1/messages/search — Full-text email search via Meilisearch
messages.get(
  "/search",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");

    const q = c.req.query("q") ?? "";
    const mailbox = c.req.query("mailbox");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
    const offset = parseInt(c.req.query("offset") ?? "0", 10) || 0;

    if (!q.trim()) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "Query parameter 'q' is required and must not be empty.",
            code: "missing_query",
          },
        },
        400,
      );
    }

    try {
      const result = await searchEmails(auth.accountId, q, {
        mailboxId: mailbox,
        limit,
        offset,
      });

      return c.json({
        data: result.hits.map((hit) => ({
          id: hit.id,
          subject: hit.subject,
          from: {
            email: hit.fromAddress,
            name: hit.fromName,
          },
          snippet: hit.snippet,
          createdAt: new Date(hit.createdAt * 1000).toISOString(),
        })),
        totalHits: result.totalHits,
        processingTimeMs: result.processingTimeMs,
        query: result.query,
      });
    } catch (err) {
      console.error("[messages/search] Meilisearch error:", err);
      return c.json(
        {
          error: {
            type: "service_error",
            message: "Search service is temporarily unavailable.",
            code: "search_unavailable",
          },
        },
        503,
      );
    }
  },
);

// GET /v1/messages/:id — Retrieve message + delivery status
messages.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [emailRecord] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, id), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!emailRecord) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Message ${id} not found`,
            code: "message_not_found",
          },
        },
        404,
      );
    }

    // Fetch per-recipient delivery results
    const results = await db
      .select()
      .from(deliveryResults)
      .where(eq(deliveryResults.emailId, id));

    return c.json({
      data: {
        id: emailRecord.id,
        messageId: emailRecord.messageId,
        from: {
          email: emailRecord.fromAddress,
          name: emailRecord.fromName,
        },
        to: emailRecord.toAddresses,
        cc: emailRecord.ccAddresses,
        subject: emailRecord.subject,
        textBody: emailRecord.textBody,
        htmlBody: emailRecord.htmlBody,
        preview: (emailRecord.textBody ?? emailRecord.htmlBody ?? "").slice(0, 256).replace(/<[^>]+>/g, ""),
        status: emailRecord.status,
        tags: emailRecord.tags,
        createdAt: emailRecord.createdAt.toISOString(),
        updatedAt: emailRecord.updatedAt.toISOString(),
        sentAt: emailRecord.sentAt?.toISOString() ?? null,
        deliveryResults: results.map((r) => ({
          recipient: r.recipientAddress,
          status: r.status,
          mxHost: r.mxHost,
          responseCode: r.remoteResponseCode,
          response: r.remoteResponse,
          attempts: r.attemptCount,
          deliveredAt: r.deliveredAt?.toISOString() ?? null,
          nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
        })),
      },
    });
  },
);

// GET /v1/messages — List messages with cursor pagination
messages.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListMessagesQuery),
  async (c) => {
    const query = getValidatedQuery<
      PaginationParams & { status?: string; tag?: string }
    >(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(emails.accountId, auth.accountId)];

    if (query.status) {
      conditions.push(
        eq(
          emails.status,
          query.status as
            | "draft"
            | "queued"
            | "processing"
            | "sent"
            | "delivered"
            | "bounced"
            | "deferred"
            | "dropped"
            | "failed"
            | "complained",
        ),
      );
    }

    if (query.cursor) {
      conditions.push(lt(emails.createdAt, new Date(query.cursor)));
    }

    if (query.tag) {
      conditions.push(
        sql`${emails.tags} @> ${JSON.stringify([query.tag])}::jsonb`,
      );
    }

    const rows = await db
      .select({
        id: emails.id,
        messageId: emails.messageId,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        ccAddresses: emails.ccAddresses,
        subject: emails.subject,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
        status: emails.status,
        tags: emails.tags,
        createdAt: emails.createdAt,
        updatedAt: emails.updatedAt,
        sentAt: emails.sentAt,
      })
      .from(emails)
      .where(and(...conditions))
      .orderBy(desc(emails.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    const data = page.map((row) => ({
      id: row.id,
      messageId: row.messageId,
      from: { email: row.fromAddress, name: row.fromName },
      to: row.toAddresses,
      cc: row.ccAddresses,
      subject: row.subject,
      preview: (row.textBody ?? row.htmlBody ?? "").slice(0, 256).replace(/<[^>]+>/g, ""),
      status: row.status,
      tags: row.tags,
      hasAttachments: false,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? null,
    }));

    const response: PaginatedResponse<(typeof data)[number]> = {
      data,
      cursor: nextCursor,
      hasMore,
    };

    return c.json(response);
  },
);

export { messages };
