/**
 * AlecRae Flywheel — typed signal definitions.
 *
 * Mirrors `.ai-flywheel/config.json`. Every AI feature emits structured
 * signals; the flywheel aggregates them into RPM-style metrics that prove
 * the moat is compounding (or warn when it isn't).
 *
 * Signal categories:
 *   - compose          AI Compose suggestions
 *   - triage           Priority-inbox classifications
 *   - smart_reply      Quick reply suggestions
 *   - voice_profile    User's writing-style fingerprint accuracy
 *   - phishing         Phishing detector accuracy
 *   - search           Natural-language search relevance
 *   - inbox_agent      Overnight agent draft acceptance
 *   - voice_clone      Voice-cloned reply acceptance
 *
 * NOTE: All signal payloads are non-PII by construction. Email IDs are
 * opaque references; recipient addresses are never recorded.
 */

import { z } from "zod";

// ─── Category enum ──────────────────────────────────────────────────────────

export const SignalCategory = {
  Compose: "compose",
  Triage: "triage",
  SmartReply: "smart_reply",
  VoiceProfile: "voice_profile",
  Phishing: "phishing",
  Search: "search",
  InboxAgent: "inbox_agent",
  VoiceClone: "voice_clone",
} as const;

export type SignalCategory =
  (typeof SignalCategory)[keyof typeof SignalCategory];

// ─── Per-category payload schemas (zod) ─────────────────────────────────────

export const ComposeSignalSchema = z.object({
  category: z.literal("compose"),
  event: z.enum([
    "suggestion_shown",
    "suggestion_accepted",
    "suggestion_edited",
    "suggestion_discarded",
    "email_sent",
  ]),
  wordsChangedAfterAcceptPct: z.number().min(0).max(1).optional(),
  finalEmailLength: z.number().int().nonnegative().optional(),
  timeToSendAfterComposeMs: z.number().int().nonnegative().optional(),
});

export const TriageSignalSchema = z.object({
  category: z.literal("triage"),
  event: z.enum([
    "priority_assigned",
    "user_kept",
    "user_archived",
    "user_snoozed",
    "user_replied",
    "user_deleted",
  ]),
  aiPriority: z.enum(["urgent", "important", "normal", "low"]).optional(),
  timeToActionMs: z.number().int().nonnegative().optional(),
  actionMatchesPriority: z.boolean().optional(),
});

export const SmartReplySignalSchema = z.object({
  category: z.literal("smart_reply"),
  event: z.enum(["shown", "chosen", "edited_before_send", "discarded"]),
  suggestionsShown: z.number().int().min(0).max(10).optional(),
  suggestionIndexChosen: z.number().int().min(0).max(9).optional(),
  editDistanceFromSuggestion: z.number().min(0).optional(),
});

export const VoiceProfileSignalSchema = z.object({
  category: z.literal("voice_profile"),
  event: z.enum(["draft_generated", "draft_sent", "draft_edited", "profile_retrained"]),
  wasAiDrafted: z.boolean().optional(),
  editDistanceFromDraft: z.number().min(0).optional(),
  formalityScore: z.number().min(0).max(1).optional(),
  avgSentenceLength: z.number().min(0).optional(),
  vocabularyMatchPct: z.number().min(0).max(1).optional(),
});

export const PhishingSignalSchema = z.object({
  category: z.literal("phishing"),
  event: z.enum([
    "risk_score_assigned",
    "user_confirmed_phishing",
    "user_marked_safe",
    "false_positive",
    "false_negative",
  ]),
  riskScore: z.number().min(0).max(1).optional(),
});

export const SearchSignalSchema = z.object({
  category: z.literal("search"),
  event: z.enum(["query_run", "result_clicked", "found_what_needed", "abandoned"]),
  queryType: z.enum(["keyword", "natural_language", "operator"]).optional(),
  resultsCount: z.number().int().nonnegative().optional(),
  resultClickedPosition: z.number().int().nonnegative().optional(),
});

export const InboxAgentSignalSchema = z.object({
  category: z.literal("inbox_agent"),
  event: z.enum([
    "run_started",
    "draft_proposed",
    "draft_approved",
    "draft_rejected",
    "draft_edited",
    "briefing_viewed",
  ]),
  confidence: z.number().min(0).max(1).optional(),
});

export const VoiceCloneSignalSchema = z.object({
  category: z.literal("voice_clone"),
  event: z.enum([
    "draft_generated",
    "draft_sent_unchanged",
    "draft_sent_edited",
    "draft_discarded",
  ]),
  profileId: z.string().min(1).max(64).optional(),
  editDistanceFromDraft: z.number().min(0).optional(),
});

// ─── Discriminated union (this is what callers send to recordSignal) ────────

export const SignalPayloadSchema = z.discriminatedUnion("category", [
  ComposeSignalSchema,
  TriageSignalSchema,
  SmartReplySignalSchema,
  VoiceProfileSignalSchema,
  PhishingSignalSchema,
  SearchSignalSchema,
  InboxAgentSignalSchema,
  VoiceCloneSignalSchema,
]);

export type SignalPayload = z.infer<typeof SignalPayloadSchema>;

// ─── Aggregated metrics (what /admin/flywheel and /your-ai read) ────────────

export interface FlywheelMetric {
  readonly key: string;
  readonly label: string;
  readonly category: SignalCategory;
  readonly value: number; // 0..1 for rates, raw for counts
  readonly unit: "rate" | "count" | "ms" | "edit_distance";
  readonly target: number;
  readonly direction: "maximize" | "minimize";
  readonly trend: readonly TrendPoint[]; // last 12 weeks ordered oldest→newest
}

export interface TrendPoint {
  readonly weekStartIso: string; // YYYY-MM-DD (Monday)
  readonly value: number;
  readonly sampleSize: number;
}

export interface FlywheelSnapshot {
  readonly generatedAtIso: string;
  readonly windowDays: number;
  readonly totalSignals: number;
  readonly metrics: readonly FlywheelMetric[];
  readonly rpm: number; // 0..1 composite "is the wheel turning?" score
}

// ─── Per-user (Your AlecRae) view ───────────────────────────────────────────

export interface UserFlywheelStats {
  readonly userId: string;
  readonly generatedAtIso: string;
  readonly voiceProfileConfidence: number; // 0..1
  readonly draftsAcceptedCount: number;
  readonly draftsAcceptedPct: number; // 0..1
  readonly minutesSavedEstimate: number;
  readonly wordsLearned: number;
  readonly daysActive: number;
  readonly maturityLabel: "new" | "warming" | "tuned" | "expert";
}
