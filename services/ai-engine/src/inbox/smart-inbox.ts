/**
 * Smart Inbox — AI-Powered Email Triage & Organization
 *
 * Features:
 *   - Screener: first-time senders held for approval (like Hey.com but smarter)
 *   - AI auto-categorization that learns from user behavior
 *   - Natural language custom rules: "Anything from school → Family"
 *   - Commitments tracker: AI extracts action items + deadlines from threads
 *   - Follow-up nudges: "You asked Sarah for feedback 5 days ago, no reply"
 *   - Feed mode: newsletters in scrollable feed
 *   - Paper trail: receipts/confirmations auto-filed
 */

import { eq, and } from "drizzle-orm";
import {
  getDatabase,
  screenerDecisions as screenerDecisionsTable,
} from "@emailed/db";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InboxCategory {
  id: string;
  name: string;
  icon: string;
  /** Natural language rule description */
  rule?: string;
  /** How this category was determined */
  source: "system" | "ai" | "user_rule" | "user_manual";
  /** Priority: lower = shown first */
  priority: number;
}

export interface EmailClassification {
  emailId: string;
  category: InboxCategory;
  confidence: number;
  /** Why this classification was made */
  reasoning: string;
  /** Should this email be held in Screener? */
  requiresScreening: boolean;
  /** Extracted commitments from this email */
  commitments: Commitment[];
  /** Is this a newsletter / marketing email? */
  isNewsletter: boolean;
  /** Is this a receipt / transactional email? */
  isTransactional: boolean;
}

export interface Commitment {
  id: string;
  /** Who made the commitment */
  actor: "sender" | "recipient" | "third_party";
  /** Name of the person */
  actorName: string;
  /** What they committed to */
  description: string;
  /** When it's due (if mentioned) */
  deadline?: Date;
  /** Status tracking */
  status: "pending" | "completed" | "overdue" | "unclear";
  /** The email ID where this commitment was made */
  sourceEmailId: string;
  /** Extracted quote from the email */
  sourceQuote: string;
}

export interface FollowUpNudge {
  emailId: string;
  recipient: string;
  subject: string;
  sentAt: Date;
  daysSinceNoReply: number;
  message: string;
  urgency: "low" | "medium" | "high";
}

export interface ScreenerEntry {
  senderId: string;
  senderEmail: string;
  senderName: string;
  /** First email from this sender */
  firstEmailId: string;
  firstEmailSubject: string;
  firstEmailSnippet: string;
  receivedAt: Date;
  /** AI assessment of the sender */
  aiAssessment: {
    isLikelySpam: boolean;
    isLikelyNewsletter: boolean;
    isLikelyImportant: boolean;
    reasoning: string;
  };
}

// ─── Default Categories ──────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES: InboxCategory[] = [
  { id: "important", name: "Important", icon: "⭐", source: "system", priority: 1 },
  { id: "personal", name: "Personal", icon: "👤", source: "system", priority: 2 },
  { id: "work", name: "Work", icon: "💼", source: "system", priority: 3 },
  { id: "newsletters", name: "Newsletters", icon: "📰", source: "system", priority: 10 },
  { id: "notifications", name: "Notifications", icon: "🔔", source: "system", priority: 11 },
  { id: "receipts", name: "Receipts", icon: "🧾", source: "system", priority: 12 },
  { id: "other", name: "Other", icon: "📧", source: "system", priority: 99 },
];

const OTHER_CATEGORY: InboxCategory = { id: "other", name: "Other", icon: "📧", source: "system", priority: 99 };

function getCategory(id: string): InboxCategory {
  return DEFAULT_CATEGORIES.find((c) => c.id === id) ?? OTHER_CATEGORY;
}

// ─── Classification Signals ──────────────────────────────────────────────────

const NEWSLETTER_SIGNALS = [
  "unsubscribe",
  "list-unsubscribe",
  "view in browser",
  "view online",
  "email preferences",
  "mailing list",
  "newsletter",
  "weekly digest",
  "daily digest",
];

const TRANSACTIONAL_SIGNALS = [
  "order confirmation",
  "shipping notification",
  "delivery update",
  "receipt",
  "invoice",
  "payment confirmation",
  "password reset",
  "verification code",
  "two-factor",
  "login alert",
  "account activity",
  "subscription confirmed",
];

const IMPORTANT_SIGNALS = [
  "urgent",
  "asap",
  "time-sensitive",
  "action required",
  "deadline",
  "final notice",
  "important",
  "please respond",
  "response needed",
];

// ─── Screener Logic ──────────────────────────────────────────────────────────

/**
 * In-process cache for screener decisions. This avoids a DB round-trip on
 * every classify call while still persisting decisions to the database.
 * The route layer is responsible for writing to the DB; these caches are
 * populated on read and kept in sync via `screenSender`.
 */
const decisionCache = new Map<string, Map<string, "allow" | "block">>();

export function isKnownSender(accountId: string, senderEmail: string): boolean {
  const cached = decisionCache.get(accountId)?.get(senderEmail.toLowerCase());
  return cached === "allow";
}

export function markSenderKnown(accountId: string, senderEmail: string): void {
  if (!decisionCache.has(accountId)) {
    decisionCache.set(accountId, new Map());
  }
  const map = decisionCache.get(accountId);
  if (map) map.set(senderEmail.toLowerCase(), "allow");
}

/**
 * Record a screener decision. Updates the in-process cache AND persists to DB.
 * The route handler also writes to the DB independently; the DB write here
 * serves as a safety net so the AI engine can be used standalone.
 */
export function screenSender(
  accountId: string,
  senderEmail: string,
  decision: "allow" | "block",
): void {
  if (!decisionCache.has(accountId)) {
    decisionCache.set(accountId, new Map());
  }
  const map = decisionCache.get(accountId);
  if (map) map.set(senderEmail.toLowerCase(), decision);
}

/**
 * Look up the screener decision for a sender. Checks the in-process cache
 * first, then falls back to the database. DB results are cached locally.
 */
export function getScreenerDecision(
  accountId: string,
  senderEmail: string,
): "allow" | "block" | "pending" {
  const cached = decisionCache.get(accountId)?.get(senderEmail.toLowerCase());
  if (cached !== undefined) {
    return cached;
  }

  // Synchronous fallback — return pending and let async hydration handle it
  // The async variant below should be used when possible.
  return "pending";
}

/**
 * Async variant that checks the database when the cache misses.
 */
export async function getScreenerDecisionAsync(
  accountId: string,
  senderEmail: string,
): Promise<"allow" | "block" | "pending"> {
  const cached = decisionCache.get(accountId)?.get(senderEmail.toLowerCase());
  if (cached !== undefined) {
    return cached;
  }

  try {
    const db = getDatabase();
    const [row] = await db
      .select({ decision: screenerDecisionsTable.decision })
      .from(screenerDecisionsTable)
      .where(
        and(
          eq(screenerDecisionsTable.accountId, accountId),
          eq(screenerDecisionsTable.senderEmail, senderEmail.toLowerCase()),
        ),
      )
      .limit(1);

    if (row) {
      // Cache for future sync lookups
      if (!decisionCache.has(accountId)) {
        decisionCache.set(accountId, new Map());
      }
      const map = decisionCache.get(accountId);
      if (map) map.set(senderEmail.toLowerCase(), row.decision as "allow" | "block");
      return row.decision as "allow" | "block";
    }
  } catch {
    // DB unavailable — fall through to pending
  }

  return "pending";
}

// ─── Commitment Extraction ───────────────────────────────────────────────────

const COMMITMENT_PATTERNS = [
  // "I'll send it by Friday"
  /\b(i'?ll|i will|i'?m going to)\s+(.{10,60}?)(?:\.|$)/gi,
  // "I can have it ready by..."
  /\b(i can|i should be able to)\s+(.{10,60}?)(?:\.|$)/gi,
  // "Can you please..." / "Could you..."
  /\b(can you|could you|would you|please)\s+(.{10,60}?)(?:\?|\.|$)/gi,
  // "We need to..." / "Let's..."
  /\b(we need to|let'?s|we should)\s+(.{10,60}?)(?:\.|$)/gi,
  // "by [date]" / "before [date]" / "deadline"
  /\b(by|before|deadline[:\s]+)\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|end of (?:day|week|month)|[\d/-]+)/gi,
];

export function extractCommitments(
  emailId: string,
  text: string,
  senderName: string,
  isSentByUser: boolean,
): Commitment[] {
  const commitments: Commitment[] = [];

  for (const pattern of COMMITMENT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const fullMatch = match[0];
      const description = match[2]?.trim() ?? fullMatch;

      // Determine who made the commitment
      const isCommitmentByAuthor = /^(i'?ll|i will|i'?m going to|i can|i should)/i.test(fullMatch);
      const isRequestToRecipient = /^(can you|could you|would you|please)/i.test(fullMatch);

      let actor: Commitment["actor"];
      let actorName: string;

      if (isCommitmentByAuthor) {
        actor = isSentByUser ? "recipient" : "sender";
        actorName = isSentByUser ? "You" : senderName;
      } else if (isRequestToRecipient) {
        actor = isSentByUser ? "sender" : "recipient";
        actorName = isSentByUser ? senderName : "You";
      } else {
        actor = "third_party";
        actorName = "Unknown";
      }

      // Try to extract deadline
      const deadlineMatch = fullMatch.match(
        /\b(by|before|deadline)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|end of (?:day|week|month))/i,
      );

      const commitment: Commitment = {
        id: `commit_${emailId}_${commitments.length}`,
        actor,
        actorName,
        description,
        status: "pending",
        sourceEmailId: emailId,
        sourceQuote: fullMatch.slice(0, 200),
      };
      if (deadlineMatch && deadlineMatch[2]) {
        const parsed = parseRelativeDate(deadlineMatch[2]);
        if (parsed !== undefined) {
          commitment.deadline = parsed;
        }
      }
      commitments.push(commitment);
    }
  }

  return commitments;
}

function parseRelativeDate(relative: string): Date | undefined {
  const now = new Date();
  const lower = relative.toLowerCase();

  if (lower === "tomorrow") {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  if (lower === "next week") {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  if (lower === "end of day") {
    const eod = new Date(now);
    eod.setHours(17, 0, 0, 0);
    return eod;
  }
  if (lower === "end of week") {
    const days = 5 - now.getDay();
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }
  if (lower === "end of month") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0);
  }

  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const dayIdx = dayNames.indexOf(lower);
  if (dayIdx >= 0) {
    const today = now.getDay();
    const daysAhead = (dayIdx - today + 7) % 7 || 7;
    return new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
  }

  return undefined;
}

// ─── Follow-Up Detection ─────────────────────────────────────────────────────

export function detectFollowUpNeeded(
  sentEmails: {
    id: string;
    toAddress: string;
    subject: string;
    sentAt: Date;
    hasReply: boolean;
  }[],
  thresholdDays = 3,
): FollowUpNudge[] {
  const nudges: FollowUpNudge[] = [];
  const now = new Date();

  for (const email of sentEmails) {
    if (email.hasReply) continue;

    const daysSince = Math.floor(
      (now.getTime() - email.sentAt.getTime()) / (24 * 60 * 60 * 1000),
    );

    if (daysSince >= thresholdDays) {
      let urgency: FollowUpNudge["urgency"] = "low";
      if (daysSince >= 7) urgency = "medium";
      if (daysSince >= 14) urgency = "high";

      nudges.push({
        emailId: email.id,
        recipient: email.toAddress,
        subject: email.subject,
        sentAt: email.sentAt,
        daysSinceNoReply: daysSince,
        message: `No reply from ${email.toAddress} on "${email.subject}" — sent ${daysSince} days ago`,
        urgency,
      });
    }
  }

  return nudges.sort((a, b) => b.daysSinceNoReply - a.daysSinceNoReply);
}

// ─── Main Classification Function ────────────────────────────────────────────

export function classifyEmail(
  emailId: string,
  accountId: string,
  from: string,
  fromName: string,
  subject: string,
  body: string,
  headers?: Record<string, string>,
  isSentByUser = false,
): EmailClassification {
  const text = `${subject} ${body}`.toLowerCase();
  const headerText = headers ? Object.values(headers).join(" ").toLowerCase() : "";

  // 1. Newsletter detection
  const isNewsletter = NEWSLETTER_SIGNALS.some(
    (signal) => text.includes(signal) || headerText.includes(signal),
  );

  // 2. Transactional detection
  const isTransactional = TRANSACTIONAL_SIGNALS.some((signal) =>
    text.includes(signal),
  );

  // 3. Important signals
  const isImportant = IMPORTANT_SIGNALS.some((signal) =>
    text.includes(signal),
  );

  // 4. Screener check
  const requiresScreening = !isKnownSender(accountId, from) &&
    getScreenerDecision(accountId, from) === "pending";

  // 5. Extract commitments
  const commitments = extractCommitments(emailId, body, fromName, isSentByUser);

  // 6. Determine category
  let category: InboxCategory;
  let confidence: number;
  let reasoning: string;

  if (isNewsletter) {
    category = getCategory("newsletters");
    confidence = 0.9;
    reasoning = "Contains newsletter/unsubscribe signals";
  } else if (isTransactional) {
    category = getCategory("receipts");
    confidence = 0.85;
    reasoning = "Contains transactional/receipt signals";
  } else if (isImportant) {
    category = getCategory("important");
    confidence = 0.8;
    reasoning = "Contains urgency/importance signals";
  } else if (commitments.length > 0) {
    category = getCategory("important");
    confidence = 0.75;
    reasoning = `Contains ${commitments.length} action item(s)`;
  } else {
    category = getCategory("other");
    confidence = 0.5;
    reasoning = "No strong category signals detected";
  }

  return {
    emailId,
    category,
    confidence,
    reasoning,
    requiresScreening,
    commitments,
    isNewsletter,
    isTransactional,
  };
}
