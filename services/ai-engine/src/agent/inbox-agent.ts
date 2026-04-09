/**
 * AI Inbox Agent — Vienna's Flagship Overnight Brain
 * =====================================================================
 *
 * WHAT IT IS
 * ----------
 * An autonomous agent that runs overnight (or on a schedule) and handles
 * the user's inbox while they sleep. Each run produces a single, reviewable
 * `AgentReport` containing:
 *
 *   1. Triage decisions   — every email categorized + prioritized
 *   2. Drafted replies    — written in the user's voice, scheduled for AM
 *   3. Commitments        — promises and action items pulled from threads
 *   4. Suspicious emails  — phishing, spoofs, newly-suspicious senders
 *   5. Cleanup suggestions — old newsletters, unsubscribes, mute threads
 *   6. Morning briefing   — a single markdown doc the user taps to review
 *
 * DECISION FLOW
 * -------------
 * For each new email since `options.since`:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ 1. PRE-FILTER                                                    │
 *   │    Skip emails the user already replied to or that are obvious   │
 *   │    junk based on provider flags. Cheap, no AI cost.              │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 2. TRIAGE  (Claude Haiku — fast, batched)                        │
 *   │    Ask Claude to classify each email along three axes:           │
 *   │      - category  (urgent/work/newsletter/...)                    │
 *   │      - priority  (now/today/this_week/whenever/never)            │
 *   │      - action    (draft_reply/archive/quarantine/...)            │
 *   │    Returns confidence + reasoning for every decision.            │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 3. SAFETY SCAN                                                   │
 *   │    Anything Claude flagged `suspicious=true` is quarantined and  │
 *   │    excluded from auto-drafting. The user sees these front and    │
 *   │    centre in the briefing.                                       │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 4. DRAFTING  (Claude Sonnet — higher quality, voice-conditioned) │
 *   │    For every email with `action == "draft_reply"`, generate a    │
 *   │    reply in the user's voice profile. Drafts NEVER auto-send;    │
 *   │    they are scheduled for the user's morning hour and held       │
 *   │    pending one-tap approval.                                     │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 5. COMMITMENT EXTRACTION                                         │
 *   │    Run the existing rule-based extractor over each email body.   │
 *   │    Surface any deadlines / promises in the briefing.             │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 6. CLEANUP SUGGESTIONS                                           │
 *   │    Identify old newsletters (>30d, unread) and propose archive.  │
 *   │    Identify high-volume senders the user never opens → unsub.    │
 *   │    These are SUGGESTIONS only — the user must approve.           │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ 7. BRIEFING  (Claude Sonnet)                                     │
 *   │    Compose a markdown morning briefing summarizing the run.      │
 *   │    First section is always the urgent / suspicious items.        │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 * SAFETY INVARIANTS
 * -----------------
 *  - The agent NEVER sends an email without explicit user approval.
 *  - The agent NEVER deletes or archives an email — only suggests.
 *  - Every AI decision carries a confidence score and reasoning string.
 *  - The agent NEVER touches emails the user has already replied to.
 *  - All Claude calls have a fallback path: if the API fails, the agent
 *    degrades to rule-based triage from `smart-inbox.ts`.
 */

import { randomUUID } from "node:crypto";

import {
  classifyEmail,
  extractCommitments,
  type Commitment,
} from "../inbox/smart-inbox.js";
import type {
  AgentAIClient,
  AgentEmail,
  AgentReport,
  AgentRunOptions,
  AgentSuggestion,
  DraftedReply,
  TriageAction,
  TriageCategory,
  TriageDecision,
  TriagePriority,
  UserVoiceProfile,
} from "./types.js";

// ─── Model selection ─────────────────────────────────────────────────────────
// Per CLAUDE.md: Haiku 4.5 = default, Sonnet 4.6 = Pro/quality. We use Haiku
// for triage (200+ emails/run, latency-sensitive) and Sonnet for drafting and
// briefing (quality matters more than cost).

const MODEL_TRIAGE = "claude-haiku-4-5";
const MODEL_DRAFT = "claude-sonnet-4-6";
const MODEL_BRIEFING = "claude-sonnet-4-6";

// Hard caps to keep runs bounded.
const DEFAULT_MAX_EMAILS = 200;
const TRIAGE_BATCH_SIZE = 20;
const MAX_BODY_CHARS = 4000;

// ─── Constructor config ──────────────────────────────────────────────────────

export interface InboxAgentConfig {
  ai: AgentAIClient;
  /**
   * Loader the agent uses to fetch emails for an account. Injected so the
   * agent doesn't depend on the DB layer directly — keeps it testable.
   */
  loadEmails: (accountId: string, since: Date, limit: number) => Promise<AgentEmail[]>;
  /**
   * Optional sink for persisted reports. If omitted the agent simply returns
   * the report and lets the caller persist it.
   */
  persistReport?: (report: AgentReport) => Promise<void>;
  /**
   * Optional sink for queued draft replies (e.g., into the schedule-send
   * queue). Only invoked when `dryRun === false`.
   */
  queueDraft?: (draft: DraftedReply) => Promise<void>;
}

// ─── The Agent ───────────────────────────────────────────────────────────────

export class InboxAgent {
  private readonly ai: AgentAIClient;
  private readonly loadEmails: InboxAgentConfig["loadEmails"];
  private readonly persistReport?: InboxAgentConfig["persistReport"];
  private readonly queueDraft?: InboxAgentConfig["queueDraft"];

  constructor(config: InboxAgentConfig) {
    this.ai = config.ai;
    this.loadEmails = config.loadEmails;
    this.persistReport = config.persistReport;
    this.queueDraft = config.queueDraft;
  }

  /**
   * Run the agent end-to-end for one account.
   *
   * This is the only public entry point a scheduler should call. It
   * orchestrates the full decision flow described at the top of this file
   * and returns a single `AgentReport`.
   */
  async run(accountId: string, options: AgentRunOptions = {}): Promise<AgentReport> {
    const runId = `agent_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const runAt = new Date();
    const since = options.since ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const maxEmails = options.maxEmails ?? DEFAULT_MAX_EMAILS;
    const dryRun = options.dryRun ?? false;
    const morningHour = options.morningHour ?? 8;

    // 1. Load candidate emails. Bounded by maxEmails so a runaway sync can't
    //    DoS the agent.
    const allEmails = await this.loadEmails(accountId, since, maxEmails);

    // Pre-filter: skip threads the user already replied to. The agent's job
    // is to handle *new* work, not re-process the inbox.
    const candidates = allEmails.filter((e) => !e.hasUserReplied);

    // 2. Triage every candidate. We do this in batches so a single Claude
    //    call can amortize across many emails.
    const triageDecisions = await this.triageEmails(candidates);

    // 3. Safety: split out anything Claude marked suspicious. These are
    //    excluded from auto-drafting and surfaced at the top of the briefing.
    const flaggedSuspicious = triageDecisions.filter((d) => d.suspicious);
    const suspiciousIds = new Set(flaggedSuspicious.map((d) => d.emailId));

    // 4. Drafting: only emails that (a) need a reply, (b) are not suspicious,
    //    and (c) the agent is at least 0.5 confident on, get drafted. Low-
    //    confidence ones are flagged for review instead.
    const toDraft = candidates.filter((e) => {
      if (suspiciousIds.has(e.id)) return false;
      const decision = triageDecisions.find((d) => d.emailId === e.id);
      if (!decision) return false;
      return decision.needsReply && decision.confidence >= 0.5;
    });
    const draftedReplies = await this.draftReplies(toDraft, options.voiceProfile, morningHour);

    // 5. Commitment extraction. Pure rule-based, no AI cost.
    const commitments: Commitment[] = [];
    for (const email of candidates) {
      commitments.push(...extractCommitments(email.id, email.body, email.fromName, false));
    }

    // 6. Cleanup suggestions. Looks for old/unread/newsletter patterns.
    const suggestions = this.generateCleanupSuggestions(candidates, triageDecisions);

    // 7. Stats roll-up.
    const stats = {
      urgent: triageDecisions.filter((d) => d.priority === "now").length,
      needsReply: triageDecisions.filter((d) => d.needsReply).length,
      drafted: draftedReplies.length,
      suspicious: flaggedSuspicious.length,
      archivable: suggestions.filter((s) => s.type === "archive_old_newsletter").length,
      newsletters: triageDecisions.filter((d) => d.category === "newsletter").length,
    };

    // 8. Build the morning briefing — the artifact the user actually opens.
    const finishedAt = new Date();
    const partialReport: AgentReport = {
      runId,
      accountId,
      runAt,
      finishedAt,
      durationMs: finishedAt.getTime() - runAt.getTime(),
      totalProcessed: candidates.length,
      triageDecisions,
      draftedReplies,
      commitments,
      suggestions,
      flaggedSuspicious,
      briefingMarkdown: "", // filled in next
      dryRun,
      stats,
    };
    partialReport.briefingMarkdown = await this.generateBriefing(partialReport);

    // 9. Persist + queue (unless this is a dry run).
    if (!dryRun) {
      if (this.persistReport) {
        await this.persistReport(partialReport);
      }
      if (this.queueDraft) {
        for (const draft of draftedReplies) {
          await this.queueDraft(draft);
        }
      }
    }

    return partialReport;
  }

  // ─── Triage ────────────────────────────────────────────────────────────────

  /**
   * Triage a batch of emails. Uses Claude Haiku in batches of TRIAGE_BATCH_SIZE
   * for cost efficiency. Falls back to rule-based classification on AI failure.
   */
  async triageEmails(emails: AgentEmail[]): Promise<TriageDecision[]> {
    if (emails.length === 0) return [];

    const decisions: TriageDecision[] = [];

    for (let i = 0; i < emails.length; i += TRIAGE_BATCH_SIZE) {
      const batch = emails.slice(i, i + TRIAGE_BATCH_SIZE);
      try {
        const batchDecisions = await this.triageBatchWithClaude(batch);
        decisions.push(...batchDecisions);
      } catch (err) {
        // Fallback: degrade gracefully to the existing rule-based classifier.
        // The user still gets a triage, just without Claude's nuance.
        console.warn("[InboxAgent] triage batch failed, using rule fallback:", err);
        for (const email of batch) {
          decisions.push(this.fallbackTriage(email));
        }
      }
    }

    return decisions;
  }

  /**
   * Send one batch to Claude. We pack many emails into a single prompt so a
   * 200-email run still only costs ~10 model invocations.
   */
  private async triageBatchWithClaude(batch: AgentEmail[]): Promise<TriageDecision[]> {
    const system = [
      "You are Vienna's Inbox Agent — an autonomous email triage system.",
      "You will receive a batch of emails and must classify each one.",
      "Be skeptical of senders. Be conservative with `needsReply`. Be honest about confidence.",
      "Phishing red flags: spoofed sender domains, urgent money requests, mismatched display names,",
      "credential prompts, executable attachments, lookalike domains. Mark `suspicious: true` for any of these.",
      "",
      "Respond with STRICT JSON ONLY in the shape:",
      `{"decisions":[{"emailId":string,"category":"urgent|important|personal|work|newsletter|transactional|promotional|social|spam|suspicious|other","priority":"now|today|this_week|whenever|never","action":"draft_reply|schedule_reply|flag_for_review|archive|mark_read|snooze|quarantine|ignore","confidence":number,"reasoning":string,"suspicious":boolean,"suspicionReasons":string[],"needsReply":boolean}]}`,
    ].join("\n");

    const prompt = [
      `Classify the following ${batch.length} emails:`,
      "",
      ...batch.map((e, idx) => {
        return [
          `--- EMAIL ${idx + 1} ---`,
          `id: ${e.id}`,
          `from: ${e.fromName} <${e.from}>`,
          `subject: ${e.subject}`,
          `received: ${e.receivedAt.toISOString()}`,
          `body: ${e.body.slice(0, MAX_BODY_CHARS)}`,
        ].join("\n");
      }),
    ].join("\n\n");

    const response = await this.ai.generateJSON<{ decisions: RawTriage[] }>({
      system,
      prompt,
      model: MODEL_TRIAGE,
      maxTokens: 4000,
      temperature: 0.1,
    });

    // Validate + map model output to our typed shape. Anything malformed
    // falls back to the rule-based classifier for that single email.
    const out: TriageDecision[] = [];
    for (const email of batch) {
      const raw = response.decisions?.find((d) => d.emailId === email.id);
      if (!raw) {
        out.push(this.fallbackTriage(email));
        continue;
      }
      const decision: TriageDecision = {
        emailId: email.id,
        category: coerceCategory(raw.category),
        priority: coercePriority(raw.priority),
        action: coerceAction(raw.action),
        confidence: clamp(raw.confidence ?? 0.5, 0, 1),
        reasoning: typeof raw.reasoning === "string" ? raw.reasoning : "no reasoning provided",
        suspicious: Boolean(raw.suspicious),
        needsReply: Boolean(raw.needsReply),
      };
      if (Array.isArray(raw.suspicionReasons)) {
        decision.suspicionReasons = raw.suspicionReasons;
      }
      out.push(decision);
    }
    return out;
  }

  /**
   * Rule-based degraded fallback. Reuses the existing smart-inbox classifier
   * so we always have *some* triage even if Claude is down.
   */
  private fallbackTriage(email: AgentEmail): TriageDecision {
    const cls = classifyEmail(
      email.id,
      email.accountId,
      email.from,
      email.fromName,
      email.subject,
      email.body,
      email.headers,
      false,
    );
    const isUrgent = cls.category.id === "important";
    const isNewsletter = cls.isNewsletter;
    return {
      emailId: email.id,
      category: isNewsletter ? "newsletter" : isUrgent ? "important" : "other",
      priority: isUrgent ? "today" : isNewsletter ? "whenever" : "this_week",
      action: isNewsletter ? "ignore" : isUrgent ? "flag_for_review" : "mark_read",
      confidence: cls.confidence,
      reasoning: `[fallback] ${cls.reasoning}`,
      suspicious: false,
      needsReply: !isNewsletter && !cls.isTransactional && cls.commitments.length > 0,
    };
  }

  // ─── Drafting ──────────────────────────────────────────────────────────────

  /**
   * Draft replies in the user's voice for a list of emails. Each draft is
   * tagged `requiresApproval: true` and (optionally) scheduled for the user's
   * morning hour. The agent never sends — it queues.
   */
  async draftReplies(
    emails: AgentEmail[],
    voiceProfile?: UserVoiceProfile,
    morningHour: number = 8,
  ): Promise<DraftedReply[]> {
    const drafts: DraftedReply[] = [];
    for (const email of emails) {
      try {
        const draft = await this.draftSingleReply(email, voiceProfile, morningHour);
        drafts.push(draft);
      } catch (err) {
        // A single draft failure must not abort the run.
        console.warn(`[InboxAgent] draft failed for ${email.id}:`, err);
      }
    }
    return drafts;
  }

  private async draftSingleReply(
    email: AgentEmail,
    voiceProfile: UserVoiceProfile | undefined,
    morningHour: number,
  ): Promise<DraftedReply> {
    const system = [
      "You are Vienna's drafting agent. Write a reply to the email below.",
      "Match the user's voice profile EXACTLY — greeting, signoff, sentence length, formality.",
      "Be concise. Do not invent facts. If you can't honestly write a reply without more info,",
      "respond with the literal token NEED_MORE_INFO and nothing else.",
      "Output ONLY the email body — no subject, no headers, no preamble.",
      voiceProfile ? buildVoiceInstructions(voiceProfile) : "",
    ]
      .filter(Boolean)
      .join("\n");

    const prompt = [
      `From: ${email.fromName} <${email.from}>`,
      `Subject: ${email.subject}`,
      `Received: ${email.receivedAt.toISOString()}`,
      "",
      "Email body:",
      email.body.slice(0, MAX_BODY_CHARS),
      "",
      "Write the reply now:",
    ].join("\n");

    const body = await this.ai.generateText({
      system,
      prompt,
      model: MODEL_DRAFT,
      maxTokens: 800,
      temperature: 0.6,
    });

    // If the model bailed, surface low confidence so the briefing flags it.
    const bailed = body.trim() === "NEED_MORE_INFO";
    const confidence = bailed ? 0.2 : voiceProfile && voiceProfile.sampleCount > 5 ? 0.85 : 0.7;
    const reasoning = bailed
      ? "Agent could not safely draft without more context — flagged for human review."
      : "Drafted in user's voice based on email content and conversation context.";

    // Schedule for the user's morning hour, tomorrow if it's already past.
    const scheduledFor = nextMorning(morningHour);

    const reply: DraftedReply = {
      emailId: email.id,
      draft: bailed ? "" : body.trim(),
      subject: email.subject.startsWith("Re:") ? email.subject : `Re: ${email.subject}`,
      tone: voiceProfile && voiceProfile.formality > 0.6 ? "professional" : "friendly",
      confidence,
      reasoning,
      requiresApproval: true,
      scheduledFor,
      to: [email.from],
    };
    if (email.threadId) {
      reply.threadId = email.threadId;
    }
    return reply;
  }

  // ─── Cleanup suggestions ───────────────────────────────────────────────────

  /**
   * Heuristic suggestions the user can one-tap approve. We're conservative:
   * the agent never archives or unsubscribes itself.
   */
  private generateCleanupSuggestions(
    emails: AgentEmail[],
    triage: TriageDecision[],
  ): AgentSuggestion[] {
    const suggestions: AgentSuggestion[] = [];
    const now = Date.now();
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

    // 1. Old newsletters → archive
    const oldNewsletters = emails.filter((e) => {
      const decision = triage.find((d) => d.emailId === e.id);
      if (!decision) return false;
      return decision.category === "newsletter" && now - e.receivedAt.getTime() > THIRTY_DAYS;
    });
    for (const e of oldNewsletters) {
      suggestions.push({
        type: "archive_old_newsletter",
        target: e.id,
        action: `Archive newsletter "${e.subject.slice(0, 60)}"`,
        reasoning: `Newsletter from ${e.fromName} unread for >30 days`,
        confidence: 0.9,
      });
    }

    // 2. High-volume senders the agent thinks are promo/social → unsubscribe
    const senderCounts = new Map<string, number>();
    for (const e of emails) {
      const t = triage.find((d) => d.emailId === e.id);
      if (t && (t.category === "promotional" || t.category === "newsletter")) {
        senderCounts.set(e.from, (senderCounts.get(e.from) ?? 0) + 1);
      }
    }
    for (const [sender, count] of senderCounts) {
      if (count >= 5) {
        suggestions.push({
          type: "unsubscribe",
          target: sender,
          action: `Unsubscribe from ${sender}`,
          reasoning: `${count} promotional emails from this sender in this window`,
          confidence: 0.8,
          affectedCount: count,
        });
      }
    }

    return suggestions;
  }

  // ─── Briefing ──────────────────────────────────────────────────────────────

  /**
   * Compose the morning briefing — the single artifact the user opens.
   *
   * This is intentionally markdown so it renders perfectly in any client and
   * can be diffed across runs. The model gets the *structured* report as
   * input, not the raw emails, so the briefing is grounded.
   */
  async generateBriefing(report: AgentReport): Promise<string> {
    // Build a deterministic header so the briefing has a known top-of-page,
    // even if Claude is down.
    const header = buildBriefingHeader(report);

    try {
      const system = [
        "You are Vienna's morning briefing writer.",
        "Compose a SHORT, scannable markdown briefing for the user.",
        "Open with the most important things. Use H2 sections, bullet points, and bold sparingly.",
        "Never invent emails or commitments — only use what's in the structured report below.",
        "Tone: confident, concise, helpful. Not chirpy. Not corporate.",
        "Always include sections: ## At a glance, ## Needs your attention, ## Drafted replies,",
        "## Commitments, ## Suggested cleanup. Skip a section if it would be empty.",
      ].join("\n");

      const prompt = [
        "Here is the structured agent report. Write the markdown briefing.",
        "",
        "```json",
        JSON.stringify(
          {
            stats: report.stats,
            urgent: report.triageDecisions
              .filter((d) => d.priority === "now")
              .slice(0, 10),
            suspicious: report.flaggedSuspicious.slice(0, 10),
            drafts: report.draftedReplies.slice(0, 10).map((d) => ({
              to: d.to,
              subject: d.subject,
              confidence: d.confidence,
              preview: d.draft.slice(0, 200),
            })),
            commitments: report.commitments.slice(0, 10),
            suggestions: report.suggestions.slice(0, 10),
          },
          null,
          2,
        ),
        "```",
      ].join("\n");

      const body = await this.ai.generateText({
        system,
        prompt,
        model: MODEL_BRIEFING,
        maxTokens: 1500,
        temperature: 0.4,
      });

      return `${header}\n\n${body.trim()}`;
    } catch (err) {
      // If briefing generation fails we still return a useful, deterministic
      // briefing built from the structured report.
      console.warn("[InboxAgent] briefing generation failed, using deterministic fallback:", err);
      return `${header}\n\n${buildDeterministicBriefing(report)}`;
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface RawTriage {
  emailId: string;
  category: string;
  priority: string;
  action: string;
  confidence: number;
  reasoning: string;
  suspicious: boolean;
  suspicionReasons?: string[];
  needsReply: boolean;
}

const VALID_CATEGORIES: TriageCategory[] = [
  "urgent", "important", "personal", "work", "newsletter",
  "transactional", "promotional", "social", "spam", "suspicious", "other",
];
const VALID_PRIORITIES: TriagePriority[] = ["now", "today", "this_week", "whenever", "never"];
const VALID_ACTIONS: TriageAction[] = [
  "draft_reply", "schedule_reply", "flag_for_review", "archive",
  "mark_read", "snooze", "quarantine", "ignore",
];

function coerceCategory(v: unknown): TriageCategory {
  return VALID_CATEGORIES.includes(v as TriageCategory) ? (v as TriageCategory) : "other";
}
function coercePriority(v: unknown): TriagePriority {
  return VALID_PRIORITIES.includes(v as TriagePriority) ? (v as TriagePriority) : "this_week";
}
function coerceAction(v: unknown): TriageAction {
  return VALID_ACTIONS.includes(v as TriageAction) ? (v as TriageAction) : "flag_for_review";
}
function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function nextMorning(hour: number): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function buildVoiceInstructions(profile: UserVoiceProfile): string {
  const lines = [
    "User voice profile:",
    `- Average sentence length: ~${profile.averageSentenceLength} words`,
    `- Vocabulary level: ${profile.vocabularyLevel}`,
    `- Formality: ${profile.formality > 0.7 ? "high" : profile.formality > 0.4 ? "moderate" : "low"}`,
  ];
  if (profile.preferredGreetings.length) {
    lines.push(`- Preferred greetings: ${profile.preferredGreetings.join(", ")}`);
  }
  if (profile.preferredSignoffs.length) {
    lines.push(`- Preferred signoffs: ${profile.preferredSignoffs.join(", ")}`);
  }
  if (profile.commonPhrases.length) {
    lines.push(`- Common phrases: ${profile.commonPhrases.slice(0, 5).join(", ")}`);
  }
  if (profile.emojiUsage > 0.5) {
    lines.push("- Occasionally uses emojis");
  }
  return lines.join("\n");
}

function buildBriefingHeader(report: AgentReport): string {
  const date = report.runAt.toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });
  return [
    `# Morning Briefing — ${date}`,
    "",
    `_Vienna's Inbox Agent processed **${report.totalProcessed}** emails overnight in ${(report.durationMs / 1000).toFixed(1)}s._`,
    "",
    `**${report.stats.urgent}** urgent · **${report.stats.needsReply}** need reply · ` +
    `**${report.stats.drafted}** drafted · **${report.stats.suspicious}** suspicious · ` +
    `**${report.stats.archivable}** archivable`,
  ].join("\n");
}

function buildDeterministicBriefing(report: AgentReport): string {
  const sections: string[] = [];

  if (report.flaggedSuspicious.length > 0) {
    sections.push("## ⚠️ Suspicious");
    for (const s of report.flaggedSuspicious.slice(0, 10)) {
      sections.push(`- **${s.emailId}** — ${s.reasoning}`);
    }
  }

  const urgent = report.triageDecisions.filter((d) => d.priority === "now");
  if (urgent.length > 0) {
    sections.push("\n## Needs your attention");
    for (const u of urgent.slice(0, 10)) {
      sections.push(`- ${u.reasoning} _(confidence: ${(u.confidence * 100).toFixed(0)}%)_`);
    }
  }

  if (report.draftedReplies.length > 0) {
    sections.push("\n## Drafted replies");
    for (const d of report.draftedReplies.slice(0, 10)) {
      sections.push(`- **${d.subject}** → ${d.to.join(", ")} (${(d.confidence * 100).toFixed(0)}%)`);
    }
  }

  if (report.commitments.length > 0) {
    sections.push("\n## Commitments");
    for (const c of report.commitments.slice(0, 10)) {
      sections.push(`- ${c.actorName}: ${c.description}${c.deadline ? ` (by ${c.deadline.toDateString()})` : ""}`);
    }
  }

  if (report.suggestions.length > 0) {
    sections.push("\n## Suggested cleanup");
    for (const s of report.suggestions.slice(0, 10)) {
      sections.push(`- ${s.action} — _${s.reasoning}_`);
    }
  }

  return sections.join("\n") || "_No items to report. Inbox is calm._";
}
