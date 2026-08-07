/**
 * PostgreSQL-backed email storage for inbound emails.
 * Implements the EmailStore interface using @alecrae/db (Drizzle ORM).
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getDatabase, emails, attachments, domains } from "@alecrae/db";
import type {
  ParsedEmail,
  StoredEmail,
  ResolvedRecipient,
  FilterVerdict,
} from "../types.js";
import type { EmailStore } from "./store.js";
import { indexEmail } from "@alecrae/shared";

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSnippet(
  text?: string,
  html?: string,
  maxLength = 200,
): string {
  const source =
    text ?? html?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ") ?? "";
  return source.trim().slice(0, maxLength);
}

/**
 * Resolve the `domains.id` primary key for a given domain name.
 * Falls back to the domain name string if not found (for development
 * environments without seeded domain rows).
 */
async function resolveDomainId(
  db: ReturnType<typeof getDatabase>,
  domainName: string,
  accountId: string,
): Promise<string> {
  try {
    const [row] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(and(eq(domains.domain, domainName), eq(domains.accountId, accountId)))
      .limit(1);

    if (row) return row.id;

    // Try without accountId filter (the domain may belong to a different account
    // that shares the platform).
    const [anyRow] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.domain, domainName))
      .limit(1);

    if (anyRow) return anyRow.id;
  } catch (e) {
    console.warn(`[PostgresEmailStore] Domain lookup failed for ${domainName}:`, e);
  }

  // Auto-create the domain record so the FK constraint is satisfied.
  const domainId = generateId();
  try {
    await db.insert(domains).values({
      id: domainId,
      accountId,
      domain: domainName,
      verificationStatus: "pending",
      isActive: true,
    });
    return domainId;
  } catch {
    // Race condition or other error — try one more lookup
    const [row] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.domain, domainName))
      .limit(1);
    if (row) return row.id;
  }

  // Last resort: return generated id (insert may fail if FK enforced)
  return domainId;
}

export class PostgresEmailStore implements EmailStore {
  async store(
    email: ParsedEmail,
    recipient: ResolvedRecipient,
    verdict: FilterVerdict,
  ): Promise<StoredEmail> {
    const db = getDatabase();
    const id = generateId();
    const now = new Date();

    // Determine mailbox based on verdict.
    //
    // `folder` (issue #88's real column) is what `GET /v1/messages` filters on;
    // it defaults to "inbox" at the schema level, so a row that sets only the
    // legacy `tags` entry lands in the user's inbox no matter what the filter
    // pipeline decided. Both must be written from the same value or quarantined
    // mail is detected correctly and then filed as if it were clean.
    //
    // "rejected" is unreachable from either ingress path today — both the SMTP
    // handler and the HTTP webhook reject before calling store() — but it is
    // mapped rather than collapsed into "spam": if a caller ever does store a
    // rejected message, it must not appear in a mailbox listing, and no listable
    // folder is the honest place for a message we told the sender we refused.
    let mailboxId = "inbox";
    if (verdict.action === "quarantine") mailboxId = "spam";
    if (verdict.action === "reject") mailboxId = "rejected";

    // Extract the primary from address
    const fromAddr = Array.isArray(email.from) ? email.from[0] : email.from;
    const fromAddress = fromAddr?.address ?? "unknown@unknown";
    const fromName = fromAddr?.name ?? null;

    // Resolve the domainId FK from the recipient's domain name
    const recipientDomain = recipient.resolvedAddress.split("@")[1] ?? "unknown";
    const domainId = await resolveDomainId(db, recipientDomain, recipient.accountId);

    // Tags carry the verdict-derived folder first (issue #153 — `folder` and
    // `tags[0]` are written from the same value so they cannot disagree),
    // plus the recipient's routed mailbox id when it differs, so a message
    // delivered to two provisioned mailboxes on one account records both.
    const initialTags =
      recipient.mailboxId && recipient.mailboxId !== mailboxId
        ? [mailboxId, recipient.mailboxId]
        : [mailboxId];

    const messageId = email.messageId ?? `<${id}@inbound>`;

    // Persist to the emails table.
    //
    // The emails table has a UNIQUE index on (account_id, message_id).
    // Delivering one message to two recipients on the same account calls
    // store() twice with the same pair — a plain insert throws on the second
    // call, which used to fail the whole delivery, answer the sender 451,
    // and make them redeliver forever. `onConflictDoNothing` targets that
    // index so a concurrent insert can never throw either (the race is
    // resolved by the database, not a read-then-write); when the row already
    // exists we MERGE the new recipient's mailbox tag into it below.
    const inserted = await db
      .insert(emails)
      .values({
        id,
        accountId: recipient.accountId,
        domainId,
        messageId,
      fromAddress,
      fromName,
      toAddresses: email.to.map((a) => {
        const entry: { address: string; name?: string } = { address: a.address };
        if (a.name !== undefined) entry.name = a.name;
        return entry;
      }),
      ccAddresses: email.cc?.map((a) => {
        const entry: { address: string; name?: string } = { address: a.address };
        if (a.name !== undefined) entry.name = a.name;
        return entry;
      }) ?? null,
      subject: email.subject ?? "(no subject)",
      textBody: email.text ?? null,
      htmlBody: email.html ?? null,
        inReplyTo: email.inReplyTo ?? null,
        references: email.references.length > 0 ? email.references : null,
        status: "delivered",
        // Provenance: the schema documents "inbound" for mail received via
        // our MTA (packages/db/src/schema/emails.ts). Omitting it left every
        // received message indistinguishable from a legacy row.
        source: "inbound",
        folder: mailboxId,
        tags: initialTags,
        metadata: {
          spamScore: String(verdict.score ?? 0),
          filterAction: verdict.action,
          receivedAt: now.toISOString(),
        },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: [emails.accountId, emails.messageId] })
      .returning({ id: emails.id });

    if (inserted.length === 0) {
      // A row for (accountId, messageId) already exists — either an earlier
      // recipient in this same delivery or a concurrent worker. Merge this
      // recipient's mailbox tag into the existing row (without duplicating)
      // and report the existing row: the delivery as a whole must succeed.
      // The conflicting row is committed by the time onConflictDoNothing
      // returns, so the follow-up read sees it.
      const [existing] = await db
        .select({ id: emails.id, tags: emails.tags })
        .from(emails)
        .where(
          and(
            eq(emails.accountId, recipient.accountId),
            eq(emails.messageId, messageId),
          ),
        )
        .limit(1);

      if (!existing) {
        // Should be unreachable (conflict implies a visible committed row);
        // surface it rather than silently claiming delivery.
        throw new Error(
          `[PostgresEmailStore] Insert conflicted for (${recipient.accountId}, ${messageId}) but no existing row was found`,
        );
      }

      const existingTags = existing.tags ?? [];
      const mergedTags = [...existingTags];
      for (const tag of initialTags) {
        if (!mergedTags.includes(tag)) mergedTags.push(tag);
      }
      if (mergedTags.length !== existingTags.length) {
        await db
          .update(emails)
          .set({ tags: mergedTags, updatedAt: now })
          .where(eq(emails.id, existing.id));
      }

      console.log(
        `[PostgresEmailStore] Merged delivery for ${recipient.resolvedAddress} into existing email ${existing.id} (tags: ${mergedTags.join(", ")})`,
      );

      // merged=true: the email.received event for this (accountId, messageId)
      // was emitted by whichever delivery inserted the row — the caller must
      // not emit a second one (see events/received-event.ts).
      return this.buildStoredEmail(existing.id, email, recipient, verdict, mailboxId, now, true);
    }

    // Store attachments if any
    if (email.attachments && email.attachments.length > 0) {
      const attachmentRows = email.attachments.map((att) => ({
        id: generateId(),
        emailId: id,
        filename: att.filename ?? "unnamed",
        contentType: att.contentType ?? "application/octet-stream",
        size: att.size ?? 0,
        storageKey: `inbound/${id}/${att.filename ?? generateId()}`,
        contentId: att.contentId ?? null,
        disposition: "attachment" as const,
      }));

      await db.insert(attachments).values(attachmentRows);
    }

    // Index in Meilisearch (fire-and-forget — don't block storage)
    indexEmail({
      id,
      accountId: recipient.accountId,
      mailboxId,
      subject: email.subject ?? "(no subject)",
      textBody: email.text ?? null,
      fromAddress,
      fromName,
      toAddresses: email.to.map((a) => {
        const entry: { address: string; name?: string } = { address: a.address };
        if (a.name !== undefined) entry.name = a.name;
        return entry;
      }),
      snippet: generateSnippet(email.text, email.html),
      hasAttachments: (email.attachments ?? []).length > 0,
      status: "delivered",
      createdAt: now,
    }).catch((err) => {
      console.warn("[PostgresEmailStore] Meilisearch indexing failed:", err);
    });

    // Build the StoredEmail return object
    return this.buildStoredEmail(id, email, recipient, verdict, mailboxId, now);
  }

  private buildStoredEmail(
    id: string,
    email: ParsedEmail,
    recipient: ResolvedRecipient,
    verdict: FilterVerdict,
    mailboxId: string,
    now: Date,
    merged = false,
  ): StoredEmail {
    const fromAddr = Array.isArray(email.from) ? email.from[0] : email.from;
    return {
      id,
      merged,
      accountId: recipient.accountId,
      mailboxId,
      messageId: email.messageId ?? `<${id}@inbound>`,
      threadId: id,
      from: fromAddr ?? { address: "unknown@unknown" },
      to: email.to,
      cc: email.cc ?? [],
      bcc: [],
      replyTo: email.replyTo,
      subject: email.subject ?? "(no subject)",
      snippet: generateSnippet(email.text, email.html),
      textBody: email.text,
      htmlBody: email.html,
      attachments: (email.attachments ?? []).map((att) => ({
        id: generateId(),
        filename: att.filename ?? "unnamed",
        contentType: att.contentType ?? "application/octet-stream",
        size: att.size ?? 0,
        contentId: att.contentId,
      })),
      hasAttachments: (email.attachments ?? []).length > 0,
      size: email.rawSize ?? (email.text?.length ?? 0) + (email.html?.length ?? 0),
      receivedAt: now,
      internalDate: email.date ?? now,
      flags: new Set(["\\Recent"]),
      labels: [mailboxId],
      headers: email.headers ?? [],
      filterVerdict: verdict,
    };
  }

  async getById(
    accountId: string,
    emailId: string,
  ): Promise<StoredEmail | null> {
    const db = getDatabase();
    const [row] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)))
      .limit(1);

    if (!row) return null;

    return this.rowToStoredEmail(row);
  }

  async getByMessageId(
    accountId: string,
    messageId: string,
  ): Promise<StoredEmail | null> {
    const db = getDatabase();
    const [row] = await db
      .select()
      .from(emails)
      .where(
        and(eq(emails.messageId, messageId), eq(emails.accountId, accountId)),
      )
      .limit(1);

    if (!row) return null;
    return this.getById(accountId, row.id);
  }

  async search(query: {
    accountId: string;
    limit?: number;
    offset?: number;
  }): Promise<{ emails: StoredEmail[]; total: number }> {
    const db = getDatabase();
    const limit = query.limit ?? 50;

    const rows = await db
      .select()
      .from(emails)
      .where(eq(emails.accountId, query.accountId))
      .orderBy(desc(emails.createdAt))
      .limit(limit);

    const mapped = rows.map((row) => this.rowToStoredEmail(row));

    return { emails: mapped, total: mapped.length };
  }

  async updateFlags(
    accountId: string,
    emailId: string,
    flags: Set<string>,
  ): Promise<void> {
    const db = getDatabase();
    await db
      .update(emails)
      .set({
        metadata: sql`jsonb_set(COALESCE(${emails.metadata}, '{}'::jsonb), '{flags}', ${JSON.stringify([...flags])}::jsonb)`,
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)));
  }

  async updateLabels(
    accountId: string,
    emailId: string,
    labels: string[],
  ): Promise<void> {
    const db = getDatabase();
    await db
      .update(emails)
      .set({
        tags: labels,
        updatedAt: new Date(),
      })
      .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)));
  }

  private rowToStoredEmail(row: {
    id: string;
    accountId: string;
    messageId: string;
    fromAddress: string;
    fromName: string | null;
    toAddresses: unknown;
    ccAddresses: unknown;
    subject: string;
    textBody: string | null;
    htmlBody: string | null;
    tags: unknown;
    customHeaders: unknown;
    createdAt: Date;
  }): StoredEmail {
    return {
      id: row.id,
      accountId: row.accountId,
      mailboxId: (row.tags as string[])?.[0] ?? "inbox",
      messageId: row.messageId,
      threadId: row.id,
      from: { address: row.fromAddress, name: row.fromName ?? undefined },
      to: (row.toAddresses as { address: string; name?: string }[]) ?? [],
      cc: (row.ccAddresses as { address: string; name?: string }[]) ?? [],
      bcc: [],
      subject: row.subject,
      snippet: (row.textBody ?? row.htmlBody ?? "").slice(0, 200),
      textBody: row.textBody ?? undefined,
      htmlBody: row.htmlBody ?? undefined,
      attachments: [],
      hasAttachments: false,
      size: (row.textBody?.length ?? 0) + (row.htmlBody?.length ?? 0),
      receivedAt: row.createdAt,
      internalDate: row.createdAt,
      flags: new Set<string>(),
      labels: (row.tags as string[]) ?? [],
      headers: (row.customHeaders as Record<string, string>) ?? {},
    };
  }

  async delete(accountId: string, emailId: string): Promise<boolean> {
    const db = getDatabase();
    await db
      .delete(emails)
      .where(and(eq(emails.id, emailId), eq(emails.accountId, accountId)));

    return true;
  }

  getStats(): {
    totalEmails: number;
    totalSize: number;
    accountCount: number;
    mailboxCount: number;
  } {
    return {
      totalEmails: 0,
      totalSize: 0,
      accountCount: 0,
      mailboxCount: 0,
    };
  }
}
