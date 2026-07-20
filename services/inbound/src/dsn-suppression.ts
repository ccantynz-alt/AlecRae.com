/**
 * DSN (RFC 3464 delivery-status-notification) ingestion → suppression.
 *
 * services/mta/src/bounce/processor.ts has a complete, tested DSN parser
 * that was never called from anywhere (CLAUDE.md Known Issue #82(e)): the
 * only bounce signal that ever reached suppression was a same-connection
 * SMTP-time rejection (services/mta/src/delivery/optimizer.ts). A receiving
 * MTA that accepts a message and bounces it later — the common case — sent
 * back a DSN that would land in the inbox as an unremarkable message and
 * never suppress the dead address, so sends kept going out indefinitely.
 *
 * This module detects an inbound DSN, parses it, and — for hard/permanent
 * bounces — writes a real suppression_lists row.
 *
 * Attribution caveat: a DSN's Final-Recipient tells us which address
 * bounced, but not which of our domains/accounts originally sent to it —
 * Return-Path isn't yet rewritten to a per-send VERP address (a separate,
 * still-open gap, issue #82(a)). Until that exists, this correlates the
 * bounce to the most recent matching `emails` row we sent to that address,
 * which is a reasonable approximation but not exact for accounts that
 * share a recipient across multiple domains.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDatabase, emails, domains, suppressionLists } from "@alecrae/db";
import { parseBounceMessage, processBounce, type BounceInfo } from "@alecrae/mta/lib";
import type { MimeHeader } from "./types.js";

const LOOKBACK_DAYS = 30;
const LOOKBACK_LIMIT = 500;

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** True if the message's Content-Type identifies it as an RFC 3464 DSN. */
export function isDsnMessage(headers: MimeHeader[]): boolean {
  const contentType = headers.find((h) => h.key.toLowerCase() === "content-type")?.value ?? "";
  const normalized = contentType.toLowerCase();
  return normalized.includes("multipart/report") && normalized.includes("report-type=delivery-status");
}

/**
 * Parse an inbound DSN and suppress any hard-bounced recipients. Never
 * throws — a malformed or unattributable DSN is logged and skipped rather
 * than blocking normal inbound storage of the message.
 */
export async function processInboundDsn(rawMessage: string): Promise<void> {
  const parsed = parseBounceMessage(rawMessage);
  if (!parsed.ok) {
    console.warn(`[inbound] DSN detected but failed to parse: ${parsed.error.message}`);
    return;
  }

  for (const bounceInfo of parsed.value) {
    try {
      await handleOneBounce(bounceInfo);
    } catch (err) {
      console.error(
        `[inbound] Failed to process DSN bounce for ${bounceInfo.recipient}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

async function handleOneBounce(bounceInfo: BounceInfo): Promise<void> {
  // No persistent per-recipient attempt-count store exists yet — evaluate
  // as a first attempt. Hard/block bounces suppress unconditionally
  // regardless of attempt count, so this doesn't affect the dominant,
  // most damaging case; soft/transient bounces are logged but not acted
  // on further here (the synchronous retry path already handles those).
  const action = processBounce(bounceInfo, 0, 1);
  if (action.kind !== "suppress") {
    console.log(
      `[inbound] DSN for ${bounceInfo.recipient}: ${bounceInfo.category}/${bounceInfo.type} — not suppressing (${action.kind})`,
    );
    return;
  }

  const db = getDatabase();
  const recipientLower = bounceInfo.recipient.toLowerCase();
  const lookbackSince = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Parameterized JSONB containment check — NOT sql.raw()/string interpolation,
  // which would reopen exactly the SQL-injection class already found and
  // fixed elsewhere in this codebase this session (knowledge-graph.ts).
  const candidates = await db
    .select({
      accountId: emails.accountId,
      fromAddress: emails.fromAddress,
    })
    .from(emails)
    .where(
      and(
        sql`${emails.toAddresses} @> ${JSON.stringify([{ address: recipientLower }])}::jsonb`,
        gte(emails.createdAt, lookbackSince),
      ),
    )
    .orderBy(desc(emails.createdAt))
    .limit(LOOKBACK_LIMIT);

  const match = candidates[0];
  if (!match) {
    console.warn(
      `[inbound] DSN hard-bounce for ${bounceInfo.recipient} — no matching sent email in the last ${LOOKBACK_DAYS}d to attribute it to a domain, skipping suppression`,
    );
    return;
  }

  const senderDomain = match.fromAddress.split("@")[1]?.toLowerCase();
  if (!senderDomain) return;

  const [domainRecord] = await db
    .select({ id: domains.id })
    .from(domains)
    .where(and(eq(domains.domain, senderDomain), eq(domains.accountId, match.accountId)))
    .limit(1);
  if (!domainRecord) return;

  await db
    .insert(suppressionLists)
    .values({
      id: generateId(),
      email: recipientLower,
      domainId: domainRecord.id,
      reason: "bounce",
    })
    .onConflictDoNothing();

  console.log(`[inbound] Suppressed ${recipientLower} (domain ${senderDomain}) — DSN hard bounce: ${bounceInfo.type}`);
}
