// =============================================================================
// @alecrae/ai-engine — Smart Inbox Priority Ranker
// =============================================================================
// ML-based priority scoring that ranks emails by urgency, sender importance,
// relationship strength, and learned user behaviour. Adapts to each user's
// open/reply/archive patterns and is time-of-day aware so that urgent messages
// arriving outside active hours are boosted.

import type {
  AIEngineError,
  EmailMessage,
  PriorityRankingResult,
  PriorityTier,
  PrioritySignal,
  SuggestedAction,
  UserBehaviorProfile,
  WeightedSender,
  Result,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Weight factors for each signal category */
const SIGNAL_WEIGHTS = {
  senderImportance: 0.30,
  contentUrgency: 0.25,
  relationshipStrength: 0.20,
  behaviorPattern: 0.15,
  timeRelevance: 0.10,
} as const;

/** Tier thresholds — score must be >= value to qualify */
const TIER_THRESHOLDS: readonly { readonly tier: PriorityTier; readonly min: number }[] = [
  { tier: 'critical', min: 0.85 },
  { tier: 'high', min: 0.65 },
  { tier: 'medium', min: 0.40 },
  { tier: 'low', min: 0.20 },
  { tier: 'background', min: 0.0 },
] as const;

/** Keywords that indicate urgency in subject/body */
const URGENCY_KEYWORDS: readonly string[] = [
  'urgent', 'asap', 'immediately', 'critical', 'time-sensitive',
  'deadline', 'emergency', 'action required', 'respond by', 'due today',
  'overdue', 'escalation', 'p0', 'p1', 'blocker', 'outage', 'incident',
  'breaking', 'final notice', 'last chance',
] as const;

/** Keywords that suggest the email is low priority */
const LOW_PRIORITY_KEYWORDS: readonly string[] = [
  'newsletter', 'unsubscribe', 'no-reply', 'noreply', 'digest',
  'weekly update', 'monthly report', 'automated', 'notification',
  'marketing', 'promotion', 'sale', 'offer', 'deal',
] as const;

/** Action-required phrases that indicate the recipient must do something */
const ACTION_REQUIRED_PHRASES: readonly string[] = [
  'please review', 'please approve', 'action required', 'your input',
  'waiting on you', 'need your', 'can you', 'could you', 'would you',
  'please confirm', 'sign off', 'your approval', 'assigned to you',
] as const;

// ---------------------------------------------------------------------------
// VIP Detection
// ---------------------------------------------------------------------------

interface VIPRule {
  readonly pattern: string;
  readonly boost: number;
  readonly reason: string;
}

const DEFAULT_VIP_RULES: readonly VIPRule[] = [
  { pattern: 'ceo@', boost: 0.3, reason: 'C-suite sender' },
  { pattern: 'cto@', boost: 0.3, reason: 'C-suite sender' },
  { pattern: 'cfo@', boost: 0.3, reason: 'C-suite sender' },
  { pattern: 'coo@', boost: 0.3, reason: 'C-suite sender' },
  { pattern: 'founder@', boost: 0.25, reason: 'Founder sender' },
  { pattern: 'president@', boost: 0.25, reason: 'Executive sender' },
] as const;

// ---------------------------------------------------------------------------
// Priority Ranker
// ---------------------------------------------------------------------------

export interface PriorityRankerConfig {
  /** Custom VIP rules in addition to defaults */
  readonly additionalVipRules?: readonly VIPRule[];
  /** Override signal weights for tuning */
  readonly weights?: Partial<typeof SIGNAL_WEIGHTS>;
  /** Night hours (0-23) during which urgent emails get a boost */
  readonly nightHoursStart?: number;
  readonly nightHoursEnd?: number;
  /** Boost applied to urgent emails arriving at night */
  readonly nightBoost?: number;
}

export class PriorityRanker {
  private readonly behaviorProfiles = new Map<string, UserBehaviorProfile>();
  private readonly vipSenders = new Map<string, Set<string>>();
  private readonly config: PriorityRankerConfig;
  private readonly vipRules: readonly VIPRule[];

  constructor(config: PriorityRankerConfig = {}) {
    this.config = config;
    this.vipRules = [
      ...DEFAULT_VIP_RULES,
      ...(config.additionalVipRules ?? []),
    ];
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /** Register or update a user's behaviour profile for adaptive ranking */
  setBehaviorProfile(profile: UserBehaviorProfile): void {
    this.behaviorProfiles.set(profile.userId, profile);
  }

  /** Get a user's behaviour profile */
  getBehaviorProfile(userId: string): UserBehaviorProfile | undefined {
    return this.behaviorProfiles.get(userId);
  }

  /** Mark a sender as VIP for a specific user */
  addVipSender(userId: string, senderAddress: string): void {
    let set = this.vipSenders.get(userId);
    if (!set) {
      set = new Set();
      this.vipSenders.set(userId, set);
    }
    set.add(senderAddress.toLowerCase());
  }

  /** Remove VIP status for a sender */
  removeVipSender(userId: string, senderAddress: string): void {
    this.vipSenders.get(userId)?.delete(senderAddress.toLowerCase());
  }

  /** Check whether a sender is a VIP for a given user */
  isVipSender(userId: string, senderAddress: string): boolean {
    return this.vipSenders.get(userId)?.has(senderAddress.toLowerCase()) ?? false;
  }

  /**
   * Rank an email's priority for a specific user.
   * Returns a composite score, tier, contributing signals, and suggested actions.
   */
  rank(email: EmailMessage, userId: string): Result<PriorityRankingResult> {
    try {
      const profile = this.behaviorProfiles.get(userId);
      const signals: PrioritySignal[] = [];

      // --- Signal 1: Sender importance ---
      const senderSignal = this.scoreSenderImportance(email, userId, profile);
      signals.push(senderSignal);

      // --- Signal 2: Content urgency ---
      const urgencySignal = this.scoreContentUrgency(email);
      signals.push(urgencySignal);

      // --- Signal 3: Relationship strength ---
      const relationshipSignal = this.scoreRelationshipStrength(email, profile);
      signals.push(relationshipSignal);

      // --- Signal 4: Behavior patterns ---
      const behaviorSignal = this.scoreBehaviorPatterns(email, profile);
      signals.push(behaviorSignal);

      // --- Signal 5: Time relevance ---
      const timeSignal = this.scoreTimeRelevance(email, urgencySignal.value);
      signals.push(timeSignal);

      // --- Composite score ---
      const weights = { ...SIGNAL_WEIGHTS, ...this.config.weights };
      let compositeScore =
        senderSignal.value * weights.senderImportance +
        urgencySignal.value * weights.contentUrgency +
        relationshipSignal.value * weights.relationshipStrength +
        behaviorSignal.value * weights.behaviorPattern +
        timeSignal.value * weights.timeRelevance;

      compositeScore = Math.max(0, Math.min(1, compositeScore));

      const tier = this.deriveTier(compositeScore);
      const actionRequired = this.detectActionRequired(email);
      const suggestedActions = this.suggestActions(email, tier, profile);

      const expiresAt = this.computeExpiry(tier);
      const result: PriorityRankingResult = {
        emailId: email.id,
        score: Math.round(compositeScore * 1000) / 1000,
        tier,
        signals,
        actionRequired,
        suggestedActions,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      };

      return { ok: true, value: result };
    } catch (err) {
      const error: AIEngineError = {
        code: 'PRIORITY_RANKING_ERROR',
        message: err instanceof Error ? err.message : 'Unknown priority ranking error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  /**
   * Rank a batch of emails and return them sorted by priority (highest first).
   */
  rankBatch(
    emails: readonly EmailMessage[],
    userId: string,
  ): Result<readonly PriorityRankingResult[]> {
    const results: PriorityRankingResult[] = [];

    for (const email of emails) {
      const result = this.rank(email, userId);
      if (!result.ok) {
        return result;
      }
      results.push(result.value);
    }

    results.sort((a, b) => b.score - a.score);
    return { ok: true, value: results };
  }

  /**
   * Record user behaviour (open, reply, archive) for learning.
   * This incrementally updates the profile to improve future rankings.
   */
  recordBehavior(
    userId: string,
    emailId: string,
    action: 'open' | 'reply' | 'archive' | 'delete' | 'star',
    senderAddress: string,
    responseTimeMs?: number,
  ): void {
    let profile = this.behaviorProfiles.get(userId);
    if (!profile) {
      profile = this.createDefaultProfile(userId);
      this.behaviorProfiles.set(userId, profile);
    }

    // Update open/reply patterns
    const hourKey = new Date().getHours().toString();
    const mutableOpenPatterns = new Map(profile.openPatterns);
    const mutableReplyPatterns = new Map(profile.replyPatterns);

    if (action === 'open') {
      mutableOpenPatterns.set(hourKey, (mutableOpenPatterns.get(hourKey) ?? 0) + 1);
    } else if (action === 'reply') {
      mutableReplyPatterns.set(hourKey, (mutableReplyPatterns.get(hourKey) ?? 0) + 1);
    }

    // Update important senders based on reply behaviour
    const mutableSenders = [...profile.importantSenders];
    const existingIdx = mutableSenders.findIndex(
      (s) => s.address === senderAddress,
    );

    if (action === 'reply' || action === 'star') {
      if (existingIdx >= 0) {
        const existing = mutableSenders[existingIdx] as WeightedSender;
        mutableSenders[existingIdx] = {
          ...existing,
          weight: Math.min(1, existing.weight + 0.05),
          replyRate: (existing.replyRate * 0.9) + (action === 'reply' ? 0.1 : 0),
          averageResponseTimeMs: responseTimeMs
            ? (existing.averageResponseTimeMs * 0.8) + (responseTimeMs * 0.2)
            : existing.averageResponseTimeMs,
        };
      } else {
        mutableSenders.push({
          address: senderAddress,
          weight: 0.3,
          replyRate: action === 'reply' ? 1.0 : 0.0,
          averageResponseTimeMs: responseTimeMs ?? 0,
        });
      }
    } else if (action === 'archive' || action === 'delete') {
      if (existingIdx >= 0) {
        const existing = mutableSenders[existingIdx] as WeightedSender;
        mutableSenders[existingIdx] = {
          ...existing,
          weight: Math.max(0, existing.weight - 0.02),
        };
      }
    }

    this.behaviorProfiles.set(userId, {
      ...profile,
      openPatterns: mutableOpenPatterns,
      replyPatterns: mutableReplyPatterns,
      importantSenders: mutableSenders,
      lastUpdated: Date.now(),
    });
  }

  // -----------------------------------------------------------------------
  // Signal Scorers
  // -----------------------------------------------------------------------

  private scoreSenderImportance(
    email: EmailMessage,
    userId: string,
    profile: UserBehaviorProfile | undefined,
  ): PrioritySignal {
    const senderAddress = email.headers.from.address.toLowerCase();
    let score = 0.5; // neutral default
    const reasons: string[] = [];

    // VIP check (user-defined)
    if (this.isVipSender(userId, senderAddress)) {
      score += 0.35;
      reasons.push('User-defined VIP sender');
    }

    // VIP rule matching
    for (const rule of this.vipRules) {
      if (senderAddress.startsWith(rule.pattern)) {
        score += rule.boost;
        reasons.push(rule.reason);
      }
    }

    // Learned sender importance from profile
    if (profile) {
      const sender = profile.importantSenders.find(
        (s) => s.address === senderAddress,
      );
      if (sender) {
        score += sender.weight * 0.3;
        if (sender.replyRate > 0.7) {
          reasons.push('High reply-rate sender');
        }
      }
    }

    // Direct email (vs CC/BCC) gets a small boost
    const isDirectRecipient = email.headers.to.some(
      (addr) => addr.address.toLowerCase() !== senderAddress,
    );
    if (isDirectRecipient && !email.headers.cc?.length) {
      score += 0.05;
      reasons.push('Direct recipient (no CC)');
    }

    return {
      type: 'sender_importance',
      weight: SIGNAL_WEIGHTS.senderImportance,
      value: Math.max(0, Math.min(1, score)),
      description: reasons.length > 0 ? reasons.join('; ') : 'Standard sender',
    };
  }

  private scoreContentUrgency(email: EmailMessage): PrioritySignal {
    const text = `${email.headers.subject} ${email.content.textBody ?? ''}`.toLowerCase();
    let score = 0.3; // baseline
    const matched: string[] = [];

    // Urgency keyword matching
    for (const keyword of URGENCY_KEYWORDS) {
      if (text.includes(keyword)) {
        score += 0.08;
        matched.push(keyword);
      }
    }

    // Low priority keyword matching (reduces score)
    for (const keyword of LOW_PRIORITY_KEYWORDS) {
      if (text.includes(keyword)) {
        score -= 0.06;
      }
    }

    // Subject line patterns
    if (/^re:/i.test(email.headers.subject)) {
      score += 0.05; // ongoing conversation
    }
    if (/^fwd?:/i.test(email.headers.subject)) {
      score += 0.03; // forwarded to you
    }

    // Many recipients suggests broadcast / low priority
    const recipientCount =
      email.headers.to.length +
      (email.headers.cc?.length ?? 0) +
      (email.headers.bcc?.length ?? 0);
    if (recipientCount > 10) {
      score -= 0.15;
    } else if (recipientCount > 5) {
      score -= 0.08;
    }

    const description = matched.length > 0
      ? `Urgency signals: ${matched.join(', ')}`
      : 'No strong urgency signals';

    return {
      type: 'content_urgency',
      weight: SIGNAL_WEIGHTS.contentUrgency,
      value: Math.max(0, Math.min(1, score)),
      description,
    };
  }

  private scoreRelationshipStrength(
    email: EmailMessage,
    profile: UserBehaviorProfile | undefined,
  ): PrioritySignal {
    if (!profile) {
      return {
        type: 'relationship_strength',
        weight: SIGNAL_WEIGHTS.relationshipStrength,
        value: 0.5,
        description: 'No profile data — default score',
      };
    }

    const senderAddress = email.headers.from.address.toLowerCase();
    const sender = profile.importantSenders.find(
      (s) => s.address === senderAddress,
    );

    if (!sender) {
      return {
        type: 'relationship_strength',
        weight: SIGNAL_WEIGHTS.relationshipStrength,
        value: 0.3,
        description: 'Unknown sender — reduced score',
      };
    }

    // Combine reply rate, response time, and weight
    const replyFactor = sender.replyRate;
    const responseFactor = sender.averageResponseTimeMs > 0
      ? Math.max(0, 1 - sender.averageResponseTimeMs / (24 * 60 * 60 * 1000))
      : 0.5;
    const score = sender.weight * 0.5 + replyFactor * 0.3 + responseFactor * 0.2;

    return {
      type: 'relationship_strength',
      weight: SIGNAL_WEIGHTS.relationshipStrength,
      value: Math.max(0, Math.min(1, score)),
      description: `Relationship score with ${senderAddress}: ${score.toFixed(2)}`,
    };
  }

  private scoreBehaviorPatterns(
    email: EmailMessage,
    profile: UserBehaviorProfile | undefined,
  ): PrioritySignal {
    if (!profile) {
      return {
        type: 'behavior_pattern',
        weight: SIGNAL_WEIGHTS.behaviorPattern,
        value: 0.5,
        description: 'No profile data — default score',
      };
    }

    let score = 0.5;
    const reasons: string[] = [];

    // Keyword importance matching
    const text = `${email.headers.subject} ${email.content.textBody ?? ''}`.toLowerCase();
    for (const kw of profile.importantKeywords) {
      if (text.includes(kw.keyword.toLowerCase())) {
        score += kw.weight * 0.15;
        reasons.push(`Matched important keyword: ${kw.keyword}`);
      }
    }

    // Current hour activity — is the user typically active now?
    const currentHour = new Date().getHours();
    if (profile.activeHours.includes(currentHour)) {
      score += 0.05;
      reasons.push('User typically active at this hour');
    }

    return {
      type: 'behavior_pattern',
      weight: SIGNAL_WEIGHTS.behaviorPattern,
      value: Math.max(0, Math.min(1, score)),
      description: reasons.length > 0 ? reasons.join('; ') : 'Standard behaviour match',
    };
  }

  private scoreTimeRelevance(
    email: EmailMessage,
    urgencyScore: number,
  ): PrioritySignal {
    const now = Date.now();
    const receivedAt = email.receivedAt.getTime();
    const ageMs = now - receivedAt;
    const ageHours = ageMs / (1000 * 60 * 60);

    let score = 0.5;
    const reasons: string[] = [];

    // Recency boost — newer emails score higher
    if (ageHours < 1) {
      score += 0.2;
      reasons.push('Received within the last hour');
    } else if (ageHours < 4) {
      score += 0.1;
      reasons.push('Received within the last 4 hours');
    } else if (ageHours > 24) {
      score -= 0.1;
      reasons.push('Older than 24 hours');
    }

    // Night-time boost for urgent emails
    const currentHour = new Date().getHours();
    const nightStart = this.config.nightHoursStart ?? 22;
    const nightEnd = this.config.nightHoursEnd ?? 7;
    const isNight = nightStart > nightEnd
      ? (currentHour >= nightStart || currentHour < nightEnd)
      : (currentHour >= nightStart && currentHour < nightEnd);

    if (isNight && urgencyScore > 0.6) {
      const boost = this.config.nightBoost ?? 0.15;
      score += boost;
      reasons.push('Urgent email during off-hours — boosted');
    }

    return {
      type: 'time_relevance',
      weight: SIGNAL_WEIGHTS.timeRelevance,
      value: Math.max(0, Math.min(1, score)),
      description: reasons.length > 0 ? reasons.join('; ') : 'Normal time relevance',
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private deriveTier(score: number): PriorityTier {
    for (const { tier, min } of TIER_THRESHOLDS) {
      if (score >= min) return tier;
    }
    return 'background';
  }

  private detectActionRequired(email: EmailMessage): boolean {
    const text = `${email.headers.subject} ${email.content.textBody ?? ''}`.toLowerCase();
    return ACTION_REQUIRED_PHRASES.some((phrase) => text.includes(phrase));
  }

  private suggestActions(
    email: EmailMessage,
    tier: PriorityTier,
    profile: UserBehaviorProfile | undefined,
  ): SuggestedAction[] {
    const actions: SuggestedAction[] = [];
    const text = `${email.headers.subject} ${email.content.textBody ?? ''}`.toLowerCase();

    // Reply suggestion for high-priority
    if (tier === 'critical' || tier === 'high') {
      actions.push({
        type: 'reply',
        confidence: tier === 'critical' ? 0.9 : 0.7,
        reason: 'High-priority email likely requires a response',
      });
    }

    // Archive suggestion for low-priority
    if (tier === 'background' || tier === 'low') {
      actions.push({
        type: 'archive',
        confidence: tier === 'background' ? 0.85 : 0.6,
        reason: 'Low-priority email suitable for archival',
      });
    }

    // Unsubscribe suggestion for newsletters
    if (text.includes('unsubscribe') && text.includes('newsletter')) {
      actions.push({
        type: 'unsubscribe',
        confidence: 0.7,
        reason: 'Newsletter with unsubscribe option detected',
      });
    }

    // Schedule suggestion if outside active hours
    if (profile) {
      const currentHour = new Date().getHours();
      if (!profile.activeHours.includes(currentHour) && tier !== 'critical') {
        actions.push({
          type: 'schedule',
          confidence: 0.6,
          reason: 'Outside active hours — consider scheduling for later',
        });
      }
    }

    return actions;
  }

  private computeExpiry(tier: PriorityTier): number | undefined {
    const now = Date.now();
    switch (tier) {
      case 'critical': return now + 4 * 60 * 60 * 1000;    // 4 hours
      case 'high': return now + 12 * 60 * 60 * 1000;       // 12 hours
      case 'medium': return now + 24 * 60 * 60 * 1000;     // 24 hours
      case 'low': return now + 72 * 60 * 60 * 1000;        // 3 days
      case 'background': return undefined;                   // no expiry
    }
  }

  private createDefaultProfile(userId: string): UserBehaviorProfile {
    return {
      userId,
      openPatterns: new Map(),
      replyPatterns: new Map(),
      importantSenders: [],
      importantKeywords: [],
      activeHours: [9, 10, 11, 12, 13, 14, 15, 16, 17],
      averageResponseTimeMs: 0,
      lastUpdated: Date.now(),
    };
  }
}
