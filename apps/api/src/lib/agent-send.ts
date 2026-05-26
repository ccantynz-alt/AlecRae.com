/**
 * Agent draft → send-pipeline bridge.
 *
 * When the user approves an AI-drafted reply, the draft needs to be promoted
 * into the real send pipeline — inserted into the `emails` table, converted
 * to RFC-5322, and queued on the BullMQ outbound queue. This helper is the
 * single code path for that promotion so the agent routes don't have to
 * duplicate the send logic that lives in routes/messages.ts.
 *
 * Scope: handles the common case of replying from the account's first
 * verified domain. If no verified domain exists the helper throws so the
 * caller can surface a clear error rather than silently dropping the draft.
 */

import { and, eq } from "drizzle-orm";
import {
  getDatabase,
  emails,
  deliveryResults,
  domains,
  accounts,
  agentDrafts,
  type AgentDraft,
} from "@alecrae/db";
import { getSendQueue } from "./queue.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateMessageId(domain: string): string {
  return `<${generateId()}@${domain}>`;
}

function domainOf(address: string): string {
  const idx = address.lastIndexOf("@");
  return idx === -1 ? address : address.slice(idx + 1).toLowerCase();
}

// ─── RFC-5322 builder (minimal, for agent drafts) ───────────────────────────

interface BuildMessageInput {
  readonly fromAddress: string;
  readonly toAddresses: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly messageId: string;
  readonly inReplyTo?: string | null;
  readonly references?: string | null;
}

function buildRawAgentMessage(input: BuildMessageInput): string {
  const lines: string[] = [];
  lines.push(`From: ${input.fromAddress}`);
  lines.push(`To: ${input.toAddresses.join(", ")}`);
  lines.push(`Subject: ${input.subject}`);
  lines.push(`Message-ID: ${input.messageId}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push("MIME-Version: 1.0");
  if (input.inReplyTo) lines.push(`In-Reply-To: ${input.inReplyTo}`);
  if (input.references) lines.push(`References: ${input.references}`);
  lines.push("Content-Type: text/plain; charset=utf-8");
  lines.push("Content-Transfer-Encoding: quoted-printable");
  lines.push("");
  lines.push(input.body);
  return lines.join("\r\n");
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class AgentSendError extends Error {
  constructor(
    message: string,
    readonly code:
      | "account_not_found"
      | "no_verified_domain"
      | "draft_missing_recipient",
  ) {
    super(message);
    this.name = "AgentSendError";
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface EnqueueAgentDraftResult {
  readonly emailId: string;
  readonly messageId: string;
  readonly scheduledFor: Date;
  readonly delayMs: number;
}

/**
 * Promote an approved agent draft into the outbound send queue.
 *
 * Inserts a row into `emails`, creates per-recipient `delivery_results`, and
 * enqueues the MTA job with the appropriate BullMQ delay so the message
 * physically sends at `scheduledFor` (or immediately if it has already passed).
 */
export async function enqueueAgentDraftForSend(
  draft: AgentDraft,
): Promise<EnqueueAgentDraftResult> {
  if (!draft.toAddresses || draft.toAddresses.length === 0) {
    throw new AgentSendError(
      "Draft has no recipient addresses",
      "draft_missing_recipient",
    );
  }

  const db = getDatabase();

  // 1. Resolve the account's billing email + pick a verified domain as sender
  const [account] = await db
    .select({ billingEmail: accounts.billingEmail })
    .from(accounts)
    .where(eq(accounts.id, draft.accountId))
    .limit(1);

  if (!account) {
    throw new AgentSendError(
      `Account ${draft.accountId} not found`,
      "account_not_found",
    );
  }

  // Prefer a verified domain matching the billing email's domain, fall back to
  // the first verified domain the account owns.
  const billingDomain = domainOf(account.billingEmail);
  const verified = await db
    .select({ id: domains.id, domain: domains.domain })
    .from(domains)
    .where(
      and(
        eq(domains.accountId, draft.accountId),
        eq(domains.verificationStatus, "verified"),
      ),
    );

  const preferred =
    verified.find((d) => d.domain === billingDomain) ?? verified[0];
  if (!preferred) {
    throw new AgentSendError(
      "Account has no verified sending domain — drafts cannot be sent",
      "no_verified_domain",
    );
  }

  // 2. Build sender identity + message metadata
  const localPart = account.billingEmail.split("@")[0] ?? "noreply";
  const fromAddress = `${localPart}@${preferred.domain}`;
  const emailId = generateId();
  const messageId = generateMessageId(preferred.domain);
  const effectiveBody = draft.editedBody ?? draft.body;

  const rawMessage = buildRawAgentMessage({
    fromAddress,
    toAddresses: draft.toAddresses,
    subject: draft.subject,
    body: effectiveBody,
    messageId,
    inReplyTo: draft.emailId ? `<${draft.emailId}>` : null,
    references: draft.threadId ? `<${draft.threadId}>` : null,
  });

  const scheduledFor = draft.scheduledFor ?? new Date();
  const now = new Date();
  const delayMs = Math.max(0, scheduledFor.getTime() - now.getTime());

  // 3. Persist the email record
  await db.insert(emails).values({
    id: emailId,
    accountId: draft.accountId,
    domainId: preferred.id,
    messageId,
    fromAddress,
    fromName: null,
    toAddresses: draft.toAddresses.map((address) => ({ address })),
    ccAddresses: null,
    bccAddresses: null,
    replyToAddress: null,
    replyToName: null,
    subject: draft.subject,
    textBody: effectiveBody,
    htmlBody: null,
    customHeaders: null,
    status: "queued",
    tags: ["agent", "auto-draft"],
    scheduledAt: scheduledFor,
    createdAt: now,
    updatedAt: now,
  });

  // 4. Delivery results per recipient
  const rows = draft.toAddresses.map((recipient) => ({
    id: generateId(),
    emailId,
    recipientAddress: recipient,
    status: "queued" as const,
    attemptCount: 0,
  }));
  if (rows.length > 0) {
    await db.insert(deliveryResults).values(rows);
  }

  // 5. Queue the job
  const queue = getSendQueue();
  await queue.add(
    emailId,
    {
      email: {
        id: emailId,
        accountId: draft.accountId,
        messageId,
        from: fromAddress,
        to: draft.toAddresses,
        rawMessage,
        priority: 3 as const,
        attempts: 0,
        maxAttempts: 8,
        scheduledAt: scheduledFor,
        createdAt: now,
        domain: preferred.domain,
        metadata: {
          domainId: preferred.id,
          tags: ["agent", "auto-draft"],
          agentDraftId: draft.id,
          agentRunId: draft.runId,
        },
      },
    },
    delayMs > 0 ? { delay: delayMs } : {},
  );

  // 6. Record the link back on the draft
  await db
    .update(agentDrafts)
    .set({ sentAt: delayMs === 0 ? now : null, updatedAt: now })
    .where(eq(agentDrafts.id, draft.id));

  return { emailId, messageId, scheduledFor, delayMs };
}
