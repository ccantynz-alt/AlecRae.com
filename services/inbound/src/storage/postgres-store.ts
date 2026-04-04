/**
 * PostgreSQL-backed email storage for inbound emails.
 * Implements the EmailStore interface using @emailed/db (Drizzle ORM).
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { getDatabase, emails, attachments } from "@emailed/db";
import type {
  ParsedEmail,
  StoredEmail,
  ResolvedRecipient,
  FilterVerdict,
} from "../types.js";
import type { EmailStore } from "./store.js";

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

export class PostgresEmailStore implements EmailStore {
  async store(
    email: ParsedEmail,
    recipient: ResolvedRecipient,
    verdict: FilterVerdict,
  ): Promise<StoredEmail> {
    const db = getDatabase();
    const id = generateId();
    const now = new Date();

    // Determine mailbox based on verdict
    let mailboxId = "inbox";
    if (verdict.action === "quarantine") mailboxId = "spam";
    if (verdict.action === "reject") mailboxId = "rejected";

    // Extract the primary from address
    const fromAddr = Array.isArray(email.from) ? email.from[0] : email.from;
    const fromAddress = fromAddr?.address ?? "unknown@unknown";
    const fromName = fromAddr?.name ?? null;

    // Derive domainId from the recipient's resolved address domain
    const recipientDomain = recipient.resolvedAddress.split("@")[1] ?? "unknown";

    // Persist to the emails table
    await db.insert(emails).values({
      id,
      accountId: recipient.accountId,
      domainId: recipientDomain,
      messageId: email.messageId ?? `<${id}@inbound>`,
      fromAddress,
      fromName,
      toAddresses: email.to.map((a) => ({
        address: a.address,
        name: a.name,
      })),
      ccAddresses: email.cc?.map((a) => ({
        address: a.address,
        name: a.name,
      })) ?? null,
      subject: email.subject ?? "(no subject)",
      textBody: email.text ?? null,
      htmlBody: email.html ?? null,
      inReplyTo: email.inReplyTo ?? null,
      references: email.references.length > 0 ? email.references : null,
      status: "delivered",
      tags: [mailboxId],
      metadata: {
        spamScore: String(verdict.score ?? 0),
        filterAction: verdict.action,
        receivedAt: now.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    });

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

    // Build the StoredEmail return object
    const stored: StoredEmail = {
      id,
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

    return stored;
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
      to: (row.toAddresses as Array<{ address: string; name?: string }>) ?? [],
      cc: (row.ccAddresses as Array<{ address: string; name?: string }>) ?? [],
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
    const result = await db
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
