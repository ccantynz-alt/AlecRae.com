/**
 * @emailed/support - Satisfaction Tracking
 *
 * Post-resolution customer satisfaction measurement.
 * Sends CSAT surveys, processes responses, computes metrics,
 * and auto-escalates when scores are low.
 */

import type {
  Ticket,
  Result,
} from "../types";
import { ok, err } from "../types";
import type { SupportReplyComposer, ComposedEmail } from "./reply-composer";
import type { EmailQueueService } from "./email-intake";

// ─── Survey Types ──────────────────────────────────────────────────────────

export interface SurveyResponse {
  ticketId: string;
  rating: number; // 1-5
  feedback: string;
  respondedAt: Date;
  accountId: string;
  senderEmail: string;
}

export interface SatisfactionMetrics {
  /** Average CSAT score (1-5) */
  csatScore: number;
  /** Net Promoter Score (-100 to 100) */
  npsScore: number;
  /** Percentage of tickets that received a survey response */
  responseRate: number;
  /** Total surveys sent */
  totalSent: number;
  /** Total responses received */
  totalResponses: number;
  /** Distribution of ratings */
  ratingDistribution: Record<number, number>;
  /** Average resolution time for surveyed tickets (minutes) */
  avgResolutionTimeMinutes: number;
  /** Period covered */
  dateRange: { start: Date; end: Date };
}

export interface LowScoreAlert {
  ticketId: string;
  rating: number;
  feedback: string;
  accountId: string;
  senderEmail: string;
  alertedAt: Date;
}

export interface FeedbackInsight {
  theme: string;
  frequency: number;
  sentiment: "positive" | "negative" | "neutral";
  exampleFeedback: string[];
  suggestedAction: string;
}

// ─── Store Interfaces ──────────────────────────────────────────────────────

export interface SurveyStore {
  saveSent(ticketId: string, sentAt: Date): Promise<void>;
  getSent(ticketId: string): Promise<Date | null>;
  saveResponse(response: SurveyResponse): Promise<void>;
  getResponse(ticketId: string): Promise<SurveyResponse | null>;
  listResponses(filter: {
    after?: Date;
    before?: Date;
    minRating?: number;
    maxRating?: number;
    limit?: number;
  }): Promise<SurveyResponse[]>;
  countSent(after?: Date, before?: Date): Promise<number>;
}

export interface AlertService {
  sendLowScoreAlert(alert: LowScoreAlert): Promise<void>;
}

export interface TicketLookupService {
  getTicket(ticketId: string): Promise<Ticket | null>;
  getTicketSender(ticketId: string): Promise<{ email: string; name?: string } | null>;
}

// ─── Satisfaction Tracker ──────────────────────────────────────────────────

export class SatisfactionTracker {
  private readonly store: SurveyStore;
  private readonly replyComposer: SupportReplyComposer;
  private readonly emailQueue: EmailQueueService;
  private readonly alertService: AlertService;
  private readonly ticketLookup: TicketLookupService;
  private readonly lowScoreThreshold: number;
  private readonly surveyDelayMs: number;

  constructor(deps: {
    store: SurveyStore;
    replyComposer: SupportReplyComposer;
    emailQueue: EmailQueueService;
    alertService: AlertService;
    ticketLookup: TicketLookupService;
    /** Rating at or below which triggers an alert (default: 2) */
    lowScoreThreshold?: number;
    /** Delay before sending survey after resolution (default: 1 hour) */
    surveyDelayMs?: number;
  }) {
    this.store = deps.store;
    this.replyComposer = deps.replyComposer;
    this.emailQueue = deps.emailQueue;
    this.alertService = deps.alertService;
    this.ticketLookup = deps.ticketLookup;
    this.lowScoreThreshold = deps.lowScoreThreshold ?? 2;
    this.surveyDelayMs = deps.surveyDelayMs ?? 3_600_000;
  }

  /**
   * Send a CSAT survey email after a ticket is resolved.
   * Checks that a survey hasn't already been sent for this ticket.
   */
  async sendSurvey(ticket: Ticket): Promise<Result<ComposedEmail | null>> {
    try {
      // Don't send if ticket isn't resolved
      if (ticket.status !== "resolved" && ticket.status !== "closed") {
        return ok(null);
      }

      // Don't send duplicate surveys
      const alreadySent = await this.store.getSent(ticket.id);
      if (alreadySent) {
        return ok(null);
      }

      // Check if enough time has passed since resolution
      if (ticket.resolvedAt) {
        const elapsed = Date.now() - ticket.resolvedAt.getTime();
        if (elapsed < this.surveyDelayMs) {
          return ok(null);
        }
      }

      // Look up the ticket sender's contact info
      const sender = await this.ticketLookup.getTicketSender(ticket.id);
      if (!sender) {
        return err(new Error(`Cannot find sender for ticket ${ticket.id}`));
      }

      // Compose the survey email
      const composeResult = this.replyComposer.composeSurveyEmail(
        ticket,
        sender.email,
        sender.name,
      );

      if (!composeResult.ok) {
        return err(composeResult.error);
      }

      const surveyEmail = composeResult.value;

      // Queue the email for sending
      const queueResult = await this.emailQueue.enqueueOutbound(surveyEmail);
      if (!queueResult.ok) {
        return err(queueResult.error);
      }

      // Record that we sent the survey
      await this.store.saveSent(ticket.id, new Date());

      return ok(surveyEmail);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Process an incoming survey response.
   * Records the rating and feedback, and triggers alerts for low scores.
   */
  async processSurveyResponse(
    ticketId: string,
    rating: number,
    feedback: string,
  ): Promise<Result<void>> {
    try {
      // Validate rating
      if (rating < 1 || rating > 5 || !Number.isInteger(rating)) {
        return err(new Error(`Invalid rating: ${rating}. Must be an integer between 1 and 5.`));
      }

      // Look up ticket for context
      const ticket = await this.ticketLookup.getTicket(ticketId);
      if (!ticket) {
        return err(new Error(`Ticket not found: ${ticketId}`));
      }

      const sender = await this.ticketLookup.getTicketSender(ticketId);

      const response: SurveyResponse = {
        ticketId,
        rating,
        feedback: feedback.trim(),
        respondedAt: new Date(),
        accountId: ticket.accountId,
        senderEmail: sender?.email ?? "unknown",
      };

      // Save the response
      await this.store.saveResponse(response);

      // Check for low score and trigger alert
      if (rating <= this.lowScoreThreshold) {
        await this.flagLowScore(response);
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get satisfaction metrics for a given date range.
   */
  async getMetrics(dateRange: {
    start: Date;
    end: Date;
  }): Promise<Result<SatisfactionMetrics>> {
    try {
      const responses = await this.store.listResponses({
        after: dateRange.start,
        before: dateRange.end,
      });

      const totalSent = await this.store.countSent(dateRange.start, dateRange.end);

      if (responses.length === 0) {
        return ok({
          csatScore: 0,
          npsScore: 0,
          responseRate: 0,
          totalSent,
          totalResponses: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          avgResolutionTimeMinutes: 0,
          dateRange,
        });
      }

      // Compute CSAT score (average of all ratings)
      const totalRating = responses.reduce((sum, r) => sum + r.rating, 0);
      const csatScore = totalRating / responses.length;

      // Compute NPS: promoters (4-5) - detractors (1-2) as percentage
      const promoters = responses.filter((r) => r.rating >= 4).length;
      const detractors = responses.filter((r) => r.rating <= 2).length;
      const npsScore = Math.round(
        ((promoters - detractors) / responses.length) * 100,
      );

      // Rating distribution
      const ratingDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      for (const response of responses) {
        ratingDistribution[response.rating] = (ratingDistribution[response.rating] ?? 0) + 1;
      }

      // Response rate
      const responseRate = totalSent > 0 ? responses.length / totalSent : 0;

      // Average resolution time (requires looking up tickets)
      let totalResolutionMinutes = 0;
      let resolutionCount = 0;

      for (const response of responses) {
        const ticket = await this.ticketLookup.getTicket(response.ticketId);
        if (ticket?.resolvedAt && ticket.createdAt) {
          const minutes = (ticket.resolvedAt.getTime() - ticket.createdAt.getTime()) / 60_000;
          totalResolutionMinutes += minutes;
          resolutionCount++;
        }
      }

      const avgResolutionTimeMinutes = resolutionCount > 0
        ? totalResolutionMinutes / resolutionCount
        : 0;

      return ok({
        csatScore: Math.round(csatScore * 100) / 100,
        npsScore,
        responseRate: Math.round(responseRate * 1000) / 1000,
        totalSent,
        totalResponses: responses.length,
        ratingDistribution,
        avgResolutionTimeMinutes: Math.round(avgResolutionTimeMinutes),
        dateRange,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Flag low-scoring responses for immediate attention.
   * Sends alerts and records the escalation.
   */
  async flagLowScores(threshold?: number): Promise<Result<LowScoreAlert[]>> {
    try {
      const effectiveThreshold = threshold ?? this.lowScoreThreshold;

      // Get recent low-scoring responses (last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const responses = await this.store.listResponses({
        after: sevenDaysAgo,
        maxRating: effectiveThreshold,
      });

      const alerts: LowScoreAlert[] = [];

      for (const response of responses) {
        const alert: LowScoreAlert = {
          ticketId: response.ticketId,
          rating: response.rating,
          feedback: response.feedback,
          accountId: response.accountId,
          senderEmail: response.senderEmail,
          alertedAt: new Date(),
        };

        await this.alertService.sendLowScoreAlert(alert);
        alerts.push(alert);
      }

      return ok(alerts);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze free-text feedback to extract improvement signals.
   * Groups feedback by theme and identifies actionable patterns.
   */
  async analyzeFeedback(dateRange: {
    start: Date;
    end: Date;
  }): Promise<Result<FeedbackInsight[]>> {
    try {
      const responses = await this.store.listResponses({
        after: dateRange.start,
        before: dateRange.end,
      });

      // Filter to responses with actual feedback text
      const withFeedback = responses.filter((r) => r.feedback.length > 10);
      if (withFeedback.length === 0) {
        return ok([]);
      }

      // Keyword-based theme extraction
      const themes = this.extractThemes(withFeedback);
      return ok(themes);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  private async flagLowScore(response: SurveyResponse): Promise<void> {
    const alert: LowScoreAlert = {
      ticketId: response.ticketId,
      rating: response.rating,
      feedback: response.feedback,
      accountId: response.accountId,
      senderEmail: response.senderEmail,
      alertedAt: new Date(),
    };

    await this.alertService.sendLowScoreAlert(alert);
  }

  /**
   * Extract themes from feedback text using keyword matching.
   * Groups related feedback and determines sentiment.
   */
  private extractThemes(responses: SurveyResponse[]): FeedbackInsight[] {
    const themeDefinitions: Array<{
      theme: string;
      keywords: string[];
      suggestedAction: string;
    }> = [
      {
        theme: "Slow Response Time",
        keywords: ["slow", "waited", "waiting", "took too long", "hours", "delay", "delayed"],
        suggestedAction: "Review SLA targets and AI response speed. Consider adding more specialists for peak hours.",
      },
      {
        theme: "Unhelpful Response",
        keywords: ["not helpful", "unhelpful", "didn't help", "didn't solve", "still broken", "same issue", "didn't work"],
        suggestedAction: "Analyze AI response accuracy. Improve knowledge base articles and agent training prompts.",
      },
      {
        theme: "Wanted Human Agent",
        keywords: ["human", "real person", "talk to someone", "bot", "automated", "not a real"],
        suggestedAction: "Lower auto-reply confidence threshold or add earlier escalation triggers.",
      },
      {
        theme: "Excellent Service",
        keywords: ["excellent", "amazing", "perfect", "great job", "fantastic", "wonderful", "impressed"],
        suggestedAction: "Document successful resolution patterns for knowledge base expansion.",
      },
      {
        theme: "Quick Resolution",
        keywords: ["quick", "fast", "immediate", "right away", "instantly", "speedy"],
        suggestedAction: "Maintain current performance. Use as benchmark for other categories.",
      },
      {
        theme: "Communication Clarity",
        keywords: ["confusing", "unclear", "didn't understand", "too technical", "jargon", "complicated"],
        suggestedAction: "Simplify AI response language. Add plain-English explanations for technical concepts.",
      },
      {
        theme: "Billing Dissatisfaction",
        keywords: ["charge", "expensive", "overcharged", "refund", "pricing", "cost"],
        suggestedAction: "Review billing-related ticket handling. Ensure pricing transparency.",
      },
      {
        theme: "Feature Gap",
        keywords: ["missing", "need", "wish", "feature", "would be nice", "can't do", "doesn't support"],
        suggestedAction: "Compile feature requests from feedback and share with product team.",
      },
    ];

    const insights: FeedbackInsight[] = [];

    for (const def of themeDefinitions) {
      const matchingResponses = responses.filter((r) => {
        const lower = r.feedback.toLowerCase();
        return def.keywords.some((k) => lower.includes(k));
      });

      if (matchingResponses.length === 0) continue;

      // Determine sentiment from ratings
      const avgRating = matchingResponses.reduce((sum, r) => sum + r.rating, 0) / matchingResponses.length;
      const sentiment: "positive" | "negative" | "neutral" =
        avgRating >= 4 ? "positive" : avgRating <= 2 ? "negative" : "neutral";

      insights.push({
        theme: def.theme,
        frequency: matchingResponses.length,
        sentiment,
        exampleFeedback: matchingResponses
          .slice(0, 3)
          .map((r) => r.feedback.slice(0, 200)),
        suggestedAction: def.suggestedAction,
      });
    }

    // Sort by frequency (most common themes first)
    insights.sort((a, b) => b.frequency - a.frequency);

    return insights;
  }
}
