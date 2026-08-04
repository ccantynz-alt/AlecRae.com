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
import { eq, desc, and, lt, sql, inArray } from "drizzle-orm";
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
import { getDatabase, emails, events, deliveryResults, domains, accounts, suppressionLists, templates, connectedAccounts, emailLabels, labels } from "@alecrae/db";
import { getSendQueue } from "../lib/queue.js";
import { ensureFreshAccessToken } from "../sync/engine.js";
import { registerUndoable } from "./snooze.js";
import { decryptSecretOrNull, encryptSecret } from "../lib/token-crypto.js";

/** Seconds an own-domain send is held before the MTA worker picks it up,
 *  during which POST /v1/send/undo/:id can cancel it. registerUndoable()
 *  existed but had zero callers anywhere — undo-send was pure dead code. */
const UNDO_SEND_WINDOW_SECONDS = 10;
import { checkQuota, incrementQuota } from "../lib/quota.js";
import { indexEmail, searchEmails } from "@alecrae/shared";
import { enqueueEmail } from "@alecrae/ai-engine/embeddings/auto-indexer";
import { usageEnforcement } from "../middleware/usage.js";
import { idempotency } from "../middleware/idempotency.js";
import { getWarmupOrchestrator, WARMUP_LIMIT_EXCEEDED, ComplianceEngine } from "@alecrae/reputation";
import type { EmailMetadata } from "@alecrae/reputation";
import {
  validateCustomHeaders,
  HEADER_INJECTION_REJECTED,
} from "@alecrae/mta/lib";
import { scanAttachment, isSafe } from "@alecrae/security";
import { checkOutboundSpam } from "../lib/outbound-spam-gate.js";
import { buildTrackedUrl } from "../lib/tracking-link.js";
import { threadKeyFor } from "../lib/thread-key.js";
import { headerValue } from "../lib/header-safety.js";
import { checkSendAnomaly, recordSend } from "../lib/send-anomaly.js";
import {
  renderTemplate,
  validateVariables,
} from "../lib/template-renderer.js";

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

/**
 * Public base URL embedded in outbound mail — the List-Unsubscribe header and
 * every click-tracking link. The localhost fallback is for local dev ONLY;
 * `assertProductionEnv()` (lib/env.ts) requires API_URL to be set to an https,
 * non-localhost URL in production precisely so this fallback can never reach a
 * real recipient. A dead one-click unsubscribe is a Gmail/Yahoo bulk-sender
 * compliance failure, not a cosmetic bug.
 */
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
      // Signed, so the redirect endpoint can refuse a URL we never sent —
      // see lib/tracking-link.ts for why an open redirect here would be a
      // self-inflicted blocklisting.
      const trackedUrl = buildTrackedUrl(API_BASE_URL, emailId, url);
      return `<a ${prefix}href="${trackedUrl}"`;
    },
  );
}

/**
 * Build an RFC 5322 raw message from the API input.
 * Produces headers + body separated by a blank line.
 */
/**
 * Strip CR/LF/NUL from a value before it is written into a header line.
 *
 * Defence in depth. SendMessageSchema already rejects these characters in
 * `subject` and display names (see apps/api/src/types.ts), which is the real
 * gate — a caller gets a clear 422 rather than silently mangled output. This
 * exists so that any future caller reaching buildRawMessage by another route
 * still cannot inject a header. Without both, a subject like
 * "Hi\r\nBcc: victim@example.com" became a genuine Bcc header on a
 * DKIM-signed message sent from our own IP.
 */
// Implementation lives in lib/header-safety.ts and is shared with
// lib/agent-send.ts, which has its own RFC-5322 builder and was missed by the
// original fix. A second private copy is how the agent path stayed exposed.

function buildRawMessage(
  input: SendMessageInput,
  messageId: string,
  emailId?: string,
): string {
  const lines: string[] = [];

  const display = (r: { email: string; name?: string | undefined }): string =>
    r.name ? `${headerValue(r.name)} <${r.email}>` : r.email;

  // From
  lines.push(`From: ${display(input.from)}`);

  // To
  lines.push(`To: ${input.to.map(display).join(", ")}`);

  // Cc
  if (input.cc && input.cc.length > 0) {
    lines.push(`Cc: ${input.cc.map(display).join(", ")}`);
  }

  // Subject
  lines.push(`Subject: ${headerValue(input.subject ?? "")}`);

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
  /**
   * Must mirror the DB's `email_status` enum exactly.
   *
   * It did not. The list accepted "sending", which is not a database value and
   * therefore matched nothing, while REJECTING "sent", "processing" and
   * "dropped", which are. The practical effect: the Sent page calls
   * `?status=sent` and got a 422 on every load — the list it is built around
   * could not be requested at all. Found by a test written for a different bug
   * on the same page.
   */
  status: z
    .enum([
      "draft",
      "queued",
      "processing",
      "sent",
      "delivered",
      "bounced",
      "deferred",
      "dropped",
      "complained",
      "failed",
    ])
    .optional(),
  tag: z.string().optional(),
  /** Defaults to "inbox" (excludes trash, archive and spam) — pass "archive",
   *  "trash", "spam", "drafts", or "all" explicitly to see those. When
   *  `status=draft` is requested the default becomes "drafts", since drafts are
   *  never in the inbox and the old default silently returned nothing for them.
   *
   *  "spam" is what the inbound filter pipeline writes for a `quarantine`
   *  verdict. Without it here, quarantined mail would be filed correctly and
   *  then be unreachable through the API entirely — no worse-but-different than
   *  the bug where it landed in the inbox. */
  folder: z.enum(["inbox", "archive", "trash", "spam", "drafts", "all"]).optional(),
});

// ─── Shared send handler ───────────────────────────────────────────────────

import type { Context } from "hono";

async function handleSend(c: Context) {
  const input = getValidatedBody<SendMessageInput>(c);
  const auth = c.get("auth");
  const db = getDatabase();

  // ── 0a. message_id → Idempotency-Key promotion ───────────────────
  // If the caller passes message_id in the body (Crontech contract),
  // promote it to the standard Idempotency-Key header so the existing
  // Redis-backed idempotency middleware catches replays automatically.
  if (input.message_id && !c.req.header("Idempotency-Key")) {
    c.req.raw.headers.set("Idempotency-Key", input.message_id);
  }

  // ── 0b. Template resolution ───────────────────────────────────────
  // If template_id is provided, look it up by name (e.g. "crontech.verify-email"),
  // render with variables, and merge subject/html/text into the input.
  if (input.template_id) {
    const [tmpl] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.name, input.template_id),
          eq(templates.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!tmpl) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Template "${input.template_id}" not found for this account.`,
            code: "template_not_found",
          },
        },
        404,
      );
    }

    const vars = (input.variables ?? {}) as Record<string, unknown>;
    const allContent = [tmpl.subject, tmpl.htmlBody ?? "", tmpl.textBody ?? ""].join(" ");
    const missing = validateVariables(allContent, vars);
    if (missing.length > 0) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: `Missing template variables: ${missing.join(", ")}`,
            code: "missing_variables",
            missing,
          },
        },
        400,
      );
    }

    input.subject = input.subject ?? renderTemplate(tmpl.subject, vars);
    input.html = input.html ?? (tmpl.htmlBody ? renderTemplate(tmpl.htmlBody, vars) : undefined);
    input.text = input.text ?? (tmpl.textBody ? renderTemplate(tmpl.textBody, vars) : undefined);
  }

  // After template resolution, subject must exist
  if (!input.subject) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message: "Subject is required (either directly or from template).",
          code: "missing_subject",
        },
      },
      400,
    );
  }

  const resolvedSubject: string = input.subject;

  const id = generateId();
  const senderDomain = domainOf(input.from.email);
  const messageId = generateMessageId(senderDomain);

  // ── 0c. Connected account fast-path ──────────────────────────────
  // If the sender address belongs to a connected Gmail or Outlook account,
  // route through the provider API. Domain verification, warmup, and
  // suppression checks don't apply — the provider owns deliverability.
  let connectedAcct:
    | { id: string; provider: string; accessToken: string | null; refreshToken: string | null; tokenExpiresAt: Date | null }
    | undefined;
  try {
    [connectedAcct] = await db
      .select({
        id: connectedAccounts.id,
        provider: connectedAccounts.provider,
        accessToken: connectedAccounts.accessToken,
        refreshToken: connectedAccounts.refreshToken,
        tokenExpiresAt: connectedAccounts.tokenExpiresAt,
      })
      .from(connectedAccounts)
      .where(and(
        eq(connectedAccounts.email, input.from.email.toLowerCase()),
        eq(connectedAccounts.accountId, auth.accountId),
      ))
      .limit(1);
  } catch {
    // Degrade gracefully — fall through to domain-based MTA send
  }

  if (connectedAcct) {
    connectedAcct.accessToken = decryptSecretOrNull(connectedAcct.accessToken);
    connectedAcct.refreshToken = decryptSecretOrNull(connectedAcct.refreshToken);
  }

  if (connectedAcct?.accessToken) {
    if (connectedAcct.provider === "imap") {
      return c.json(
        { error: { type: "configuration_error", message: `IMAP account "${input.from.email}" does not support outbound sending via this API. Use the SMTP credentials configured on the account instead.`, code: "imap_send_not_supported" } },
        422,
      );
    }

    // Refresh the access token first if it's expired — previously the send
    // path used whatever was stored at connect time with no expiry check, so
    // sending broke ~1 hour after connecting and stayed broken until the user
    // manually reconnected the account.
    // No initializer: the catch below returns, so the only way past this block
    // is with a genuinely refreshed token. Seeding it with the stored one would
    // reintroduce the stale-token bug this exists to fix.
    let freshAccessToken: string;
    try {
      const fresh = await ensureFreshAccessToken({
        provider: connectedAcct.provider as "gmail" | "outlook",
        accessToken: connectedAcct.accessToken,
        refreshToken: connectedAcct.refreshToken,
        tokenExpiresAt: connectedAcct.tokenExpiresAt,
      });
      freshAccessToken = fresh.accessToken;
      if (fresh.refreshed) {
        await db
          .update(connectedAccounts)
          .set({
            accessToken: encryptSecret(fresh.accessToken),
            ...(fresh.refreshToken !== undefined ? { refreshToken: encryptSecret(fresh.refreshToken) } : {}),
            ...(fresh.tokenExpiresAt !== undefined ? { tokenExpiresAt: fresh.tokenExpiresAt } : {}),
            updatedAt: new Date(),
          })
          .where(eq(connectedAccounts.id, connectedAcct.id));
      }
    } catch (err) {
      return c.json(
        {
          error: "PROVIDER_SEND_FAILED",
          provider: connectedAcct.provider,
          message: `Reconnect the ${connectedAcct.provider} account — its access token expired and could not be refreshed: ${err instanceof Error ? err.message : String(err)}`,
        },
        502,
      );
    }

    // ── Abuse checks that apply even though the provider owns the IP ──
    //
    // This fast path returns before the domain-based pipeline's gates, which
    // is right for warm-up and per-ISP throttling — Google/Microsoft own the
    // sending IP and its reputation, not us. It is NOT right for these two:
    //
    //   * Spam content. If a compromised account blasts phishing through its
    //     connected Gmail using our API, Google can suspend OUR OAuth client
    //     — which would break Gmail for every customer at once. Our exposure
    //     here is the app registration, not an IP.
    //   * Hard bounces and complaints. A recipient who bounced or reported us
    //     is objectively undeliverable or hostile, whatever the transport.
    //
    // Deliberately NOT applied here: unsubscribe suppression, which is
    // list-scoped consent and should not silently block a personal 1:1 reply;
    // and per-account quota, which is a billing behaviour change and Craig's
    // call, not a side effect of a security fix. Both are flagged rather than
    // changed. Header-injection safety needs nothing here — it is enforced in
    // SendMessageSchema, so this path inherits it.
    const connectedRecipients = [
      ...input.to.map((r) => r.email),
      ...(input.cc ?? []).map((r) => r.email),
      ...(input.bcc ?? []).map((r) => r.email),
    ];

    const connectedSpamVerdict = await checkOutboundSpam({
      messageId,
      accountId: auth.accountId,
      from: input.from.email,
      to: connectedRecipients,
      subject: resolvedSubject,
      text: input.text,
      html: input.html,
    });

    if (!connectedSpamVerdict.allowed) {
      return c.json(
        {
          error: {
            type: "spam_content_rejected",
            message:
              "This message was refused because its content scored as spam. " +
              "Sending it would risk this platform's access to your mail provider.",
            code: "outbound_spam_rejected",
            score: connectedSpamVerdict.score,
            reasons: connectedSpamVerdict.reasons,
          },
        },
        422,
      );
    }

    // Bounce/complaint suppression across every domain this account owns.
    // suppression_lists.domain_id is NOT NULL, so there is no account-level
    // row to read — join through the caller's own domains instead.
    const hardSuppressed = await db
      .select({ email: suppressionLists.email, reason: suppressionLists.reason })
      .from(suppressionLists)
      .innerJoin(domains, eq(suppressionLists.domainId, domains.id))
      .where(
        and(
          eq(domains.accountId, auth.accountId),
          inArray(
            suppressionLists.email,
            connectedRecipients.map((e) => e.toLowerCase()),
          ),
          inArray(suppressionLists.reason, ["bounce", "complaint"]),
        ),
      )
      .limit(1);

    const blocked = hardSuppressed[0];
    if (blocked) {
      return c.json(
        {
          error: "RECIPIENT_SUPPRESSED",
          reason: blocked.reason === "bounce" ? "hard_bounce" : "complaint",
          address: blocked.email,
        },
        422,
      );
    }

    // Volume anomaly applies here too: a compromised account blasting through
    // its connected Gmail is exactly the pattern that gets our OAuth client
    // suspended, which would break Gmail for every customer at once.
    const connectedAnomaly = await checkSendAnomaly(auth.accountId);
    if (!connectedAnomaly.allowed) {
      return c.json(
        {
          error: {
            type: "send_volume_anomaly",
            message:
              "Sending is paused on this account: volume this hour is far above its " +
              "normal rate, which usually means credentials have been compromised. " +
              "Contact support to resume.",
            code: "send_volume_anomaly",
            sentThisHour: connectedAnomaly.currentHour,
            threshold: connectedAnomaly.threshold,
          },
        },
        429,
      );
    }

    let providerMessageId: string | undefined;

    if (connectedAcct.provider === "gmail") {
      const rawMsg = buildRawMessage(input, messageId, id);
      const raw = Buffer.from(rawMsg).toString("base64url");
      const gmailRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${freshAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      if (!gmailRes.ok) {
        const errBody = await gmailRes.json().catch(() => ({})) as { error?: { message?: string } };
        return c.json(
          { error: "PROVIDER_SEND_FAILED", provider: "gmail", message: errBody.error?.message ?? "Gmail API send failed" },
          502,
        );
      }
      const gmailBody = await gmailRes.json() as { id?: string };
      providerMessageId = gmailBody.id;
    } else if (connectedAcct.provider === "outlook") {
      const outlookRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${freshAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: resolvedSubject,
            body: { contentType: input.html ? "HTML" : "Text", content: input.html ?? input.text ?? "" },
            toRecipients: input.to.map((r) => ({ emailAddress: { address: r.email, ...(r.name ? { name: r.name } : {}) } })),
            ...(input.cc?.length ? { ccRecipients: input.cc.map((r) => ({ emailAddress: { address: r.email, ...(r.name ? { name: r.name } : {}) } })) } : {}),
          },
          saveToSentItems: true,
        }),
      });
      if (!outlookRes.ok) {
        const errBody = await outlookRes.json().catch(() => ({})) as { error?: { message?: string } };
        return c.json(
          { error: "PROVIDER_SEND_FAILED", provider: "outlook", message: errBody.error?.message ?? "Outlook API send failed" },
          502,
        );
      }
    }

    const now = new Date();
    await db.insert(emails).values({
      id,
      accountId: auth.accountId,
      domainId: null,
      messageId: providerMessageId ?? messageId,
      fromAddress: input.from.email,
      fromName: input.from.name ?? null,
      toAddresses: input.to.map((r) => ({ address: r.email, ...(r.name !== undefined ? { name: r.name } : {}) })),
      ccAddresses: input.cc ? input.cc.map((r) => ({ address: r.email, ...(r.name !== undefined ? { name: r.name } : {}) })) : null,
      bccAddresses: input.bcc ? input.bcc.map((r) => ({ address: r.email, ...(r.name !== undefined ? { name: r.name } : {}) })) : null,
      replyToAddress: input.replyTo?.email ?? null,
      replyToName: input.replyTo?.name ?? null,
      subject: resolvedSubject,
      textBody: input.text ?? null,
      htmlBody: input.html ?? null,
      status: "sent",
      source: connectedAcct.provider,
      tags: input.tags ?? [],
      isRead: true,
      createdAt: now,
      updatedAt: now,
      sentAt: now,
    });

    // Semantic search indexing — the MTA send path below already does this
    // via indexEmail() (Meilisearch); this fast-path skipped it entirely.
    enqueueEmail(id, auth.accountId);

    // Feed the volume-anomaly counter. Best-effort: the send already happened.
    void recordSend(auth.accountId);

    return c.json({ id, messageId: providerMessageId ?? messageId, status: "sent" as const }, 202);
  }

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

  // ── 1b2. Compliance check (CAN-SPAM / GDPR / CASL) ────────────────
  // Transactional emails (password reset, verification) are exempt from
  // marketing-only rules but must still pass basic compliance. The engine
  // is configured to exempt transactional by default.
  const complianceEngine = new ComplianceEngine({ exemptTransactional: true });
  const isTransactional = (input.tags ?? []).includes("transactional") ||
    (input.template_id ?? "").includes("verify") ||
    (input.template_id ?? "").includes("password-reset") ||
    (input.template_id ?? "").includes("magic-link");
  const headersMap = new Map<string, string>(
    Object.entries(input.headers ?? {}).map(([k, v]) => [k, String(v)]),
  );
  const complianceMeta: EmailMetadata = {
    from: input.from.email,
    to: allRecipientAddresses[0] ?? input.from.email,
    subject: resolvedSubject,
    headers: headersMap,
    hasUnsubscribeHeader: headersMap.has("list-unsubscribe"),
    hasUnsubscribeLink: false,
    hasPhysicalAddress: false,
    contentType: isTransactional ? "transactional" : "marketing",
    senderDomain: domainOf(input.from.email),
  };
  const complianceResult = complianceEngine.checkAll(complianceMeta);
  if (!complianceResult.ok) {
    return c.json(
      {
        error: {
          type: "compliance_error",
          message: complianceResult.error instanceof Error
            ? complianceResult.error.message
            : "Compliance check failed",
          code: "compliance_violation",
        },
      },
      422,
    );
  }
  const violations = complianceResult.value.flatMap((r) => r.violations ?? []);
  if (violations.length > 0) {
    return c.json(
      {
        error: {
          type: "compliance_error",
          message: `Email blocked: ${violations.map((v) => v.description ?? v.rule).join("; ")}`,
          code: "compliance_violation",
          violations,
        },
      },
      422,
    );
  }

  // ── 1b3. Outbound spam gate (reputation protection) ───────────────
  // Every check above protects the recipient or the customer; none of them
  // look at what the message actually says. An authenticated account — a
  // customer's own or a compromised one — could otherwise push phishing/419
  // content through this API and we would DKIM-sign it and relay it from our
  // sending IP. That is how the sending domain gets blocklisted, which is
  // slow and expensive to undo (cf. issue #105's open relay).
  const spamVerdict = await checkOutboundSpam({
    messageId,
    accountId: auth.accountId,
    from: input.from.email,
    to: allRecipientAddresses,
    subject: resolvedSubject,
    text: input.text,
    html: input.html,
  });

  if (!spamVerdict.allowed) {
    return c.json(
      {
        error: {
          type: "spam_content_rejected",
          message:
            "This message was refused because its content scored as spam. " +
            "If you believe this is wrong, contact support — sending it would " +
            "put the delivery reputation of every account on this platform at risk.",
          code: "outbound_spam_rejected",
          score: spamVerdict.score,
          reasons: spamVerdict.reasons,
        },
      },
      422,
    );
  }

  // ── 1b4. Send-volume anomaly (compromised-account detection) ──────
  // Content scoring above misses a blast of individually-bland messages.
  // This compares the account against its own recent history rather than a
  // flat ceiling — see lib/send-anomaly.ts and Known Issue #117.
  const anomaly = await checkSendAnomaly(auth.accountId);
  if (!anomaly.allowed) {
    return c.json(
      {
        error: {
          type: "send_volume_anomaly",
          message:
            "Sending is paused on this account: volume this hour is far above its " +
            "normal rate, which usually means credentials have been compromised. " +
            "Contact support to resume.",
          code: "send_volume_anomaly",
          sentThisHour: anomaly.currentHour,
          threshold: anomaly.threshold,
        },
      },
      429,
    );
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
      ...(r.name !== undefined ? { name: r.name } : {}),
    })),
    ccAddresses: input.cc
      ? input.cc.map((r) => ({
          address: r.email,
          ...(r.name !== undefined ? { name: r.name } : {}),
        }))
      : null,
    bccAddresses: input.bcc
      ? input.bcc.map((r) => ({
          address: r.email,
          ...(r.name !== undefined ? { name: r.name } : {}),
        }))
      : null,
    replyToAddress: input.replyTo?.email ?? null,
    replyToName: input.replyTo?.name ?? null,
    subject: resolvedSubject,
    textBody: input.text ?? null,
    htmlBody: input.html ?? null,
    customHeaders:
      Object.keys(sanitizedHeaders).length > 0 ? sanitizedHeaders : null,
    status: "queued",
    tags: input.tags ?? [],
    isRead: true,
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

  // An explicit scheduledAt already has its own cancel path
  // (DELETE /v1/send/schedule/:id) — only add the undo-send hold for
  // immediate sends.
  const isImmediateSend = !input.scheduledAt;
  let delay: number | undefined;
  if (input.scheduledAt) {
    const delayMs = new Date(input.scheduledAt).getTime() - Date.now();
    if (delayMs > 0) {
      delay = delayMs;
    }
  } else {
    delay = UNDO_SEND_WINDOW_SECONDS * 1000;
  }

  let sendJob: Awaited<ReturnType<typeof queue.add>> | undefined;
  try {
    sendJob = await queue.add(
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
  } catch (queueErr) {
    console.error("[messages] Failed to enqueue email — Redis unavailable?", queueErr);
    return c.json(
      { error: "Email saved but delivery queue unavailable. The MTA worker may not be running. Check REDIS_URL and alecrae-mta service." },
      503,
    );
  }

  let undoableUntil: string | undefined;
  if (isImmediateSend && sendJob) {
    const job = sendJob;
    registerUndoable(
      id,
      () => {
        void job.remove().catch((err: unknown) => {
          console.warn(`[messages] Failed to remove queued job for undone send ${id}:`, err);
        });
      },
      UNDO_SEND_WINDOW_SECONDS,
    );
    undoableUntil = new Date(Date.now() + UNDO_SEND_WINDOW_SECONDS * 1000).toISOString();
  }

  // ── 6b. Record send against warm-up counter (fire-and-forget) ────
  warmupOrchestrator.recordSend(domainRecord.id).catch(() => { /* fire-and-forget */ });

  // ── 6b2. Record against the send-volume anomaly counter ─────────
  void recordSend(auth.accountId);

  // ── 6c. Increment quota counter in Redis (fire-and-forget) ──────
  incrementQuota(auth.accountId).catch(() => {
    /* fire-and-forget */
  });

  // ── 7. Index in Meilisearch (fire-and-forget) ────────────────────
  indexEmail({
    id,
    accountId: auth.accountId,
    mailboxId: "sent",
    subject: resolvedSubject,
    textBody: input.text ?? null,
    fromAddress: input.from.email,
    fromName: input.from.name ?? null,
    toAddresses: input.to.map((r) => ({
      address: r.email,
      ...(r.name !== undefined ? { name: r.name } : {}),
    })),
    snippet: (input.text ?? input.html ?? "").replace(/<[^>]+>/g, " ").slice(0, 200),
    hasAttachments: false,
    status: "queued",
    createdAt: now,
  }).catch((err) => {
    console.warn("[messages] Meilisearch indexing failed:", err);
  });

  // ── 7b. Semantic search indexing (fire-and-forget) ────────────────
  enqueueEmail(id, auth.accountId);

  // ── 8. Increment account usage counter (fire-and-forget) ─────────
  db.update(accounts)
    .set({
      emailsSentThisPeriod: sql`${accounts.emailsSentThisPeriod} + 1`,
      updatedAt: now,
    })
    .where(eq(accounts.id, auth.accountId))
    .catch(() => { /* fire-and-forget */ });

  // ── 9. Broadcast real-time event (fire-and-forget) ────────────────
  try {
    const { getConnectionManager } = await import("../lib/realtime.js");
    getConnectionManager().broadcast(auth.accountId, {
      type: "email.sent",
      payload: {
        id,
        messageId,
        subject: resolvedSubject,
        to: allRecipients,
        status: "queued",
      },
      timestamp: now.toISOString(),
    });
  } catch {
    // Non-critical — don't fail the send if broadcast errors
  }

  // ── 10. Return response ───────────────────────────────────────────
  return c.json(
    { id, messageId, status: "queued" as const, ...(undoableUntil ? { undoableUntil } : {}) },
    202,
  );
}

// ─── Route handler ──────────────────────────────────────────────────────────

const messages = new Hono();

const sendMiddleware = [idempotency(), requireScope("messages:send"), usageEnforcement, validateBody(SendMessageSchema)] as const;

// POST /v1/messages/send — Send an email (production pipeline)
messages.post("/send", ...sendMiddleware, handleSend);

// POST /v1/messages — Alias for /send
messages.post("/", ...sendMiddleware, handleSend);

// ─── Drafts ─────────────────────────────────────────────────────────────────
//
// There was no draft persistence anywhere in the API. Compose's "Save Draft"
// button only set the string "Draft saved locally" — nothing was written, not
// even locally, so a user's unsent work was silently lost. The Drafts page
// meanwhile listed `status: "queued"`, which is outbound mail waiting to go
// out, not drafts.
//
// Drafts are ordinary `emails` rows with status "draft" and folder "drafts"
// (`folder` is a plain text column, and the email_status enum has always had
// "draft" — CLAUDE.md known issue #8 says otherwise and is stale). They never
// enter the send pipeline: nothing queues, signs or delivers a draft row.

const DraftRecipient = z.object({
  email: z.string().email(),
  name: z.string().max(255).optional(),
});

const DraftSchema = z
  .object({
    /** Sender address. Falls back to the account's first verified mailbox. */
    from: DraftRecipient.optional(),
    to: z.array(DraftRecipient).max(100).default([]),
    cc: z.array(DraftRecipient).max(100).default([]),
    bcc: z.array(DraftRecipient).max(100).default([]),
    subject: z.string().max(998).default(""),
    text: z.string().max(1_000_000).optional(),
    html: z.string().max(1_000_000).optional(),
  })
  .refine(
    (v) =>
      v.to.length > 0 ||
      v.cc.length > 0 ||
      v.bcc.length > 0 ||
      v.subject.trim().length > 0 ||
      (v.text ?? "").trim().length > 0 ||
      (v.html ?? "").trim().length > 0,
    { message: "A draft needs at least one recipient, a subject, or a body" },
  );

type DraftInput = z.infer<typeof DraftSchema>;

function draftAddresses(list: DraftInput["to"]): { name?: string; address: string }[] {
  return list.map((r) => ({ address: r.email, ...(r.name !== undefined ? { name: r.name } : {}) }));
}

/** Column values shared by draft create and update. */
function draftValues(
  input: DraftInput,
  now: Date,
): {
  toAddresses: { name?: string; address: string }[];
  ccAddresses: { name?: string; address: string }[] | null;
  bccAddresses: { name?: string; address: string }[] | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  updatedAt: Date;
} {
  return {
    toAddresses: draftAddresses(input.to),
    ccAddresses: input.cc.length > 0 ? draftAddresses(input.cc) : null,
    bccAddresses: input.bcc.length > 0 ? draftAddresses(input.bcc) : null,
    subject: input.subject,
    textBody: input.text ?? null,
    htmlBody: input.html ?? null,
    updatedAt: now,
  };
}

// POST /v1/messages/drafts — Create a draft
messages.post(
  "/drafts",
  requireScope("messages:write"),
  validateBody(DraftSchema),
  async (c) => {
    const input = getValidatedBody<DraftInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const now = new Date();
    const id = crypto.randomUUID();

    await db.insert(emails).values({
      id,
      accountId: auth.accountId,
      domainId: null,
      // messageId is NOT NULL and unique per (accountId, messageId). A draft
      // has no RFC 822 Message-ID yet; a synthetic, always-fresh one satisfies
      // the constraint without colliding.
      messageId: `draft-${id}@drafts.alecrae.local`,
      fromAddress: input.from?.email ?? "",
      fromName: input.from?.name ?? null,
      status: "draft",
      folder: "drafts",
      source: "outbound",
      isRead: true,
      tags: [],
      createdAt: now,
      ...draftValues(input, now),
    });

    return c.json(
      { data: { id, createdAt: now.toISOString(), updatedAt: now.toISOString() } },
      201,
    );
  },
);

// PUT /v1/messages/drafts/:id — Update an existing draft
messages.put(
  "/drafts/:id",
  requireScope("messages:write"),
  validateBody(DraftSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<DraftInput>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: emails.id, status: emails.status })
      .from(emails)
      .where(and(eq(emails.id, id), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { type: "not_found", message: `Draft ${id} not found`, code: "draft_not_found" } },
        404,
      );
    }

    // Refuse to rewrite a message that has already entered the send pipeline —
    // otherwise this endpoint could mutate sent or in-flight mail.
    if (existing.status !== "draft") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Message ${id} is not a draft (status: ${existing.status}) and cannot be edited`,
            code: "not_a_draft",
          },
        },
        409,
      );
    }

    const now = new Date();
    await db
      .update(emails)
      .set({
        ...draftValues(input, now),
        ...(input.from !== undefined
          ? { fromAddress: input.from.email, fromName: input.from.name ?? null }
          : {}),
      })
      .where(and(eq(emails.id, id), eq(emails.accountId, auth.accountId)));

    return c.json({ data: { id, updatedAt: now.toISOString() } });
  },
);

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
        ...(mailbox !== undefined ? { mailboxId: mailbox } : {}),
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
        /** Same derivation as the list, so the two never disagree. */
        threadId: threadKeyFor(emailRecord),
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
        isRead: emailRecord.isRead,
        isStarred: emailRecord.isStarred,
        folder: emailRecord.folder,
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
      PaginationParams & {
        status?: string;
        tag?: string;
        folder?: "inbox" | "archive" | "trash" | "spam" | "drafts" | "all";
      }
    >(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(emails.accountId, auth.accountId)];

    // Default to "inbox" — previously nothing filtered on folder/status at
    // all, so archiving or deleting a message never actually removed it from
    // the list; it just came back on the next reload marked unread.
    const folder = query.folder ?? (query.status === "draft" ? "drafts" : "inbox");
    if (folder !== "all") {
      conditions.push(eq(emails.folder, folder));
    }

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
        // Needed to derive the conversation key — see lib/thread-key.ts. The
        // list previously exposed no threading at all, so the inbox muted
        // threads by message id and every reply arrived unmuted.
        inReplyTo: emails.inReplyTo,
        references: emails.references,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        ccAddresses: emails.ccAddresses,
        subject: emails.subject,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
        status: emails.status,
        tags: emails.tags,
        isRead: emails.isRead,
        isStarred: emails.isStarred,
        folder: emails.folder,
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
    const lastPageItem = page[page.length - 1];
    const nextCursor =
      hasMore && lastPageItem
        ? lastPageItem.createdAt.toISOString()
        : null;

    // First-open time per message, from the real tracking events.
    //
    // The Sent page's "Opened" badge read `tags.includes("opened")`, and
    // nothing has ever written that tag — the tracking pixel records an
    // `events` row of type "email.opened" instead. So the badge said "Not
    // opened" for every message forever, including ones that had been.
    //
    // Resolved with one extra query per page rather than a join on the hot
    // list query: bounded by page size, and it keeps `events` as the single
    // source of truth instead of denormalising an "opened" tag that could
    // then drift.
    const openedAtByEmail = new Map<string, string>();
    if (page.length > 0) {
      try {
        const openRows = await db
          .select({
            emailId: events.emailId,
            firstOpenedAt: sql<Date>`min(${events.createdAt})`,
          })
          .from(events)
          .where(
            and(
              eq(events.type, "email.opened"),
              inArray(
                events.emailId,
                page.map((r) => r.id),
              ),
            ),
          )
          .groupBy(events.emailId);

        for (const r of openRows) {
          if (r.emailId && r.firstOpenedAt) {
            openedAtByEmail.set(r.emailId, new Date(r.firstOpenedAt).toISOString());
          }
        }
      } catch (err) {
        // Open data is supplementary — a failure here must not break the list.
        console.error(
          "[messages] Failed to load open events:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // Labels were write-only: two endpoints applied them and NO endpoint ever
    // returned which labels an email had, so applying one had no visible
    // effect anywhere (issue #76c). One bounded query per page, same shape as
    // the openedAt lookup above, rather than a join on the hot list query.
    const labelsByEmail = new Map<string, { id: string; name: string; color: string }[]>();
    if (page.length > 0) {
      try {
        const labelRows = await db
          .select({
            emailId: emailLabels.emailId,
            id: labels.id,
            name: labels.name,
            color: labels.color,
          })
          .from(emailLabels)
          .innerJoin(labels, eq(emailLabels.labelId, labels.id))
          .where(
            inArray(
              emailLabels.emailId,
              page.map((row) => row.id),
            ),
          );

        for (const row of labelRows) {
          const list = labelsByEmail.get(row.emailId) ?? [];
          list.push({ id: row.id, name: row.name, color: row.color });
          labelsByEmail.set(row.emailId, list);
        }
      } catch (err) {
        // Wrapped for the same reason as openedAt: label data is useful, but
        // losing it must never take down the inbox itself.
        console.warn(
          "[messages] label lookup failed, returning messages without labels:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    const data = page.map((row) => ({
      id: row.id,
      messageId: row.messageId,
      /** Conversation key — shared by every message in a reply chain. */
      threadId: threadKeyFor(row),
      /** Labels applied to this message, empty when none. */
      labels: labelsByEmail.get(row.id) ?? [],
      from: { email: row.fromAddress, name: row.fromName },
      to: row.toAddresses,
      cc: row.ccAddresses,
      subject: row.subject,
      preview: (row.textBody ?? row.htmlBody ?? "").slice(0, 256).replace(/<[^>]+>/g, ""),
      status: row.status,
      tags: row.tags,
      isRead: row.isRead,
      isStarred: row.isStarred,
      folder: row.folder,
      hasAttachments: false,
      /** When the recipient first opened this message, or null if never. */
      openedAt: openedAtByEmail.get(row.id) ?? null,
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

// PATCH /v1/messages/:id — Update message (read/starred/folder state)
const PatchMessageSchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    /** "inbox" restores from archive/trash; "archive"/"trash" moves it there. */
    folder: z.enum(["inbox", "archive", "trash"]).optional(),
  })
  .refine((v) => v.isRead !== undefined || v.isStarred !== undefined || v.folder !== undefined, {
    message: "At least one of isRead, isStarred, or folder is required",
  });

messages.patch(
  "/:id",
  requireScope("messages:read"),
  validateBody(PatchMessageSchema),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();
    const input = getValidatedBody<z.infer<typeof PatchMessageSchema>>(c);

    const [existing] = await db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.id, id), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { type: "not_found", message: `Message ${id} not found`, code: "message_not_found" } },
        404,
      );
    }

    await db
      .update(emails)
      .set({
        ...(input.isRead !== undefined ? { isRead: input.isRead } : {}),
        ...(input.isStarred !== undefined ? { isStarred: input.isStarred } : {}),
        ...(input.folder !== undefined ? { folder: input.folder } : {}),
        updatedAt: new Date(),
      })
      .where(eq(emails.id, id));

    return c.json({ data: { id, updated: true } });
  },
);

// DELETE /v1/messages/:id — Move a message to the trash folder
messages.delete(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.id, id), eq(emails.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        { error: { type: "not_found", message: `Message ${id} not found`, code: "message_not_found" } },
        404,
      );
    }

    await db.update(emails).set({ folder: "trash", updatedAt: new Date() }).where(eq(emails.id, id));

    return c.json({ data: { id, deleted: true } });
  },
);

// Standalone /v1/send router — mounts the same send handler at root
const unifiedSend = new Hono();
unifiedSend.post("/", ...sendMiddleware, handleSend);

export { messages, unifiedSend };
