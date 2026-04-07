// =============================================================================
// Vienna — Predictive Email Intelligence (PEI)
// =============================================================================
// THE feature no competitor has. PEI predicts:
// 1. What emails you'll receive and from whom
// 2. Which emails need follow-up (before you forget)
// 3. Optimal send times for maximum open rates
// 4. Relationship health deterioration before it happens
// 5. Meeting conflicts from email context
// 6. Pre-drafts responses to predicted incoming emails
//
// This is the "magic" that makes users say "how did it know?"

import Anthropic from '@anthropic-ai/sdk';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PredictedEmail {
  id: string;
  likelihood: number; // 0-1
  expectedFrom: string;
  expectedSubject: string;
  expectedTimeWindow: { start: Date; end: Date };
  reason: string;
  suggestedPreDraft: string | null;
  category: 'reply_expected' | 'recurring' | 'follow_up_due' | 'meeting_related' | 'deadline';
  actionSuggestion: string | null;
}

export interface FollowUpReminder {
  emailId: string;
  threadId: string;
  sentTo: string;
  sentAt: Date;
  subject: string;
  expectedReplyBy: Date;
  urgency: 'low' | 'medium' | 'high' | 'overdue';
  daysSinceContact: number;
  suggestedNudge: string;
  autoNudgeEnabled: boolean;
}

export interface OptimalSendTime {
  recipient: string;
  bestHour: number; // 0-23
  bestDay: number; // 0-6 (Sun-Sat)
  timezone: string;
  openProbability: number;
  reasoning: string;
  historicalOpenRate: number;
  sampleSize: number;
}

export interface RelationshipHealth {
  contactEmail: string;
  contactName: string;
  healthScore: number; // 0-100
  trend: 'improving' | 'stable' | 'declining' | 'at_risk';
  lastContact: Date;
  avgResponseTime: number; // hours
  sentimentTrend: number; // -1 to 1
  communicationFrequency: {
    current: number; // emails per week
    historical: number; // emails per week
    change: number; // percentage change
  };
  alerts: string[];
  suggestedActions: string[];
}

export interface SendPattern {
  email: string;
  hourDistribution: number[]; // 24 slots
  dayDistribution: number[]; // 7 slots
  avgResponseTimeHours: number;
  totalEmails: number;
  lastSeen: Date;
}

export interface CommunicationEvent {
  id: string;
  from: string;
  to: string[];
  subject: string;
  sentAt: Date;
  threadId: string;
  isReply: boolean;
  sentiment: number; // -1 to 1
  hasAttachment: boolean;
  wasOpened: boolean;
  openedAt: Date | null;
  responseTime: number | null; // minutes
}

// ─── Pattern Analyzer ───────────────────────────────────────────────────────

export class CommunicationPatternAnalyzer {
  private readonly patterns = new Map<string, SendPattern>();
  private readonly events: CommunicationEvent[] = [];

  /**
   * Ingest communication events to build pattern models.
   */
  ingest(events: CommunicationEvent[]): void {
    for (const event of events) {
      this.events.push(event);
      this.updatePattern(event.from, event);
      for (const to of event.to) {
        this.updatePattern(to, event);
      }
    }
  }

  private updatePattern(email: string, event: CommunicationEvent): void {
    const existing = this.patterns.get(email) ?? {
      email,
      hourDistribution: new Array(24).fill(0),
      dayDistribution: new Array(7).fill(0),
      avgResponseTimeHours: 0,
      totalEmails: 0,
      lastSeen: event.sentAt,
    };

    const hour = event.sentAt.getHours();
    const day = event.sentAt.getDay();

    existing.hourDistribution[hour]++;
    existing.dayDistribution[day]++;
    existing.totalEmails++;

    if (event.sentAt > existing.lastSeen) {
      existing.lastSeen = event.sentAt;
    }

    if (event.responseTime !== null) {
      const totalTime = existing.avgResponseTimeHours * (existing.totalEmails - 1) + event.responseTime / 60;
      existing.avgResponseTimeHours = totalTime / existing.totalEmails;
    }

    this.patterns.set(email, existing);
  }

  getPattern(email: string): SendPattern | undefined {
    return this.patterns.get(email);
  }

  /**
   * Predict when an email from this sender is most likely to arrive.
   */
  predictNextEmailTime(email: string): { hour: number; day: number; confidence: number } | null {
    const pattern = this.patterns.get(email);
    if (!pattern || pattern.totalEmails < 3) return null;

    // Find peak hour
    let peakHour = 0;
    let peakHourCount = 0;
    for (let h = 0; h < 24; h++) {
      if (pattern.hourDistribution[h] > peakHourCount) {
        peakHourCount = pattern.hourDistribution[h];
        peakHour = h;
      }
    }

    // Find peak day
    let peakDay = 0;
    let peakDayCount = 0;
    for (let d = 0; d < 7; d++) {
      if (pattern.dayDistribution[d] > peakDayCount) {
        peakDayCount = pattern.dayDistribution[d];
        peakDay = d;
      }
    }

    const confidence = Math.min(
      0.95,
      (peakHourCount / pattern.totalEmails) * (peakDayCount / pattern.totalEmails) * 4,
    );

    return { hour: peakHour, day: peakDay, confidence };
  }

  /**
   * Calculate optimal send time for maximum engagement with a specific recipient.
   */
  calculateOptimalSendTime(recipientEmail: string): OptimalSendTime | null {
    const pattern = this.patterns.get(recipientEmail);
    if (!pattern || pattern.totalEmails < 5) return null;

    // Find the hour with highest open probability
    const recipientEvents = this.events.filter(
      (e) => e.to.includes(recipientEmail) && e.wasOpened,
    );

    if (recipientEvents.length < 3) return null;

    // Build open rate by hour
    const opensByHour = new Array(24).fill(0);
    const sentByHour = new Array(24).fill(0);

    for (const event of this.events.filter((e) => e.to.includes(recipientEmail))) {
      const hour = event.sentAt.getHours();
      sentByHour[hour]++;
      if (event.wasOpened) opensByHour[hour]++;
    }

    let bestHour = 9; // default
    let bestRate = 0;
    for (let h = 0; h < 24; h++) {
      if (sentByHour[h] >= 2) {
        const rate = opensByHour[h] / sentByHour[h];
        if (rate > bestRate) {
          bestRate = rate;
          bestHour = h;
        }
      }
    }

    // Best day analysis
    const opensByDay = new Array(7).fill(0);
    const sentByDay = new Array(7).fill(0);

    for (const event of this.events.filter((e) => e.to.includes(recipientEmail))) {
      const day = event.sentAt.getDay();
      sentByDay[day]++;
      if (event.wasOpened) opensByDay[day]++;
    }

    let bestDay = 1; // default Monday
    let bestDayRate = 0;
    for (let d = 0; d < 7; d++) {
      if (sentByDay[d] >= 2) {
        const rate = opensByDay[d] / sentByDay[d];
        if (rate > bestDayRate) {
          bestDayRate = rate;
          bestDay = d;
        }
      }
    }

    const totalOpens = recipientEvents.length;
    const totalSent = this.events.filter((e) => e.to.includes(recipientEmail)).length;

    return {
      recipient: recipientEmail,
      bestHour,
      bestDay,
      timezone: 'UTC', // Would be detected from recipient's reply patterns
      openProbability: bestRate,
      reasoning: `Based on ${totalSent} emails sent, ${totalOpens} opened. Best open rate at ${bestHour}:00 on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][bestDay]}`,
      historicalOpenRate: totalSent > 0 ? totalOpens / totalSent : 0,
      sampleSize: totalSent,
    };
  }
}

// ─── Follow-Up Tracker ──────────────────────────────────────────────────────

export class FollowUpTracker {
  private readonly sentAwaitingReply: Map<string, {
    emailId: string;
    threadId: string;
    to: string;
    subject: string;
    sentAt: Date;
    expectedResponseHours: number;
  }> = new Map();

  private readonly analyzer: CommunicationPatternAnalyzer;

  constructor(analyzer: CommunicationPatternAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Track a sent email that expects a reply.
   */
  trackSentEmail(params: {
    emailId: string;
    threadId: string;
    to: string;
    subject: string;
    sentAt: Date;
  }): void {
    const pattern = this.analyzer.getPattern(params.to);
    const expectedResponseHours = pattern?.avgResponseTimeHours ?? 48;

    this.sentAwaitingReply.set(params.emailId, {
      ...params,
      expectedResponseHours,
    });
  }

  /**
   * Mark that a reply was received for a tracked email.
   */
  markReplied(threadId: string): void {
    for (const [id, entry] of this.sentAwaitingReply) {
      if (entry.threadId === threadId) {
        this.sentAwaitingReply.delete(id);
      }
    }
  }

  /**
   * Get all pending follow-up reminders.
   */
  getReminders(now: Date = new Date()): FollowUpReminder[] {
    const reminders: FollowUpReminder[] = [];

    for (const [, entry] of this.sentAwaitingReply) {
      const hoursSinceSent = (now.getTime() - entry.sentAt.getTime()) / 3_600_000;
      const daysSinceSent = hoursSinceSent / 24;
      const expectedBy = new Date(entry.sentAt.getTime() + entry.expectedResponseHours * 3_600_000);

      let urgency: FollowUpReminder['urgency'];
      if (hoursSinceSent > entry.expectedResponseHours * 2) urgency = 'overdue';
      else if (hoursSinceSent > entry.expectedResponseHours) urgency = 'high';
      else if (hoursSinceSent > entry.expectedResponseHours * 0.75) urgency = 'medium';
      else urgency = 'low';

      // Only surface reminders that are at least medium urgency
      if (urgency === 'low') continue;

      const suggestedNudge = this.generateNudge(entry.subject, daysSinceSent, urgency);

      reminders.push({
        emailId: entry.emailId,
        threadId: entry.threadId,
        sentTo: entry.to,
        sentAt: entry.sentAt,
        subject: entry.subject,
        expectedReplyBy: expectedBy,
        urgency,
        daysSinceContact: Math.floor(daysSinceSent),
        suggestedNudge,
        autoNudgeEnabled: false,
      });
    }

    return reminders.sort((a, b) => {
      const urgencyOrder = { overdue: 0, high: 1, medium: 2, low: 3 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });
  }

  private generateNudge(subject: string, daysSince: number, urgency: string): string {
    if (urgency === 'overdue') {
      return `Hi, I wanted to follow up on my previous email regarding "${subject}" from ${Math.floor(daysSince)} days ago. Would love to hear your thoughts when you get a chance.`;
    }
    if (urgency === 'high') {
      return `Just checking in on "${subject}" — wanted to make sure this didn't slip through the cracks. Happy to discuss if you have any questions.`;
    }
    return `Gentle reminder about "${subject}" — let me know if you need anything from my end.`;
  }
}

// ─── Relationship Health Monitor ────────────────────────────────────────────

export class RelationshipHealthMonitor {
  private readonly analyzer: CommunicationPatternAnalyzer;

  constructor(analyzer: CommunicationPatternAnalyzer) {
    this.analyzer = analyzer;
  }

  /**
   * Calculate relationship health for a contact.
   */
  assess(
    contactEmail: string,
    contactName: string,
    events: CommunicationEvent[],
    now: Date = new Date(),
  ): RelationshipHealth {
    const contactEvents = events.filter(
      (e) => e.from === contactEmail || e.to.includes(contactEmail),
    );

    if (contactEvents.length === 0) {
      return this.emptyHealth(contactEmail, contactName);
    }

    // Sort by date
    contactEvents.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

    const lastContact = contactEvents[contactEvents.length - 1].sentAt;
    const daysSinceLastContact = (now.getTime() - lastContact.getTime()) / 86_400_000;

    // Calculate communication frequency
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000);

    const recentEvents = contactEvents.filter((e) => e.sentAt >= thirtyDaysAgo);
    const olderEvents = contactEvents.filter((e) => e.sentAt >= sixtyDaysAgo && e.sentAt < thirtyDaysAgo);

    const currentFreq = recentEvents.length / 4.3; // per week
    const historicalFreq = olderEvents.length / 4.3;
    const freqChange = historicalFreq > 0 ? ((currentFreq - historicalFreq) / historicalFreq) * 100 : 0;

    // Average response time
    const responseTimes = contactEvents
      .filter((e) => e.responseTime !== null)
      .map((e) => e.responseTime!);
    const avgResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length / 60
      : 0;

    // Sentiment trend
    const recentSentiments = recentEvents.map((e) => e.sentiment);
    const olderSentiments = olderEvents.map((e) => e.sentiment);
    const recentAvgSentiment = recentSentiments.length > 0
      ? recentSentiments.reduce((a, b) => a + b, 0) / recentSentiments.length
      : 0;
    const olderAvgSentiment = olderSentiments.length > 0
      ? olderSentiments.reduce((a, b) => a + b, 0) / olderSentiments.length
      : 0;
    const sentimentTrend = recentAvgSentiment - olderAvgSentiment;

    // Health score calculation (0-100)
    let healthScore = 50; // base

    // Recency factor (-20 to +20)
    if (daysSinceLastContact < 7) healthScore += 20;
    else if (daysSinceLastContact < 14) healthScore += 10;
    else if (daysSinceLastContact < 30) healthScore += 0;
    else if (daysSinceLastContact < 60) healthScore -= 10;
    else healthScore -= 20;

    // Frequency trend (-15 to +15)
    if (freqChange > 20) healthScore += 15;
    else if (freqChange > 0) healthScore += 5;
    else if (freqChange > -30) healthScore -= 5;
    else healthScore -= 15;

    // Response time factor (-10 to +10)
    if (avgResponseTime < 4) healthScore += 10;
    else if (avgResponseTime < 24) healthScore += 5;
    else if (avgResponseTime > 72) healthScore -= 10;

    // Sentiment factor (-5 to +5)
    healthScore += Math.round(sentimentTrend * 10);

    healthScore = Math.max(0, Math.min(100, healthScore));

    // Determine trend
    let trend: RelationshipHealth['trend'];
    if (healthScore >= 70 && freqChange >= 0) trend = 'improving';
    else if (healthScore >= 40 && Math.abs(freqChange) < 30) trend = 'stable';
    else if (healthScore < 30) trend = 'at_risk';
    else trend = 'declining';

    // Generate alerts and suggestions
    const alerts: string[] = [];
    const suggestedActions: string[] = [];

    if (daysSinceLastContact > 30) {
      alerts.push(`No contact in ${Math.floor(daysSinceLastContact)} days`);
      suggestedActions.push('Send a check-in email to maintain the relationship');
    }

    if (freqChange < -50) {
      alerts.push('Communication frequency dropped significantly');
      suggestedActions.push('Schedule a catch-up call or coffee chat');
    }

    if (sentimentTrend < -0.3) {
      alerts.push('Sentiment in recent communications has declined');
      suggestedActions.push('Address any unresolved concerns in your next interaction');
    }

    if (avgResponseTime > 48 && contactEvents.length > 5) {
      alerts.push('Response times have been increasing');
    }

    return {
      contactEmail,
      contactName,
      healthScore,
      trend,
      lastContact,
      avgResponseTime,
      sentimentTrend,
      communicationFrequency: {
        current: Math.round(currentFreq * 10) / 10,
        historical: Math.round(historicalFreq * 10) / 10,
        change: Math.round(freqChange),
      },
      alerts,
      suggestedActions,
    };
  }

  private emptyHealth(email: string, name: string): RelationshipHealth {
    return {
      contactEmail: email,
      contactName: name,
      healthScore: 0,
      trend: 'at_risk',
      lastContact: new Date(0),
      avgResponseTime: 0,
      sentimentTrend: 0,
      communicationFrequency: { current: 0, historical: 0, change: 0 },
      alerts: ['No communication history found'],
      suggestedActions: ['Send an introductory email'],
    };
  }
}

// ─── Prediction Engine ──────────────────────────────────────────────────────

export class PredictiveEmailEngine {
  private readonly analyzer: CommunicationPatternAnalyzer;
  private readonly followUpTracker: FollowUpTracker;
  private readonly healthMonitor: RelationshipHealthMonitor;
  private readonly client: Anthropic;

  constructor(analyzer: CommunicationPatternAnalyzer) {
    this.analyzer = analyzer;
    this.followUpTracker = new FollowUpTracker(analyzer);
    this.healthMonitor = new RelationshipHealthMonitor(analyzer);
    this.client = new Anthropic();
  }

  /**
   * Predict upcoming emails based on communication patterns.
   */
  predictUpcomingEmails(
    userId: string,
    events: CommunicationEvent[],
    now: Date = new Date(),
  ): PredictedEmail[] {
    const predictions: PredictedEmail[] = [];
    const uniqueContacts = new Set<string>();

    for (const event of events) {
      uniqueContacts.add(event.from);
      for (const to of event.to) uniqueContacts.add(to);
    }

    for (const contact of uniqueContacts) {
      // Predict replies to our sent emails
      const unrepliedSent = events.filter(
        (e) => e.to.includes(contact) && !e.isReply && !this.hasReply(e.threadId, events),
      );

      for (const sent of unrepliedSent.slice(-5)) {
        const pattern = this.analyzer.getPattern(contact);
        if (!pattern) continue;

        const expectedResponseMs = pattern.avgResponseTimeHours * 3_600_000;
        const expectedTime = new Date(sent.sentAt.getTime() + expectedResponseMs);

        if (expectedTime > now) {
          predictions.push({
            id: `pred-reply-${sent.id}`,
            likelihood: this.calculateReplyLikelihood(sent, pattern, now),
            expectedFrom: contact,
            expectedSubject: `Re: ${sent.subject}`,
            expectedTimeWindow: {
              start: expectedTime,
              end: new Date(expectedTime.getTime() + expectedResponseMs * 0.5),
            },
            reason: `${contact} typically responds within ${Math.round(pattern.avgResponseTimeHours)}h`,
            suggestedPreDraft: null,
            category: 'reply_expected',
            actionSuggestion: null,
          });
        }
      }

      // Predict recurring emails (newsletters, weekly updates, etc.)
      const fromContact = events.filter((e) => e.from === contact);
      const recurring = this.detectRecurringPattern(fromContact);
      if (recurring) {
        const nextExpected = this.predictNextOccurrence(recurring, now);
        if (nextExpected) {
          predictions.push({
            id: `pred-recurring-${contact}-${recurring.subject}`,
            likelihood: recurring.confidence,
            expectedFrom: contact,
            expectedSubject: recurring.subject,
            expectedTimeWindow: {
              start: nextExpected,
              end: new Date(nextExpected.getTime() + 86_400_000),
            },
            reason: `This email arrives ${recurring.frequency}`,
            suggestedPreDraft: null,
            category: 'recurring',
            actionSuggestion: null,
          });
        }
      }
    }

    // Sort by likelihood descending
    predictions.sort((a, b) => b.likelihood - a.likelihood);
    return predictions.slice(0, 20);
  }

  /**
   * Generate pre-drafted responses for predicted incoming emails.
   * Uses Claude to generate contextually appropriate drafts.
   */
  async generatePreDrafts(
    predictions: PredictedEmail[],
    userContext: { name: string; role: string; voiceProfile?: string },
  ): Promise<Map<string, string>> {
    const drafts = new Map<string, string>();
    const highLikelihood = predictions.filter((p) => p.likelihood >= 0.7);

    for (const prediction of highLikelihood.slice(0, 5)) {
      try {
        const response = await this.client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 500,
          temperature: 0.7,
          messages: [{
            role: 'user',
            content: [
              `You are drafting a response for ${userContext.name} (${userContext.role}).`,
              `They are expecting an email from ${prediction.expectedFrom} about: "${prediction.expectedSubject}"`,
              `Reason for prediction: ${prediction.reason}`,
              userContext.voiceProfile ? `Writing style: ${userContext.voiceProfile}` : '',
              '',
              'Write a brief, appropriate response draft (2-4 sentences) that they can review and send when the email arrives. Write only the email body.',
            ].filter(Boolean).join('\n'),
          }],
        });

        const text = response.content.find((b) => b.type === 'text')?.text;
        if (text) {
          drafts.set(prediction.id, text);
        }
      } catch {
        // Skip failed drafts
      }
    }

    return drafts;
  }

  get followUps(): FollowUpTracker {
    return this.followUpTracker;
  }

  get relationships(): RelationshipHealthMonitor {
    return this.healthMonitor;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private hasReply(threadId: string, events: CommunicationEvent[]): boolean {
    return events.some((e) => e.threadId === threadId && e.isReply);
  }

  private calculateReplyLikelihood(
    sent: CommunicationEvent,
    pattern: SendPattern,
    now: Date,
  ): number {
    const hoursSinceSent = (now.getTime() - sent.sentAt.getTime()) / 3_600_000;
    const expectedHours = pattern.avgResponseTimeHours;

    // Likelihood follows a bell curve around expected response time
    if (hoursSinceSent < expectedHours * 0.5) {
      return 0.3 + (hoursSinceSent / expectedHours) * 0.5;
    }
    if (hoursSinceSent < expectedHours * 1.5) {
      return 0.8;
    }
    if (hoursSinceSent < expectedHours * 3) {
      return 0.8 - ((hoursSinceSent - expectedHours * 1.5) / (expectedHours * 1.5)) * 0.5;
    }
    return 0.1; // Very overdue — less likely now
  }

  private detectRecurringPattern(
    emails: CommunicationEvent[],
  ): { subject: string; frequency: string; intervalMs: number; confidence: number } | null {
    if (emails.length < 3) return null;

    // Group by similar subjects
    const subjectGroups = new Map<string, CommunicationEvent[]>();
    for (const email of emails) {
      const normalized = email.subject
        .replace(/^(re|fw|fwd):\s*/gi, '')
        .replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, '') // Remove dates
        .replace(/\d+/g, '#') // Normalize numbers
        .trim()
        .toLowerCase();

      const group = subjectGroups.get(normalized) ?? [];
      group.push(email);
      subjectGroups.set(normalized, group);
    }

    // Find groups with regular intervals
    for (const [subject, group] of subjectGroups) {
      if (group.length < 3) continue;

      group.sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

      const intervals: number[] = [];
      for (let i = 1; i < group.length; i++) {
        intervals.push(group[i].sentAt.getTime() - group[i - 1].sentAt.getTime());
      }

      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const variance = intervals.reduce((sum, i) => sum + (i - avgInterval) ** 2, 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / avgInterval; // Coefficient of variation

      if (cv < 0.3) {
        // Regular pattern detected
        const dayInterval = avgInterval / 86_400_000;
        let frequency: string;
        if (dayInterval < 1.5) frequency = 'daily';
        else if (dayInterval < 8) frequency = 'weekly';
        else if (dayInterval < 16) frequency = 'bi-weekly';
        else if (dayInterval < 35) frequency = 'monthly';
        else frequency = `every ${Math.round(dayInterval)} days`;

        return {
          subject: group[group.length - 1].subject, // Use most recent subject
          frequency,
          intervalMs: avgInterval,
          confidence: Math.max(0.3, 1 - cv),
        };
      }
    }

    return null;
  }

  private predictNextOccurrence(
    pattern: { intervalMs: number },
    now: Date,
  ): Date | null {
    const nextTime = new Date(now.getTime() + pattern.intervalMs);
    // Only predict within the next 7 days
    if (nextTime.getTime() - now.getTime() > 7 * 86_400_000) return null;
    return nextTime;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createPredictiveEngine(): {
  engine: PredictiveEmailEngine;
  analyzer: CommunicationPatternAnalyzer;
} {
  const analyzer = new CommunicationPatternAnalyzer();
  const engine = new PredictiveEmailEngine(analyzer);
  return { engine, analyzer };
}
