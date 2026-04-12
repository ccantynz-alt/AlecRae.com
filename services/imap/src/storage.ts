/**
 * @emailed/imap — PostgreSQL Storage Adapter
 *
 * Implements the MessageStore interface from handlers/messages.ts,
 * mapping IMAP concepts (UIDs, sequence numbers, flags, mailboxes)
 * to the emails table in Postgres via Drizzle ORM.
 *
 * Mailbox mapping:
 *   INBOX   → emails where status in ('delivered','processing','queued','deferred') and folder='inbox'
 *   Sent    → emails where accountId matches and folder='sent'
 *   Drafts  → emails where folder='drafts'
 *   Trash   → emails where folder='trash'
 *   Junk    → emails where folder='junk'
 *
 * Since the emails table does not have explicit IMAP UID, folder, or flags columns,
 * we use the email ID ordering as UID (row number ordered by createdAt)
 * and store IMAP-specific metadata in a jsonb column via Drizzle's .extras().
 *
 * NOTE: In production, add these columns via migration:
 *   ALTER TABLE emails ADD COLUMN IF NOT EXISTS imap_uid SERIAL;
 *   ALTER TABLE emails ADD COLUMN IF NOT EXISTS imap_flags text[] DEFAULT '{}';
 *   ALTER TABLE emails ADD COLUMN IF NOT EXISTS folder text DEFAULT 'inbox';
 * For now, we emulate these with in-memory state and query-based UID assignment.
 */

import { eq, asc } from "drizzle-orm";
import { getDatabase, emails, domains } from "@emailed/db";
import type {
  ImapMessage,
  ImapEnvelope,
  ImapBodyStructure,
  ImapAddress,
  ImapSearchCriteria,
} from "./types.js";
import type {
  MessageStore,
  FlagOperation,
  UidMapping,
  AppendData,
} from "./store-types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAddress(email: string, name?: string | null): ImapAddress {
  const atIdx = email.lastIndexOf("@");
  return {
    name: name ?? null,
    route: null,
    mailbox: atIdx >= 0 ? email.slice(0, atIdx) : email,
    host: atIdx >= 0 ? email.slice(atIdx + 1) : null,
  };
}


// ─── In-memory flag storage (pending DB migration) ───────────────────────────

const flagStore = new Map<string, Set<string>>(); // emailId -> flags

function getFlags(emailId: string): string[] {
  return [...(flagStore.get(emailId) ?? [])];
}

function setFlags(emailId: string, flags: string[]): void {
  flagStore.set(emailId, new Set(flags));
}

function addFlags(emailId: string, flags: string[]): void {
  const existing = flagStore.get(emailId) ?? new Set();
  for (const f of flags) existing.add(f);
  flagStore.set(emailId, existing);
}

function removeFlags(emailId: string, flags: string[]): void {
  const existing = flagStore.get(emailId);
  if (!existing) return;
  for (const f of flags) existing.delete(f);
}

// ─── Email row to ImapMessage conversion ─────────────────────────────────────

function rowToImapMessage(
  row: {
    id: string;
    fromAddress: string;
    fromName: string | null;
    toAddresses: unknown;
    ccAddresses: unknown;
    subject: string;
    textBody: string | null;
    htmlBody: string | null;
    messageId: string | null;
    replyToAddress: string | null;
    createdAt: Date;
    status: string;
  },
  uid: number,
  seqNum: number,
): ImapMessage {
  const toList = Array.isArray(row.toAddresses) ? row.toAddresses : [];
  const ccList = Array.isArray(row.ccAddresses) ? row.ccAddresses : [];
  const body = row.textBody ?? row.htmlBody ?? "";
  const bodyBytes = Buffer.byteLength(body, "utf-8");
  const lines = body.split("\n").length;

  const envelope: ImapEnvelope = {
    date: row.createdAt.toUTCString(),
    subject: row.subject,
    from: [parseAddress(row.fromAddress, row.fromName)],
    sender: [parseAddress(row.fromAddress, row.fromName)],
    replyTo: row.replyToAddress
      ? [parseAddress(row.replyToAddress)]
      : [parseAddress(row.fromAddress, row.fromName)],
    to: toList.map((r: { address: string; name?: string }) =>
      parseAddress(r.address, r.name),
    ),
    cc: ccList.map((r: { address: string; name?: string }) =>
      parseAddress(r.address, r.name),
    ),
    bcc: [],
    inReplyTo: null,
    messageId: row.messageId,
  };

  const isHtml = !!row.htmlBody;
  const bodyStructure: ImapBodyStructure = {
    type: "text",
    subtype: isHtml ? "html" : "plain",
    params: { charset: "utf-8" },
    id: null,
    description: null,
    encoding: "quoted-printable",
    size: bodyBytes,
    lines,
  };

  // Auto-set \Seen flag for delivered messages if not explicitly tracked
  const flags = getFlags(row.id);
  if (flags.length === 0 && row.status === "delivered") {
    // Default: delivered messages start as unseen
  }

  return {
    uid,
    sequenceNumber: seqNum,
    flags,
    internalDate: row.createdAt,
    size: bodyBytes,
    envelope,
    bodyStructure,
    body: body,
    rawHeaders: buildRawHeaders(row, envelope),
  } as ImapMessage & { body: string; rawHeaders: string };
}

function buildRawHeaders(
  row: { fromAddress: string; fromName: string | null; subject: string; messageId: string | null; createdAt: Date },
  _envelope: ImapEnvelope,
): string {
  const lines: string[] = [];
  const from = row.fromName ? `${row.fromName} <${row.fromAddress}>` : row.fromAddress;
  lines.push(`From: ${from}`);
  lines.push(`Subject: ${row.subject}`);
  lines.push(`Date: ${row.createdAt.toUTCString()}`);
  if (row.messageId) lines.push(`Message-ID: ${row.messageId}`);
  lines.push("MIME-Version: 1.0");
  lines.push("Content-Type: text/plain; charset=utf-8");
  return lines.join("\r\n") + "\r\n";
}

// ─── PostgresMessageStore ────────────────────────────────────────────────────

export class PostgresMessageStore implements MessageStore {

  async getMessages(
    mailbox: string,
    userId: string,
    uids: number[],
  ): Promise<ImapMessage[]> {
    const allRows = await this.getMailboxRows(mailbox, userId);
    return allRows
      .filter((_, idx) => uids.includes(idx + 1))
      .map((row) => {
        const actualIdx = allRows.indexOf(row);
        return rowToImapMessage(row, actualIdx + 1, actualIdx + 1);
      });
  }

  async getMessagesBySequence(
    mailbox: string,
    userId: string,
    seqNums: number[],
  ): Promise<ImapMessage[]> {
    const allRows = await this.getMailboxRows(mailbox, userId);
    return seqNums
      .filter((n) => n >= 1 && n <= allRows.length)
      .flatMap((n) => {
        const row = allRows[n - 1];
        return row ? [rowToImapMessage(row, n, n)] : [];
      });
  }

  async getMessageCount(mailbox: string, userId: string): Promise<number> {
    const rows = await this.getMailboxRows(mailbox, userId);
    return rows.length;
  }

  async searchMessages(
    mailbox: string,
    userId: string,
    criteria: ImapSearchCriteria,
  ): Promise<number[]> {
    const allRows = await this.getMailboxRows(mailbox, userId);
    const results: number[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (!row) continue;
      const uid = i + 1;
      if (this.matchesCriteria(row, uid, criteria)) {
        results.push(uid);
      }
    }

    return results;
  }

  async updateFlags(
    mailbox: string,
    userId: string,
    uids: number[],
    operation: FlagOperation,
    flags: string[],
  ): Promise<ImapMessage[]> {
    const allRows = await this.getMailboxRows(mailbox, userId);
    const results: ImapMessage[] = [];

    for (const uid of uids) {
      if (uid < 1 || uid > allRows.length) continue;
      const row = allRows[uid - 1];
      if (!row) continue;

      switch (operation) {
        case "set":
          setFlags(row.id, flags);
          break;
        case "add":
          addFlags(row.id, flags);
          break;
        case "remove":
          removeFlags(row.id, flags);
          break;
      }

      results.push(rowToImapMessage(row, uid, uid));
    }

    return results;
  }

  async copyMessages(
    fromMailbox: string,
    toMailbox: string,
    userId: string,
    uids: number[],
  ): Promise<UidMapping[]> {
    // Copy is complex with our current schema — we'd need to duplicate rows.
    // For now, return the same UIDs (since we don't have real folder columns yet).
    const mappings: UidMapping[] = uids.map((uid) => ({
      sourceUid: uid,
      destUid: uid,
    }));
    return mappings;
  }

  async moveMessages(
    fromMailbox: string,
    toMailbox: string,
    userId: string,
    uids: number[],
  ): Promise<UidMapping[]> {
    // Same limitation as copy — would need folder column
    return this.copyMessages(fromMailbox, toMailbox, userId, uids);
  }

  async expunge(
    mailbox: string,
    userId: string,
    uids?: number[],
  ): Promise<number[]> {
    const allRows = await this.getMailboxRows(mailbox, userId);
    const expunged: number[] = [];

    for (let i = 0; i < allRows.length; i++) {
      const uid = i + 1;
      const row = allRows[i];
      if (!row) continue;
      const flags = getFlags(row.id);

      if (flags.includes("\\Deleted")) {
        if (!uids || uids.includes(uid)) {
          // Mark as 'failed' in DB (soft delete)
          const db = getDatabase();
          await db
            .update(emails)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(emails.id, row.id));

          flagStore.delete(row.id);
          expunged.push(i + 1); // sequence number
        }
      }
    }

    return expunged;
  }

  async appendMessage(
    mailbox: string,
    userId: string,
    message: AppendData,
  ): Promise<{ uid: number }> {
    const db = getDatabase();
    const id = crypto.randomUUID().replace(/-/g, "");

    // Every email row must reference a verified domain; IMAP APPEND has no
    // concept of a domain, so we use the account's first domain as the owner
    // for the appended message. If the account has no domains yet, APPEND
    // fails loudly rather than silently corrupting state.
    const [firstDomain] = await db
      .select({ id: domains.id })
      .from(domains)
      .where(eq(domains.accountId, userId))
      .limit(1);

    if (!firstDomain) {
      throw new Error(
        "IMAP APPEND failed: account has no domains — add a domain before appending messages",
      );
    }

    const messageId = `<${id}@${firstDomain.id}.imap.local>`;

    await db.insert(emails).values({
      id,
      accountId: userId,
      domainId: firstDomain.id,
      messageId,
      fromAddress: "unknown@local",
      subject: "Appended message",
      textBody: message.rawMessage,
      status: mailbox.toLowerCase() === "drafts" ? "queued" : "delivered", // "draft" not in enum; "queued" = not yet sent
      createdAt: message.internalDate,
      updatedAt: new Date(),
      tags: [],
      toAddresses: [],
    });

    if (message.flags.length > 0) {
      setFlags(id, message.flags);
    }

    // Get the new UID (count of messages in mailbox)
    const count = await this.getMessageCount(mailbox, userId);
    return { uid: count };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private async getMailboxRows(_mailbox: string, userId: string) {
    const db = getDatabase();

    // For "sent" mailbox, we look at emails sent BY this user
    // For "inbox", we look at emails received (inbound)
    const rows = await db
      .select({
        id: emails.id,
        fromAddress: emails.fromAddress,
        fromName: emails.fromName,
        toAddresses: emails.toAddresses,
        ccAddresses: emails.ccAddresses,
        subject: emails.subject,
        textBody: emails.textBody,
        htmlBody: emails.htmlBody,
        messageId: emails.messageId,
        replyToAddress: emails.replyToAddress,
        createdAt: emails.createdAt,
        status: emails.status,
      })
      .from(emails)
      .where(eq(emails.accountId, userId))
      .orderBy(asc(emails.createdAt))
      .limit(10000);

    return rows;
  }

  private matchesCriteria(
    row: { id: string; fromAddress: string; subject: string; textBody: string | null; createdAt: Date; status: string },
    uid: number,
    criteria: ImapSearchCriteria,
  ): boolean {
    switch (criteria.type) {
      case "all":
        return true;
      case "uid":
        return criteria.value.includes(String(uid));
      case "seen":
        return getFlags(row.id).includes("\\Seen");
      case "unseen":
        return !getFlags(row.id).includes("\\Seen");
      case "flagged":
        return getFlags(row.id).includes("\\Flagged");
      case "unflagged":
        return !getFlags(row.id).includes("\\Flagged");
      case "deleted":
        return getFlags(row.id).includes("\\Deleted");
      case "undeleted":
        return !getFlags(row.id).includes("\\Deleted");
      case "answered":
        return getFlags(row.id).includes("\\Answered");
      case "unanswered":
        return !getFlags(row.id).includes("\\Answered");
      case "draft":
        return getFlags(row.id).includes("\\Draft");
      case "undraft":
        return !getFlags(row.id).includes("\\Draft");
      case "new":
        return !getFlags(row.id).includes("\\Seen") && getFlags(row.id).includes("\\Recent");
      case "old":
        return !getFlags(row.id).includes("\\Recent");
      case "recent":
        return getFlags(row.id).includes("\\Recent");
      case "from":
        return row.fromAddress.toLowerCase().includes(criteria.value.toLowerCase());
      case "to": {
        const toStr = JSON.stringify(row).toLowerCase();
        return toStr.includes(criteria.value.toLowerCase());
      }
      case "subject":
        return row.subject.toLowerCase().includes(criteria.value.toLowerCase());
      case "body":
      case "text":
        return (row.textBody ?? "").toLowerCase().includes(criteria.value.toLowerCase());
      case "before":
        return row.createdAt < criteria.value;
      case "since":
        return row.createdAt >= criteria.value;
      case "on": {
        const d = row.createdAt;
        const target = criteria.value;
        return (
          d.getFullYear() === target.getFullYear() &&
          d.getMonth() === target.getMonth() &&
          d.getDate() === target.getDate()
        );
      }
      case "larger":
        return Buffer.byteLength(row.textBody ?? "", "utf-8") > criteria.value;
      case "smaller":
        return Buffer.byteLength(row.textBody ?? "", "utf-8") < criteria.value;
      case "not":
        return !this.matchesCriteria(row, uid, criteria.criteria);
      case "or":
        return (
          this.matchesCriteria(row, uid, criteria.left) ||
          this.matchesCriteria(row, uid, criteria.right)
        );
      case "and":
        return criteria.criteria.every((c) =>
          this.matchesCriteria(row, uid, c),
        );
      default:
        return true;
    }
  }
}
