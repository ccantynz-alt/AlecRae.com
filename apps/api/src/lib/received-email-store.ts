/**
 * received-email-store — persist mail synced/imported from a connected
 * EXTERNAL account (Gmail/Outlook/MBOX/EML) into the unified `emails` table.
 *
 * Such mail isn't addressed to one of our hosted sending domains, so its
 * `domainId` is null (the column was made nullable for exactly this). Inserts
 * are idempotent: a message already stored for the account (same Message-ID)
 * is skipped, so re-running an import never duplicates.
 *
 * AI auto-triage: immediately after each INSERT, a fire-and-forget async
 * call to Claude Haiku classifies the email (priority, category, actionRequired,
 * summary) and stores the result back into `emails.metadata`. This call never
 * blocks email storage and degrades gracefully when ANTHROPIC_API_KEY is absent.
 */

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDatabase, emails } from "@alecrae/db";
import type { ParsedEmail } from "@alecrae/email-parser";
import { aiComplete } from "./ai.js";
import { runRulesForEmail } from "./rule-engine.js";

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
  /** Provider-reported read/starred state — previously computed by the Gmail/
   *  Outlook parser and then silently dropped before reaching storage. */
  isRead?: boolean;
  isStarred?: boolean;
}

function genId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function normalizeAddr(a: ReceivedAddress): { address: string; name?: string } {
  return a.name ? { address: a.address, name: a.name } : { address: a.address };
}

/* ── AI auto-triage ─────────────────────────────────────────────────────────
 *
 * Classify the email with Claude Haiku and write priority/category/
 * actionRequired/summary back into `emails.metadata`.
 *
 * This runs fire-and-forget: a caught error is logged but NEVER propagated to
 * the caller. The function does nothing when ANTHROPIC_API_KEY is absent, so
 * dev/CI environments without the key are unaffected.
 * ─────────────────────────────────────────────────────────────────────────── */

type TriagePriority = "urgent" | "high" | "normal" | "low";
type TriageCategory =
  | "work"
  | "personal"
  | "newsletter"
  | "notification"
  | "receipt"
  | "social"
  | "spam";

interface TriageResult {
  priority: TriagePriority;
  category: TriageCategory;
  actionRequired: boolean;
  summary: string;
}

const TRIAGE_SYSTEM = "You are an email classification assistant. Respond with valid JSON only — no prose, no markdown fences.";

function buildTriagePrompt(input: ReceivedEmailInput): string {
  const bodyPreview = (input.textBody ?? input.htmlBody ?? "").slice(0, 500);
  return [
    'Classify this email. Return JSON only:',
    '{',
    '  "priority": "urgent"|"high"|"normal"|"low",',
    '  "category": "work"|"personal"|"newsletter"|"notification"|"receipt"|"social"|"spam",',
    '  "actionRequired": boolean,',
    '  "summary": "one sentence, max 100 chars"',
    '}',
    '',
    `From: ${input.from.address}${input.from.name ? ` <${input.from.name}>` : ""}`,
    `Subject: ${input.subject}`,
    `Body (first 500 chars): ${bodyPreview}`,
  ].join("\n");
}

function isTriageResult(v: unknown): v is TriageResult {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r["priority"] === "string" &&
    typeof r["category"] === "string" &&
    typeof r["actionRequired"] === "boolean" &&
    typeof r["summary"] === "string"
  );
}

async function runAiTriage(emailId: string, input: ReceivedEmailInput): Promise<void> {
  if (!process.env["ANTHROPIC_API_KEY"]) return;

  try {
    const result = await aiComplete({
      system: TRIAGE_SYSTEM,
      messages: [{ role: "user", content: buildTriagePrompt(input) }],
      model: "claude-haiku-4-5-20251001",
      maxTokens: 256,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      // If the model returned prose or bad JSON, silently bail.
      return;
    }

    if (!isTriageResult(parsed)) return;

    const db = getDatabase();
    // Fetch the existing metadata so we can merge rather than overwrite.
    const [row] = await db
      .select({ metadata: emails.metadata })
      .from(emails)
      .where(eq(emails.id, emailId))
      .limit(1);

    const existing: Record<string, string> = (row?.metadata as Record<string, string> | null) ?? {};

    await db
      .update(emails)
      .set({
        metadata: {
          ...existing,
          ai_priority: parsed.priority,
          ai_category: parsed.category,
          ai_action_required: parsed.actionRequired ? "true" : "false",
          ai_summary: parsed.summary.slice(0, 100),
          ai_triaged_at: new Date().toISOString(),
          ai_provider: result.provider,
        },
      })
      .where(eq(emails.id, emailId));
  } catch (err) {
    // Triage failures must never surface to callers.
    console.error("[ai-triage] failed for email", emailId, err instanceof Error ? err.message : String(err));
  }
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
    isRead: input.isRead ?? false,
    isStarred: input.isStarred ?? false,
    folder: "inbox",
    metadata: { receivedAt: received.toISOString(), imported: "true" },
    createdAt: received,
    updatedAt: now,
  });

  // AI auto-triage: fire-and-forget — never blocks the caller.
  void runAiTriage(id, input);

  // User-defined email rules (routes/ai-rules.ts) — fire-and-forget, same as
  // AI-triage above. Previously nothing ever applied a saved rule to
  // incoming mail; this is the missing execution half.
  runRulesForEmail(input.accountId, id, {
    from: input.from,
    to: input.to,
    cc: input.cc ?? [],
    subject: input.subject,
    textBody: input.textBody ?? null,
    htmlBody: input.htmlBody ?? null,
  }).catch((err) => {
    console.error("[rule-engine] Failed to evaluate rules for email", id, err instanceof Error ? err.message : String(err));
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
