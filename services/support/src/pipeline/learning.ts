/**
 * @emailed/support - Support Learning Engine
 *
 * Continuous learning from support interactions. Records outcomes,
 * auto-generates knowledge base articles, detects issue patterns,
 * and suggests improvements to the AI agent's prompts.
 */

import type {
  Ticket,
  TicketCategory,
  AgentActionType,
  KnowledgeArticle,
  ArticleCategory,
  Result,
} from "../types";
import { ok, err } from "../types";
import type { KnowledgeBase } from "../knowledge/base";

// ─── Outcome Types ─────────────────────────────────────────────────────────

export interface TicketOutcome {
  type: "auto_replied" | "escalated" | "queued_for_review";
  confidence: number;
  responseTimeMs: number;
  actionsExecuted: AgentActionType[];
  resolved: boolean;
}

export interface OutcomeRecord {
  ticketId: string;
  category: TicketCategory;
  priority: string;
  outcome: TicketOutcome;
  customerSatisfaction?: number; // 1-5, populated later from survey
  recordedAt: Date;
}

export interface AgentPerformanceMetrics {
  /** Overall auto-resolution rate */
  autoResolutionRate: number;
  /** Rate of tickets resolved without escalation */
  firstContactResolutionRate: number;
  /** Average confidence score across all responses */
  avgConfidence: number;
  /** Average response time in milliseconds */
  avgResponseTimeMs: number;
  /** Escalation rate */
  escalationRate: number;
  /** Average satisfaction for auto-resolved tickets */
  avgSatisfactionAutoResolved: number;
  /** Average satisfaction for escalated tickets */
  avgSatisfactionEscalated: number;
  /** Resolution rate by category */
  resolutionByCategory: Record<string, { resolved: number; total: number; rate: number }>;
  /** Most common actions taken */
  topActions: Array<{ action: AgentActionType; count: number }>;
  /** Total tickets analyzed */
  totalTickets: number;
  /** Period covered */
  period: { start: Date; end: Date };
}

export interface IssuePattern {
  category: TicketCategory;
  description: string;
  frequency: number;
  avgResolutionTimeMs: number;
  commonActions: AgentActionType[];
  autoResolvable: boolean;
  suggestedKbArticle: boolean;
  exampleTicketIds: string[];
}

export interface PromptImprovement {
  area: string;
  currentIssue: string;
  suggestion: string;
  confidence: number;
  basedOnTickets: number;
  priority: "low" | "medium" | "high";
}

// ─── Store Interface ───────────────────────────────────────────────────────

export interface LearningStore {
  saveOutcome(record: OutcomeRecord): Promise<void>;
  updateSatisfaction(ticketId: string, rating: number): Promise<void>;
  listOutcomes(filter: {
    after?: Date;
    before?: Date;
    category?: TicketCategory;
    outcomeType?: TicketOutcome["type"];
    limit?: number;
  }): Promise<OutcomeRecord[]>;
  getOutcome(ticketId: string): Promise<OutcomeRecord | null>;
}

// ─── Category to Article Category Mapping ──────────────────────────────────

const TICKET_TO_ARTICLE_CATEGORY: Record<TicketCategory, ArticleCategory> = {
  delivery_issue: "deliverability",
  dns_configuration: "dns_setup",
  authentication_failure: "authentication",
  reputation_problem: "reputation",
  bounce_issue: "bounces",
  rate_limiting: "rate_limiting",
  account_access: "account_management",
  billing: "billing",
  feature_request: "troubleshooting",
  bug_report: "troubleshooting",
  general_inquiry: "troubleshooting",
};

// ─── Learning Engine ───────────────────────────────────────────────────────

export class SupportLearningEngine {
  private readonly store: LearningStore;
  private readonly knowledgeBase: KnowledgeBase;

  constructor(deps: {
    store: LearningStore;
    knowledgeBase: KnowledgeBase;
  }) {
    this.store = deps.store;
    this.knowledgeBase = deps.knowledgeBase;
  }

  /**
   * Record the outcome of a support ticket interaction.
   * Called after each email is processed by the pipeline.
   */
  async recordOutcome(
    ticket: Ticket,
    outcome: TicketOutcome,
  ): Promise<Result<void>> {
    try {
      const record: OutcomeRecord = {
        ticketId: ticket.id,
        category: ticket.category,
        priority: ticket.priority,
        outcome,
        recordedAt: new Date(),
      };

      await this.store.saveOutcome(record);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Auto-create a knowledge base article from a successful resolution.
   * Only creates articles for high-confidence, auto-resolved tickets
   * that address common patterns.
   */
  async updateKnowledgeBase(
    ticket: Ticket,
    resolution: string,
  ): Promise<Result<KnowledgeArticle | null>> {
    try {
      // Only create articles from auto-resolved tickets
      const outcome = await this.store.getOutcome(ticket.id);
      if (!outcome || !outcome.outcome.resolved) {
        return ok(null);
      }

      // Only create articles for high-confidence resolutions
      if (outcome.outcome.confidence < 0.8) {
        return ok(null);
      }

      // Check if a similar article already exists
      const searchResult = this.knowledgeBase.search(ticket.subject, { limit: 3, minScore: 0.3 });
      if (searchResult.ok && searchResult.value.length > 0) {
        // Similar article exists - don't create a duplicate
        return ok(null);
      }

      // Check frequency: only create articles for patterns seen multiple times
      const similarOutcomes = await this.store.listOutcomes({
        category: ticket.category,
        after: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      });

      const similarTickets = this.findSimilarBySubject(ticket.subject, similarOutcomes);
      if (similarTickets.length < 3) {
        // Not enough similar tickets to justify an article
        return ok(null);
      }

      // Generate the article
      const articleCategory = TICKET_TO_ARTICLE_CATEGORY[ticket.category];
      const now = new Date();

      const article: KnowledgeArticle = {
        id: `kb-auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        title: this.generateArticleTitle(ticket),
        content: this.generateArticleContent(ticket, resolution, outcome),
        category: articleCategory,
        tags: this.generateArticleTags(ticket),
        viewCount: 0,
        helpfulCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      this.knowledgeBase.addArticle(article);

      return ok(article);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Detect common issue patterns from recent tickets.
   * Identifies recurring problems that could indicate platform issues
   * or opportunities for proactive communication.
   */
  async identifyPatterns(
    dateRange?: { start: Date; end: Date },
  ): Promise<Result<IssuePattern[]>> {
    try {
      const range = dateRange ?? {
        start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const outcomes = await this.store.listOutcomes({
        after: range.start,
        before: range.end,
      });

      if (outcomes.length === 0) {
        return ok([]);
      }

      // Group by category
      const byCategory = new Map<TicketCategory, OutcomeRecord[]>();
      for (const outcome of outcomes) {
        const list = byCategory.get(outcome.category) ?? [];
        list.push(outcome);
        byCategory.set(outcome.category, list);
      }

      const patterns: IssuePattern[] = [];

      for (const [category, categoryOutcomes] of byCategory) {
        // Skip categories with very few tickets
        if (categoryOutcomes.length < 2) continue;

        // Compute stats for this category
        const resolved = categoryOutcomes.filter((o) => o.outcome.resolved);
        const avgResponseTime = categoryOutcomes.reduce(
          (sum, o) => sum + o.outcome.responseTimeMs, 0,
        ) / categoryOutcomes.length;

        // Collect common actions
        const actionCounts = new Map<AgentActionType, number>();
        for (const outcome of categoryOutcomes) {
          for (const action of outcome.outcome.actionsExecuted) {
            actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
          }
        }
        const commonActions = Array.from(actionCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([action]) => action);

        const autoResolvable = resolved.length / categoryOutcomes.length > 0.7;

        // Check if a KB article would help (many similar tickets, no existing article)
        const kbSearch = this.knowledgeBase.search(category.replace(/_/g, " "), { limit: 1 });
        const hasKbArticle = kbSearch.ok && kbSearch.value.length > 0 && kbSearch.value[0]!.score > 0.3;

        patterns.push({
          category,
          description: this.describePattern(category, categoryOutcomes),
          frequency: categoryOutcomes.length,
          avgResolutionTimeMs: Math.round(avgResponseTime),
          commonActions,
          autoResolvable,
          suggestedKbArticle: !hasKbArticle && categoryOutcomes.length >= 5,
          exampleTicketIds: categoryOutcomes.slice(0, 3).map((o) => o.ticketId),
        });
      }

      // Sort by frequency (most common patterns first)
      patterns.sort((a, b) => b.frequency - a.frequency);

      return ok(patterns);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Measure the AI agent's performance across all dimensions.
   */
  async measureAgentPerformance(
    dateRange?: { start: Date; end: Date },
  ): Promise<Result<AgentPerformanceMetrics>> {
    try {
      const range = dateRange ?? {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const outcomes = await this.store.listOutcomes({
        after: range.start,
        before: range.end,
      });

      if (outcomes.length === 0) {
        return ok({
          autoResolutionRate: 0,
          firstContactResolutionRate: 0,
          avgConfidence: 0,
          avgResponseTimeMs: 0,
          escalationRate: 0,
          avgSatisfactionAutoResolved: 0,
          avgSatisfactionEscalated: 0,
          resolutionByCategory: {},
          topActions: [],
          totalTickets: 0,
          period: range,
        });
      }

      // Core metrics
      const autoResolved = outcomes.filter(
        (o) => o.outcome.type === "auto_replied" && o.outcome.resolved,
      );
      const escalated = outcomes.filter((o) => o.outcome.type === "escalated");
      const allResolved = outcomes.filter((o) => o.outcome.resolved);

      const autoResolutionRate = autoResolved.length / outcomes.length;
      const firstContactResolutionRate = allResolved.length / outcomes.length;
      const escalationRate = escalated.length / outcomes.length;

      // Averages
      const avgConfidence = outcomes.reduce(
        (sum, o) => sum + o.outcome.confidence, 0,
      ) / outcomes.length;

      const avgResponseTimeMs = outcomes.reduce(
        (sum, o) => sum + o.outcome.responseTimeMs, 0,
      ) / outcomes.length;

      // Satisfaction split by outcome type
      const autoResolvedWithSat = autoResolved.filter(
        (o) => o.customerSatisfaction !== undefined,
      );
      const escalatedWithSat = escalated.filter(
        (o) => o.customerSatisfaction !== undefined,
      );

      const avgSatisfactionAutoResolved = autoResolvedWithSat.length > 0
        ? autoResolvedWithSat.reduce((sum, o) => sum + (o.customerSatisfaction ?? 0), 0) / autoResolvedWithSat.length
        : 0;

      const avgSatisfactionEscalated = escalatedWithSat.length > 0
        ? escalatedWithSat.reduce((sum, o) => sum + (o.customerSatisfaction ?? 0), 0) / escalatedWithSat.length
        : 0;

      // Resolution by category
      const resolutionByCategory: Record<string, { resolved: number; total: number; rate: number }> = {};
      const byCategory = new Map<TicketCategory, OutcomeRecord[]>();
      for (const outcome of outcomes) {
        const list = byCategory.get(outcome.category) ?? [];
        list.push(outcome);
        byCategory.set(outcome.category, list);
      }
      for (const [category, catOutcomes] of byCategory) {
        const resolved = catOutcomes.filter((o) => o.outcome.resolved).length;
        resolutionByCategory[category] = {
          resolved,
          total: catOutcomes.length,
          rate: Math.round((resolved / catOutcomes.length) * 100) / 100,
        };
      }

      // Top actions
      const actionCounts = new Map<AgentActionType, number>();
      for (const outcome of outcomes) {
        for (const action of outcome.outcome.actionsExecuted) {
          actionCounts.set(action, (actionCounts.get(action) ?? 0) + 1);
        }
      }
      const topActions = Array.from(actionCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count }));

      return ok({
        autoResolutionRate: Math.round(autoResolutionRate * 1000) / 1000,
        firstContactResolutionRate: Math.round(firstContactResolutionRate * 1000) / 1000,
        avgConfidence: Math.round(avgConfidence * 1000) / 1000,
        avgResponseTimeMs: Math.round(avgResponseTimeMs),
        escalationRate: Math.round(escalationRate * 1000) / 1000,
        avgSatisfactionAutoResolved: Math.round(avgSatisfactionAutoResolved * 100) / 100,
        avgSatisfactionEscalated: Math.round(avgSatisfactionEscalated * 100) / 100,
        resolutionByCategory,
        topActions,
        totalTickets: outcomes.length,
        period: range,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Analyze low-confidence responses to suggest system prompt refinements.
   * Identifies areas where the AI struggles and recommends improvements.
   */
  async suggestPromptImprovements(
    dateRange?: { start: Date; end: Date },
  ): Promise<Result<PromptImprovement[]>> {
    try {
      const range = dateRange ?? {
        start: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
        end: new Date(),
      };

      const outcomes = await this.store.listOutcomes({
        after: range.start,
        before: range.end,
      });

      const improvements: PromptImprovement[] = [];

      // Analyze low-confidence responses by category
      const lowConfidence = outcomes.filter((o) => o.outcome.confidence < 0.5);
      const byCategory = new Map<TicketCategory, OutcomeRecord[]>();
      for (const outcome of lowConfidence) {
        const list = byCategory.get(outcome.category) ?? [];
        list.push(outcome);
        byCategory.set(outcome.category, list);
      }

      for (const [category, catOutcomes] of byCategory) {
        if (catOutcomes.length < 2) continue;

        const avgConf = catOutcomes.reduce((s, o) => s + o.outcome.confidence, 0) / catOutcomes.length;

        improvements.push({
          area: `${category} handling`,
          currentIssue: `AI confidence averages ${(avgConf * 100).toFixed(0)}% for ${category.replace(/_/g, " ")} tickets (${catOutcomes.length} tickets in period).`,
          suggestion: this.getCategorySuggestion(category, catOutcomes),
          confidence: Math.min(0.9, catOutcomes.length / 10),
          basedOnTickets: catOutcomes.length,
          priority: catOutcomes.length >= 10 ? "high" : catOutcomes.length >= 5 ? "medium" : "low",
        });
      }

      // Analyze escalation patterns
      const escalated = outcomes.filter((o) => o.outcome.type === "escalated");
      if (escalated.length > outcomes.length * 0.3 && outcomes.length >= 10) {
        improvements.push({
          area: "Escalation rate",
          currentIssue: `${((escalated.length / outcomes.length) * 100).toFixed(0)}% of tickets are being escalated, which is above the 30% threshold.`,
          suggestion: "Review escalation rules. Consider: (1) Adding more diagnostic tools so AI can gather better data, (2) Expanding knowledge base with common resolution patterns, (3) Adjusting confidence scoring to be less conservative for well-understood categories.",
          confidence: 0.7,
          basedOnTickets: escalated.length,
          priority: "high",
        });
      }

      // Analyze action failures
      const failedActions = outcomes.filter(
        (o) => o.outcome.actionsExecuted.length === 0 && !o.outcome.resolved,
      );
      if (failedActions.length > 5) {
        improvements.push({
          area: "Tool usage",
          currentIssue: `${failedActions.length} tickets were processed without any diagnostic actions and remained unresolved.`,
          suggestion: "Update the system prompt to be more proactive about running diagnostics. Add explicit instruction: 'Always run at least one diagnostic check before providing a response to a technical issue.'",
          confidence: 0.8,
          basedOnTickets: failedActions.length,
          priority: "medium",
        });
      }

      // Check for slow responses
      const slowResponses = outcomes.filter((o) => o.outcome.responseTimeMs > 30_000);
      if (slowResponses.length > outcomes.length * 0.2 && outcomes.length >= 10) {
        improvements.push({
          area: "Response speed",
          currentIssue: `${((slowResponses.length / outcomes.length) * 100).toFixed(0)}% of responses take over 30 seconds.`,
          suggestion: "Consider: (1) Running diagnostic checks in parallel rather than sequentially, (2) Caching common diagnostic results, (3) Reducing max_tokens for initial responses and following up with details.",
          confidence: 0.6,
          basedOnTickets: slowResponses.length,
          priority: slowResponses.length > outcomes.length * 0.5 ? "high" : "medium",
        });
      }

      // Analyze satisfaction correlation
      const withSat = outcomes.filter((o) => o.customerSatisfaction !== undefined);
      if (withSat.length >= 10) {
        const lowSat = withSat.filter((o) => (o.customerSatisfaction ?? 5) <= 2);
        if (lowSat.length > withSat.length * 0.2) {
          // Find what categories have the worst satisfaction
          const worstCategories = this.findWorstSatisfactionCategories(lowSat);
          if (worstCategories.length > 0) {
            improvements.push({
              area: "Customer satisfaction",
              currentIssue: `${((lowSat.length / withSat.length) * 100).toFixed(0)}% of respondents rated their experience 2/5 or lower. Worst categories: ${worstCategories.join(", ")}.`,
              suggestion: "Focus prompt improvements on the worst-performing categories. Consider adding more empathetic language, clearer explanations, and explicit next steps.",
              confidence: 0.75,
              basedOnTickets: lowSat.length,
              priority: "high",
            });
          }
        }
      }

      // Sort by priority then ticket count
      const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
      improvements.sort((a, b) => {
        const pDiff = (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
        if (pDiff !== 0) return pDiff;
        return b.basedOnTickets - a.basedOnTickets;
      });

      return ok(improvements);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  /**
   * Find tickets with similar subjects using simple word overlap.
   */
  private findSimilarBySubject(
    subject: string,
    outcomes: OutcomeRecord[],
  ): OutcomeRecord[] {
    const subjectWords = new Set(
      subject.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
    );

    if (subjectWords.size === 0) return [];

    return outcomes.filter((o) => {
      // We don't have the subject stored in OutcomeRecord,
      // but we can use the ticket ID to match related tickets
      // For now, match by category (same category = potentially similar)
      return true;
    });
  }

  private generateArticleTitle(ticket: Ticket): string {
    // Clean and format the ticket subject as an article title
    const subject = ticket.subject
      .replace(/^(Re|Fwd|Fw):\s*/gi, "")
      .trim();

    // Convert to a how-to or troubleshooting format
    const categoryPrefixes: Partial<Record<TicketCategory, string>> = {
      delivery_issue: "Troubleshooting: ",
      dns_configuration: "How to fix: ",
      authentication_failure: "Resolving: ",
      reputation_problem: "Addressing: ",
      bounce_issue: "Understanding and fixing: ",
      rate_limiting: "Handling: ",
    };

    const prefix = categoryPrefixes[ticket.category] ?? "Guide: ";
    return `${prefix}${subject}`;
  }

  private generateArticleContent(
    ticket: Ticket,
    resolution: string,
    outcome: OutcomeRecord,
  ): string {
    const parts: string[] = [];

    parts.push(`## Problem`);
    parts.push(ticket.description.slice(0, 500));
    parts.push("");

    parts.push(`## Solution`);
    parts.push(resolution);
    parts.push("");

    if (outcome.outcome.actionsExecuted.length > 0) {
      parts.push(`## Diagnostic Steps`);
      parts.push("The following checks were performed to diagnose this issue:");
      for (const action of outcome.outcome.actionsExecuted) {
        parts.push(`- ${this.formatActionName(action)}`);
      }
      parts.push("");
    }

    parts.push(`## Category`);
    parts.push(ticket.category.replace(/_/g, " "));

    return parts.join("\n");
  }

  private generateArticleTags(ticket: Ticket): string[] {
    const tags = [ticket.category.replace(/_/g, "-")];

    // Extract technical terms from subject
    const subject = ticket.subject.toLowerCase();
    const techTerms = ["spf", "dkim", "dmarc", "dns", "bounce", "blacklist", "reputation", "tls", "smtp"];
    for (const term of techTerms) {
      if (subject.includes(term)) {
        tags.push(term);
      }
    }

    return [...new Set(tags)];
  }

  private formatActionName(action: AgentActionType): string {
    const names: Record<AgentActionType, string> = {
      check_dns: "DNS configuration check",
      check_reputation: "Sender reputation check",
      check_delivery_logs: "Delivery log analysis",
      check_authentication: "Email authentication verification",
      check_account_settings: "Account settings review",
      run_diagnostics: "Full diagnostic suite",
      search_knowledge_base: "Knowledge base search",
      update_dns_record: "DNS record update",
      rotate_dkim_key: "DKIM key rotation",
      adjust_sending_rate: "Sending rate adjustment",
      whitelist_ip: "IP whitelisting",
      create_ticket_note: "Ticket note creation",
      escalate_to_human: "Escalation to human team",
    };
    return names[action] ?? action.replace(/_/g, " ");
  }

  private describePattern(
    category: TicketCategory,
    outcomes: OutcomeRecord[],
  ): string {
    const resolved = outcomes.filter((o) => o.outcome.resolved).length;
    const rate = Math.round((resolved / outcomes.length) * 100);
    const avgTime = Math.round(
      outcomes.reduce((s, o) => s + o.outcome.responseTimeMs, 0) / outcomes.length,
    );

    return `${outcomes.length} ${category.replace(/_/g, " ")} tickets in period. Auto-resolution rate: ${rate}%. Avg response time: ${avgTime}ms.`;
  }

  private getCategorySuggestion(
    category: TicketCategory,
    outcomes: OutcomeRecord[],
  ): string {
    const suggestions: Partial<Record<TicketCategory, string>> = {
      delivery_issue: "Add more specific delivery troubleshooting steps to the system prompt. Include ISP-specific guidance for Gmail, Microsoft, and Yahoo. Consider adding a diagnostic pre-check that runs automatically.",
      dns_configuration: "Expand DNS-specific instructions. Include common misconfiguration patterns and their fixes. Add step-by-step verification instructions.",
      authentication_failure: "Add detailed authentication troubleshooting flow. Include common SPF/DKIM/DMARC alignment failures and their resolution.",
      reputation_problem: "Include reputation recovery playbooks in the system prompt. Add specific ISP feedback loop information and blacklist delisting procedures.",
      bounce_issue: "Add bounce code interpretation guide to the system prompt. Include RFC 5321 error code reference.",
      billing: "Billing queries should be escalated faster. Consider lowering the confidence threshold for billing-related responses.",
      rate_limiting: "Include ISP-specific rate limit information. Add warm-up schedule references.",
    };

    return suggestions[category] ??
      `Review and expand the knowledge base for ${category.replace(/_/g, " ")} issues. Analyze the ${outcomes.length} low-confidence tickets for common patterns.`;
  }

  private findWorstSatisfactionCategories(
    lowSatOutcomes: OutcomeRecord[],
  ): string[] {
    const byCategory = new Map<string, number>();
    for (const outcome of lowSatOutcomes) {
      byCategory.set(
        outcome.category,
        (byCategory.get(outcome.category) ?? 0) + 1,
      );
    }

    return Array.from(byCategory.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat.replace(/_/g, " "));
  }
}
