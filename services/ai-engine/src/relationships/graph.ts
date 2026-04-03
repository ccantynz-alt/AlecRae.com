// =============================================================================
// @emailed/ai-engine — Communication Intelligence Graph
// =============================================================================
// Builds and maintains a knowledge graph of user relationships from email
// activity. Scores relationship strength, detects communication patterns,
// identifies contacts that need follow-up, and surfaces relationship health
// indicators over time.

import type {
  ContactNode,
  RelationshipEdge,
  CommunicationFrequency,
  SentimentTrend,
  RelationshipInsight,
  EmailMessage,
  Result,
  AIEngineError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_VERSION = '1.0.0';

/** Decay factor applied per day to relationship strength (exponential decay) */
const DAILY_DECAY_FACTOR = 0.995;

/** Minimum interactions required before generating insights */
const MIN_INTERACTIONS_FOR_INSIGHTS = 3;

/** Number of days without contact before a follow-up insight is generated */
const FOLLOW_UP_THRESHOLD_DAYS = 14;

/** Number of recent sentiment scores to retain for trend calculation */
const SENTIMENT_HISTORY_SIZE = 20;

/** Strength thresholds */
const STRENGTH_THRESHOLDS = {
  strong: 0.7,
  moderate: 0.4,
  weak: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Communication Pattern Types
// ---------------------------------------------------------------------------

export type CommunicationPatternType =
  | 'regular_correspondent'
  | 'newsletter'
  | 'automated_notification'
  | 'one_way_outbound'
  | 'one_way_inbound'
  | 'burst_communication'
  | 'dormant';

export interface CommunicationPattern {
  readonly type: CommunicationPatternType;
  readonly confidence: number;
  readonly description: string;
  readonly detectedAt: number;
}

export interface FollowUpReminder {
  readonly contactId: string;
  readonly contactName: string | undefined;
  readonly lastContactDate: number;
  readonly daysSinceContact: number;
  readonly relationshipStrength: number;
  readonly suggestedAction: string;
  readonly priority: 'high' | 'medium' | 'low';
}

export interface RelationshipHealth {
  readonly contactId: string;
  readonly overallHealth: 'thriving' | 'stable' | 'cooling' | 'at_risk' | 'dormant';
  readonly strengthScore: number;
  readonly sentimentScore: number;
  readonly frequencyTrend: 'increasing' | 'stable' | 'decreasing';
  readonly reciprocityScore: number;
  readonly details: string;
}

// ---------------------------------------------------------------------------
// Communication Intelligence Graph
// ---------------------------------------------------------------------------

export interface CommunicationGraphConfig {
  /** Days without contact before generating follow-up reminders */
  readonly followUpThresholdDays?: number;
  /** Minimum interactions before generating insights */
  readonly minInteractionsForInsights?: number;
  /** Daily decay factor for relationship strength (0-1) */
  readonly dailyDecayFactor?: number;
}

export class CommunicationGraph {
  private readonly contacts = new Map<string, ContactNode>();
  private readonly edges = new Map<string, RelationshipEdge>();
  private readonly patterns = new Map<string, CommunicationPattern[]>();
  private readonly config: Required<CommunicationGraphConfig>;

  constructor(config: CommunicationGraphConfig = {}) {
    this.config = {
      followUpThresholdDays: config.followUpThresholdDays ?? FOLLOW_UP_THRESHOLD_DAYS,
      minInteractionsForInsights: config.minInteractionsForInsights ?? MIN_INTERACTIONS_FOR_INSIGHTS,
      dailyDecayFactor: config.dailyDecayFactor ?? DAILY_DECAY_FACTOR,
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Graph Operations
  // -----------------------------------------------------------------------

  /** Get a contact node by ID */
  getContact(contactId: string): ContactNode | undefined {
    return this.contacts.get(contactId);
  }

  /** Get all contacts in the graph */
  getAllContacts(): readonly ContactNode[] {
    return [...this.contacts.values()];
  }

  /** Get the relationship edge between two contacts */
  getEdge(sourceId: string, targetId: string): RelationshipEdge | undefined {
    return this.edges.get(this.edgeKey(sourceId, targetId));
  }

  /** Get all edges for a given contact */
  getEdgesForContact(contactId: string): readonly RelationshipEdge[] {
    const result: RelationshipEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.sourceId === contactId || edge.targetId === contactId) {
        result.push(edge);
      }
    }
    return result;
  }

  /**
   * Ingest an email to update the graph.
   * Creates or updates contact nodes and relationship edges.
   */
  ingestEmail(
    email: EmailMessage,
    userId: string,
    direction: 'inbound' | 'outbound',
  ): Result<{ contactsUpdated: number; edgesUpdated: number }> {
    try {
      let contactsUpdated = 0;
      let edgesUpdated = 0;

      const userContactId = this.contactIdFromAddress(userId);
      this.ensureContact(userContactId, [userId], undefined, undefined);

      if (direction === 'inbound') {
        // Sender -> User
        const sender = email.headers.from;
        const senderId = this.contactIdFromAddress(sender.address);
        this.ensureContact(senderId, [sender.address], sender.name, undefined);
        contactsUpdated++;

        this.updateEdge(senderId, userContactId, email.receivedAt.getTime());
        edgesUpdated++;
      } else {
        // User -> each recipient
        const recipients = [
          ...email.headers.to,
          ...(email.headers.cc ?? []),
        ];

        for (const recipient of recipients) {
          const recipientId = this.contactIdFromAddress(recipient.address);
          this.ensureContact(recipientId, [recipient.address], recipient.name, undefined);
          contactsUpdated++;

          this.updateEdge(userContactId, recipientId, email.receivedAt.getTime());
          edgesUpdated++;
        }
      }

      return { ok: true, value: { contactsUpdated, edgesUpdated } };
    } catch (err) {
      const error: AIEngineError = {
        code: 'GRAPH_INGEST_ERROR',
        message: err instanceof Error ? err.message : 'Unknown graph ingest error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  // -----------------------------------------------------------------------
  // Public API — Relationship Scoring
  // -----------------------------------------------------------------------

  /**
   * Compute the relationship strength between two contacts.
   * Factors in email frequency, reciprocity, and recency.
   */
  computeRelationshipStrength(sourceId: string, targetId: string): number {
    const edge = this.edges.get(this.edgeKey(sourceId, targetId));
    if (!edge) return 0;

    const now = Date.now();
    const daysSinceLastInteraction = (now - edge.lastInteraction) / (1000 * 60 * 60 * 24);

    // Recency-weighted base strength
    const decayedStrength =
      edge.strength * Math.pow(this.config.dailyDecayFactor, daysSinceLastInteraction);

    // Reciprocity bonus — bidirectional communication is stronger
    const reciprocityBonus = edge.bidirectional ? 0.15 : 0;

    // Frequency factor
    const frequencyFactor = Math.min(1, edge.frequency.weekly / 5);

    const combined =
      decayedStrength * 0.5 +
      frequencyFactor * 0.3 +
      reciprocityBonus +
      (edge.sentiment.current > 0 ? 0.05 : 0);

    return Math.max(0, Math.min(1, combined));
  }

  /**
   * Rank all contacts by importance to a given user.
   * Returns contacts sorted by descending relationship strength.
   */
  rankContacts(userId: string): readonly { contact: ContactNode; strength: number }[] {
    const userContactId = this.contactIdFromAddress(userId);
    const edges = this.getEdgesForContact(userContactId);

    const ranked: { contact: ContactNode; strength: number }[] = [];

    for (const edge of edges) {
      const otherId = edge.sourceId === userContactId ? edge.targetId : edge.sourceId;
      const contact = this.contacts.get(otherId);
      if (!contact) continue;

      const strength = this.computeRelationshipStrength(userContactId, otherId);
      ranked.push({ contact, strength });
    }

    ranked.sort((a, b) => b.strength - a.strength);
    return ranked;
  }

  // -----------------------------------------------------------------------
  // Public API — Pattern Detection
  // -----------------------------------------------------------------------

  /**
   * Detect communication patterns for a given contact relationship.
   */
  detectPatterns(sourceId: string, targetId: string): readonly CommunicationPattern[] {
    const edge = this.edges.get(this.edgeKey(sourceId, targetId));
    if (!edge) return [];

    const detected: CommunicationPattern[] = [];
    const now = Date.now();

    // Regular correspondent
    if (edge.frequency.weekly >= 2 && edge.bidirectional) {
      detected.push({
        type: 'regular_correspondent',
        confidence: Math.min(1, edge.frequency.weekly / 5),
        description: `Regular back-and-forth communication (~${edge.frequency.weekly.toFixed(1)} emails/week)`,
        detectedAt: now,
      });
    }

    // Newsletter pattern: one-way inbound, consistent frequency
    if (!edge.bidirectional && edge.frequency.weekly > 0.5 && edge.frequency.trend === 'stable') {
      detected.push({
        type: 'newsletter',
        confidence: 0.7,
        description: 'One-way inbound with regular cadence — likely a newsletter',
        detectedAt: now,
      });
    }

    // Automated notification pattern
    if (!edge.bidirectional && edge.frequency.daily >= 1) {
      detected.push({
        type: 'automated_notification',
        confidence: 0.8,
        description: 'High-frequency one-way messages — likely automated',
        detectedAt: now,
      });
    }

    // One-way outbound
    if (!edge.bidirectional && edge.sourceId === sourceId && edge.totalEmails > 3) {
      detected.push({
        type: 'one_way_outbound',
        confidence: 0.6,
        description: 'You send emails but rarely receive replies',
        detectedAt: now,
      });
    }

    // One-way inbound
    if (!edge.bidirectional && edge.targetId === sourceId && edge.totalEmails > 3) {
      detected.push({
        type: 'one_way_inbound',
        confidence: 0.6,
        description: 'You receive emails but rarely reply',
        detectedAt: now,
      });
    }

    // Dormant relationship
    const daysSince = (now - edge.lastInteraction) / (1000 * 60 * 60 * 24);
    if (daysSince > 60 && edge.totalEmails > 5) {
      detected.push({
        type: 'dormant',
        confidence: 0.8,
        description: `No communication in ${Math.round(daysSince)} days despite prior activity`,
        detectedAt: now,
      });
    }

    // Burst communication
    if (edge.frequency.trend === 'increasing' && edge.frequency.daily > edge.frequency.weekly / 7 * 3) {
      detected.push({
        type: 'burst_communication',
        confidence: 0.65,
        description: 'Recent spike in communication frequency',
        detectedAt: now,
      });
    }

    this.patterns.set(this.edgeKey(sourceId, targetId), detected);
    return detected;
  }

  // -----------------------------------------------------------------------
  // Public API — Follow-Up Detection
  // -----------------------------------------------------------------------

  /**
   * Detect contacts that may need a follow-up based on relationship
   * strength and time since last communication.
   */
  detectFollowUps(userId: string): readonly FollowUpReminder[] {
    const userContactId = this.contactIdFromAddress(userId);
    const edges = this.getEdgesForContact(userContactId);
    const reminders: FollowUpReminder[] = [];
    const now = Date.now();

    for (const edge of edges) {
      const otherId = edge.sourceId === userContactId ? edge.targetId : edge.sourceId;
      const contact = this.contacts.get(otherId);
      if (!contact) continue;

      // Only consider contacts with enough history
      if (contact.totalInteractions < this.config.minInteractionsForInsights) continue;

      const daysSinceContact = (now - edge.lastInteraction) / (1000 * 60 * 60 * 24);
      const strength = this.computeRelationshipStrength(userContactId, otherId);

      // Strong relationships get follow-ups sooner
      const effectiveThreshold = strength > STRENGTH_THRESHOLDS.strong
        ? this.config.followUpThresholdDays * 0.5
        : strength > STRENGTH_THRESHOLDS.moderate
          ? this.config.followUpThresholdDays
          : this.config.followUpThresholdDays * 2;

      if (daysSinceContact >= effectiveThreshold && edge.bidirectional) {
        const priority: FollowUpReminder['priority'] =
          strength > STRENGTH_THRESHOLDS.strong ? 'high' :
          strength > STRENGTH_THRESHOLDS.moderate ? 'medium' : 'low';

        reminders.push({
          contactId: otherId,
          contactName: contact.name,
          lastContactDate: edge.lastInteraction,
          daysSinceContact: Math.round(daysSinceContact),
          relationshipStrength: Math.round(strength * 100) / 100,
          suggestedAction: this.suggestFollowUpAction(edge, daysSinceContact),
          priority,
        });
      }
    }

    // Sort by priority (high first), then by days since contact (longest first)
    const priorityOrder: Record<FollowUpReminder['priority'], number> = { high: 0, medium: 1, low: 2 };
    reminders.sort((a, b) =>
      priorityOrder[a.priority] - priorityOrder[b.priority] ||
      b.daysSinceContact - a.daysSinceContact,
    );

    return reminders;
  }

  // -----------------------------------------------------------------------
  // Public API — Relationship Health
  // -----------------------------------------------------------------------

  /**
   * Assess the health of a relationship between two contacts.
   */
  assessRelationshipHealth(sourceId: string, targetId: string): Result<RelationshipHealth> {
    const edge = this.edges.get(this.edgeKey(sourceId, targetId));
    if (!edge) {
      return {
        ok: false,
        error: {
          code: 'EDGE_NOT_FOUND',
          message: `No relationship found between ${sourceId} and ${targetId}`,
          retryable: false,
        },
      };
    }

    const strength = this.computeRelationshipStrength(sourceId, targetId);
    const sentimentScore = edge.sentiment.current;
    const frequencyTrend = edge.frequency.trend;

    // Reciprocity: ratio of bidirectional communication
    const reciprocityScore = edge.bidirectional ? 0.8 : 0.3;

    // Determine overall health
    let overallHealth: RelationshipHealth['overallHealth'];
    const healthScore = strength * 0.4 + sentimentScore * 0.2 + reciprocityScore * 0.2 +
      (frequencyTrend === 'increasing' ? 0.2 : frequencyTrend === 'stable' ? 0.1 : 0);

    if (healthScore >= 0.7) overallHealth = 'thriving';
    else if (healthScore >= 0.5) overallHealth = 'stable';
    else if (healthScore >= 0.3) overallHealth = 'cooling';
    else if (strength > 0) overallHealth = 'at_risk';
    else overallHealth = 'dormant';

    const details = [
      `Strength: ${(strength * 100).toFixed(0)}%`,
      `Sentiment: ${sentimentScore > 0 ? 'positive' : sentimentScore < 0 ? 'negative' : 'neutral'}`,
      `Frequency trend: ${frequencyTrend}`,
      `Reciprocity: ${edge.bidirectional ? 'bidirectional' : 'one-way'}`,
      `Total emails: ${edge.totalEmails}`,
    ].join(', ');

    return {
      ok: true,
      value: {
        contactId: targetId,
        overallHealth,
        strengthScore: Math.round(strength * 100) / 100,
        sentimentScore,
        frequencyTrend,
        reciprocityScore,
        details,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Insights
  // -----------------------------------------------------------------------

  /**
   * Generate relationship insights for a user.
   */
  generateInsights(userId: string): readonly RelationshipInsight[] {
    const userContactId = this.contactIdFromAddress(userId);
    const edges = this.getEdgesForContact(userContactId);
    const insights: RelationshipInsight[] = [];
    const now = Date.now();

    for (const edge of edges) {
      const otherId = edge.sourceId === userContactId ? edge.targetId : edge.sourceId;
      const contact = this.contacts.get(otherId);
      if (!contact) continue;
      if (contact.totalInteractions < this.config.minInteractionsForInsights) continue;

      const strength = this.computeRelationshipStrength(userContactId, otherId);
      const daysSince = (now - edge.lastInteraction) / (1000 * 60 * 60 * 24);

      // Key contact
      if (strength > STRENGTH_THRESHOLDS.strong && edge.bidirectional) {
        insights.push({
          type: 'key_contact',
          contactId: otherId,
          description: `${contact.name ?? otherId} is one of your most important contacts (strength: ${(strength * 100).toFixed(0)}%)`,
          confidence: strength,
          actionable: false,
        });
      }

      // Fading relationship
      if (edge.frequency.trend === 'decreasing' && strength > STRENGTH_THRESHOLDS.weak) {
        insights.push({
          type: 'fading_relationship',
          contactId: otherId,
          description: `Communication with ${contact.name ?? otherId} is declining`,
          confidence: 0.7,
          actionable: true,
          suggestedAction: 'Consider reaching out to maintain the relationship',
        });
      }

      // New connection
      if (contact.totalInteractions <= 5 && daysSince < 7) {
        insights.push({
          type: 'new_connection',
          contactId: otherId,
          description: `${contact.name ?? otherId} is a recent new contact`,
          confidence: 0.8,
          actionable: false,
        });
      }

      // Sentiment shift
      if (edge.sentiment.trend === 'declining' && edge.sentiment.average > 0) {
        insights.push({
          type: 'sentiment_shift',
          contactId: otherId,
          description: `Sentiment in conversations with ${contact.name ?? otherId} has been declining`,
          confidence: 0.6,
          actionable: true,
          suggestedAction: 'Review recent exchanges — tone may be shifting negatively',
        });
      }

      // Follow-up needed
      if (daysSince > this.config.followUpThresholdDays && edge.bidirectional && strength > STRENGTH_THRESHOLDS.moderate) {
        insights.push({
          type: 'follow_up_needed',
          contactId: otherId,
          description: `No communication with ${contact.name ?? otherId} in ${Math.round(daysSince)} days`,
          confidence: 0.75,
          actionable: true,
          suggestedAction: `Follow up with ${contact.name ?? otherId}`,
        });
      }
    }

    return insights;
  }

  // -----------------------------------------------------------------------
  // Private — Graph Manipulation
  // -----------------------------------------------------------------------

  private ensureContact(
    contactId: string,
    emailAddresses: readonly string[],
    name: string | undefined,
    organization: string | undefined,
  ): void {
    const existing = this.contacts.get(contactId);
    const now = Date.now();

    if (existing) {
      // Merge email addresses and update last contact time
      const mergedAddresses = new Set([...existing.emailAddresses, ...emailAddresses]);
      this.contacts.set(contactId, {
        ...existing,
        emailAddresses: [...mergedAddresses],
        name: name ?? existing.name,
        organization: organization ?? existing.organization,
        lastContact: now,
        totalInteractions: existing.totalInteractions + 1,
      });
    } else {
      this.contacts.set(contactId, {
        id: contactId,
        emailAddresses: [...emailAddresses],
        name,
        organization,
        firstContact: now,
        lastContact: now,
        totalInteractions: 1,
      });
    }
  }

  private updateEdge(sourceId: string, targetId: string, timestamp: number): void {
    const key = this.edgeKey(sourceId, targetId);
    const reverseKey = this.edgeKey(targetId, sourceId);
    const existing = this.edges.get(key);
    const reverseExists = this.edges.has(reverseKey);

    if (existing) {
      const newTotalEmails = existing.totalEmails + 1;
      const updatedFrequency = this.updateFrequency(existing.frequency, timestamp);
      const updatedSentiment = existing.sentiment; // Sentiment updated separately

      this.edges.set(key, {
        ...existing,
        strength: Math.min(1, existing.strength + 0.02),
        frequency: updatedFrequency,
        sentiment: updatedSentiment,
        lastInteraction: timestamp,
        totalEmails: newTotalEmails,
        bidirectional: existing.bidirectional || reverseExists,
        averageResponseTimeMs: existing.averageResponseTimeMs,
      });
    } else {
      this.edges.set(key, {
        sourceId,
        targetId,
        strength: 0.1,
        frequency: {
          daily: 0,
          weekly: 1,
          monthly: 1,
          trend: 'stable',
        },
        sentiment: {
          current: 0,
          average: 0,
          trend: 'stable',
          recentScores: [],
        },
        lastInteraction: timestamp,
        totalEmails: 1,
        bidirectional: reverseExists,
        averageResponseTimeMs: 0,
      });

      // Mark reverse edge as bidirectional if it exists
      if (reverseExists) {
        const reverseEdge = this.edges.get(reverseKey);
        if (reverseEdge) {
          this.edges.set(reverseKey, { ...reverseEdge, bidirectional: true });
        }
      }
    }
  }

  /**
   * Update sentiment for a relationship edge.
   * Called externally after sentiment analysis of an email.
   */
  updateSentiment(sourceId: string, targetId: string, sentimentScore: number): void {
    const key = this.edgeKey(sourceId, targetId);
    const edge = this.edges.get(key);
    if (!edge) return;

    const recentScores = [...edge.sentiment.recentScores, sentimentScore]
      .slice(-SENTIMENT_HISTORY_SIZE);

    const average = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;

    // Trend: compare recent half to older half
    let trend: SentimentTrend['trend'] = 'stable';
    if (recentScores.length >= 4) {
      const midpoint = Math.floor(recentScores.length / 2);
      const olderAvg = recentScores.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
      const newerAvg = recentScores.slice(midpoint).reduce((a, b) => a + b, 0) / (recentScores.length - midpoint);

      if (newerAvg - olderAvg > 0.1) trend = 'improving';
      else if (olderAvg - newerAvg > 0.1) trend = 'declining';
    }

    this.edges.set(key, {
      ...edge,
      sentiment: {
        current: sentimentScore,
        average: Math.round(average * 100) / 100,
        trend,
        recentScores,
      },
    });
  }

  // -----------------------------------------------------------------------
  // Private — Helpers
  // -----------------------------------------------------------------------

  private edgeKey(sourceId: string, targetId: string): string {
    return `${sourceId}::${targetId}`;
  }

  private contactIdFromAddress(address: string): string {
    return address.toLowerCase().trim();
  }

  private updateFrequency(
    current: CommunicationFrequency,
    _timestamp: number,
  ): CommunicationFrequency {
    // Simplified rolling update — in production this would use proper windowing
    const newWeekly = current.weekly * 0.9 + 1 * 0.1;
    const newDaily = current.daily * 0.9 + (newWeekly / 7) * 0.1;
    const newMonthly = current.monthly * 0.9 + (newWeekly * 4) * 0.1;

    let trend: CommunicationFrequency['trend'] = 'stable';
    if (newWeekly > current.weekly * 1.2) trend = 'increasing';
    else if (newWeekly < current.weekly * 0.8) trend = 'decreasing';

    return {
      daily: Math.round(newDaily * 100) / 100,
      weekly: Math.round(newWeekly * 100) / 100,
      monthly: Math.round(newMonthly * 100) / 100,
      trend,
    };
  }

  private suggestFollowUpAction(edge: RelationshipEdge, daysSince: number): string {
    if (daysSince > 60) {
      return 'Send a reconnection message — it has been a while';
    }
    if (edge.sentiment.current < -0.3) {
      return 'Consider a positive check-in to improve the relationship tone';
    }
    if (edge.averageResponseTimeMs > 0 && edge.averageResponseTimeMs < 3600000) {
      return 'This contact usually responds quickly — a brief message should suffice';
    }
    return 'Send a follow-up to stay in touch';
  }
}
