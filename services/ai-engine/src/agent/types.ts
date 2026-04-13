/**
 * AI Inbox Agent — Type Definitions
 *
 * The Inbox Agent is AlecRae's flagship overnight feature: while the user
 * sleeps, the agent triages every new email, drafts replies in the user's
 * voice, identifies commitments, flags suspicious senders, and produces a
 * one-tap morning briefing.
 *
 * All AI decisions in this module are accompanied by a confidence score and
 * a human-readable reasoning string. Any destructive action (auto-archive,
 * auto-delete, auto-send) is gated behind explicit user approval — the agent
 * only ever *flags* destructive actions; the user is the one who pulls the
 * trigger.
 */

import type { Commitment } from "../inbox/smart-inbox.js";

// ─── Core enums ──────────────────────────────────────────────────────────────

/** Coarse triage category — what *kind* of email this is. */
export type TriageCategory =
  | "urgent"
  | "important"
  | "personal"
  | "work"
  | "newsletter"
  | "transactional"
  | "promotional"
  | "social"
  | "spam"
  | "suspicious"
  | "other";

/** Priority bucket — how soon does this need attention? */
export type TriagePriority = "now" | "today" | "this_week" | "whenever" | "never";

/** Concrete action the agent recommends for this email. */
export type TriageAction =
  | "draft_reply"        // needs a response → draft one
  | "schedule_reply"     // draft + schedule for morning send
  | "flag_for_review"    // human attention required
  | "archive"            // safe to archive (suggestion only)
  | "mark_read"          // informational, no action
  | "snooze"             // bring back later
  | "quarantine"         // suspicious — hold for review
  | "ignore";            // newsletter, promo, etc.

export type AgentSuggestionType =
  | "archive_old_newsletter"
  | "unsubscribe"
  | "block_sender"
  | "mute_thread"
  | "create_filter"
  | "follow_up"
  | "delete_promo";

// ─── Lightweight email shape consumed by the agent ───────────────────────────

/**
 * Minimal email projection the agent operates on. We deliberately do *not*
 * couple to the full DB row — the agent should be runnable from any source
 * (live DB, replay, test fixtures) so long as these fields are provided.
 */
export interface AgentEmail {
  id: string;
  accountId: string;
  threadId?: string;
  from: string;
  fromName: string;
  to: string[];
  subject: string;
  /** Plain text body (HTML should be stripped before passing in). */
  body: string;
  receivedAt: Date;
  /** Optional raw headers for spam/phishing analysis. */
  headers?: Record<string, string>;
  /** True if this is a thread the user has previously replied to. */
  hasUserReplied?: boolean;
  /** True if the email landed in spam/junk according to upstream provider. */
  isFlaggedSpam?: boolean;
}

// ─── Agent decision shapes ───────────────────────────────────────────────────

export interface TriageDecision {
  emailId: string;
  category: TriageCategory;
  priority: TriagePriority;
  action: TriageAction;
  /** 0..1 — how confident the model is in this decision. */
  confidence: number;
  /** Human-readable explanation; surfaced in the briefing. */
  reasoning: string;
  /** True if the agent thinks the email is dangerous (phishing, malware…). */
  suspicious: boolean;
  /** Suspicion explanation, if any. */
  suspicionReasons?: string[];
  /** True if the email needs the user to write back. */
  needsReply: boolean;
}

export interface DraftedReply {
  emailId: string;
  threadId?: string;
  /** The drafted reply body in the user's voice. */
  draft: string;
  /** Subject line for the reply (usually "Re: ..."). */
  subject: string;
  tone: string;
  /** 0..1 confidence — low confidence drafts get extra scrutiny in briefing. */
  confidence: number;
  /** Reasoning for *why* this draft was written this way. */
  reasoning: string;
  /** Always true — drafts NEVER auto-send without user approval. */
  requiresApproval: true;
  /** Proposed send time (e.g., 8:00 AM local). */
  scheduledFor?: Date;
  /** Recipient(s) the reply will go to. */
  to: string[];
}

export interface AgentSuggestion {
  type: AgentSuggestionType;
  /** What it applies to — usually an emailId or sender address. */
  target: string;
  /** Concrete action the user can one-tap approve. */
  action: string;
  /** Why the agent thinks this is a good idea. */
  reasoning: string;
  /** 0..1 confidence. */
  confidence: number;
  /** Estimated number of emails this affects (for bulk suggestions). */
  affectedCount?: number;
}

/** Voice profile shape used for drafting — kept loose to avoid tight coupling. */
export interface UserVoiceProfile {
  userId: string;
  averageSentenceLength: number;
  vocabularyLevel: "simple" | "moderate" | "advanced";
  preferredGreetings: string[];
  preferredSignoffs: string[];
  commonPhrases: string[];
  formality: number;
  emojiUsage: number;
  sampleCount: number;
}

// ─── The full report the agent produces per run ──────────────────────────────

export interface AgentReport {
  /** Unique run identifier. */
  runId: string;
  accountId: string;
  /** When the run started. */
  runAt: Date;
  /** When the run finished. */
  finishedAt: Date;
  /** ms spent in the run. */
  durationMs: number;
  /** Total emails the agent looked at. */
  totalProcessed: number;
  /** Per-email triage decisions. */
  triageDecisions: TriageDecision[];
  /** Drafts the agent prepared — all require approval. */
  draftedReplies: DraftedReply[];
  /** Action items / commitments extracted across all processed emails. */
  commitments: Commitment[];
  /** Inbox cleanup / unsubscribe / filter suggestions. */
  suggestions: AgentSuggestion[];
  /** Suspicious / phishing emails the agent quarantined. */
  flaggedSuspicious: TriageDecision[];
  /** Markdown briefing the user reviews in the morning. */
  briefingMarkdown: string;
  /** Was this a dry run? (no drafts persisted, no schedules created) */
  dryRun: boolean;
  /** High-level metrics. */
  stats: {
    urgent: number;
    needsReply: number;
    drafted: number;
    suspicious: number;
    archivable: number;
    newsletters: number;
  };
}

export interface AgentRunOptions {
  /** Only process emails received after this timestamp. */
  since?: Date;
  /** Hard cap to avoid runaway runs. Default: 200. */
  maxEmails?: number;
  /** If true, the agent does all reasoning but persists nothing. */
  dryRun?: boolean;
  /** Optional voice profile for drafting. */
  voiceProfile?: UserVoiceProfile;
  /** Local hour at which scheduled replies should fire (default: 8). */
  morningHour?: number;
}

// ─── Agent ↔ Claude API contract ─────────────────────────────────────────────

/**
 * Thin abstraction over the Claude API so the agent can be unit-tested with
 * a fake client and so we can swap models per task (Haiku for triage, Sonnet
 * for drafting, etc.) without rewriting the agent.
 */
export interface AgentAIClient {
  /**
   * Generate a JSON-shaped response. The agent always asks for JSON to keep
   * downstream parsing deterministic.
   */
  generateJSON<T>(args: {
    system: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }): Promise<T>;

  /** Generate freeform text (used for the markdown briefing & draft bodies). */
  generateText(args: {
    system: string;
    prompt: string;
    maxTokens?: number;
    temperature?: number;
    model?: string;
  }): Promise<string>;
}
