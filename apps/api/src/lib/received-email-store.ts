/**
 * received-email-store — persist mail synced/imported from a connected
 * EXTERNAL account (Gmail/Outlook/MBOX/EML) into the unified `emails` table.
 *
 * Such mail isn't addressed to one of our hosted sending domains, so its
 * `domainId` is null (the column was made nullable for exactly this). Inserts
 * are idempotent: a message already stored for the account (same Message-ID)
 * is skipped, so re-running an import never duplicates.
 */

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase, emails } from "@alecrae/db";
import type { ParsedEmail } from "@alecrae/email-parser";

export interface ReceivedAddress {
  address: string;
  name?: string | null;
}

export interface ReceivedEmailInput {
  accountId: string;
  /** Provenance: "gmail" | "outlook" | "mbox" | "eml". */
  source: string;
  from: ReceivedAddress;
  to: ReceivedAddress[];
  cc?: ReceivedAddress[];
  subject: string;
  textBody?: string | null;
  htmlBody?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string[] | null;
  receivedAt?: Date;
}

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function normalizeAddr(a: ReceivedAddress): { address: string; name?: string } {
  return a.name ? { address: a.address, name: a.name } : { address: a.address };
}

/**
 * Insert a received/imported message into `emails`. Returns `{ stored: false }`
 * when the message was already present (deduped by accountId + Message-ID).
 */
export async function storeReceivedEmail(
  input: ReceivedEmailInput,
): Promise<{ stored: boolean; id: string | null }> {
  const db = getDatabase();
  const realMessageId = input.messageId?.trim();
  const messageId = realMessageId && realMessageId.length > 0 ? realMessageId : `<${genId()}@import>`;

  // Dedup only when we have a real Message-ID (synthetic ids are unique anyway).
  if (realMessageId) {
    const [existing] = await db
      .select({ id: emails.id })
      .from(emails)
      .where(and(eq(emails.accountId, input.accountId), eq(emails.messageId, messageId)))
      .limit(1);
    if (existing) return { stored: false, id: existing.id };
  }

  const id = genId();
  const now = new Date();
  const received = input.receivedAt ?? now;
  const cc = input.cc && input.cc.length > 0 ? input.cc.map(normalizeAddr) : null;
  const refs = input.references && input.references.length > 0 ? input.references : null;

  await db.insert(emails).values({
    id,
    accountId: input.accountId,
    domainId: null,
    messageId,
    fromAddress: input.from.address || "unknown@unknown",
    fromName: input.from.name ?? null,
    toAddresses: input.to.map(normalizeAddr),
    ccAddresses: cc,
    subject: input.subject?.trim() || "(no subject)",
    textBody: input.textBody ?? null,
    htmlBody: input.htmlBody ?? null,
    inReplyTo: input.inReplyTo ?? null,
    references: refs,
    status: "delivered",
    tags: ["inbox", `import:${input.source}`],
    source: input.source,
    metadata: { receivedAt: received.toISOString(), imported: "true" },
    createdAt: received,
    updatedAt: now,
  });

  return { stored: true, id };
}

/** Map a parsed RFC 5322 message to the store input. */
export function parsedToReceived(parsed: ParsedEmail, accountId: string, source: string): ReceivedEmailInput {
  const input: ReceivedEmailInput = {
    accountId,
    source,
    from: { address: parsed.from.address, name: parsed.from.name ?? null },
    to: parsed.to.map((a) => ({ address: a.address, name: a.name ?? null })),
    cc: parsed.cc.map((a) => ({ address: a.address, name: a.name ?? null })),
    subject: parsed.subject,
    textBody: parsed.textBody ?? null,
    htmlBody: parsed.htmlBody ?? null,
    messageId: parsed.messageId || null,
    inReplyTo: parsed.inReplyTo ?? null,
    references: [...parsed.references],
  };
  if (parsed.date) input.receivedAt = parsed.date;
  return input;
}

/**
 * Split an mbox file into individual raw RFC 5322 messages.
 *
 * mbox delimits messages with an envelope line beginning `From ` (the
 * "From_" postmark), which is NOT part of the message itself and is dropped.
 * If no postmark is found the whole content is treated as a single message.
 * Pure — exported for unit tests.
 */
export function splitMboxMessages(content: string): string[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const messages: string[] = [];
  let current: string[] | null = null;
  let sawPostmark = false;

  for (const line of lines) {
    if (/^From .+/.test(line)) {
      sawPostmark = true;
      if (current && current.length > 0) messages.push(current.join("\n").trim());
      current = [];
    } else if (current) {
      current.push(line);
    }
  }
  if (current && current.length > 0) messages.push(current.join("\n").trim());

  const nonEmpty = messages.filter((m) => m.length > 0);
  if (!sawPostmark && content.trim().length > 0) return [content.trim()];
  return nonEmpty;
}
