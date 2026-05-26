/**
 * @alecrae/support - Smart Escalation Router
 *
 * Determines when AI can't resolve an issue and routes to
 * appropriate human team. Includes confidence scoring on AI responses.
 */

import type {
  Conversation,
  ConversationMessage,
  DiagnosticReport,
  EscalationContext,
  EscalationReason,
  EscalationRequest,
  EscalationResult,
  EscalationRule,
  EscalationTeam,
  Ticket,
} from "../types";

// ─── Sentiment Analysis ─────────────────────────────────────────────────────

type Sentiment = "positive" | "neutral" | "frustrated" | "angry";

const SENTIMENT_SIGNALS: Record<Sentiment, { keywords: string[]; weight: number }> = {
  angry: {
    keywords: [
      "unacceptable", "outrageous", "terrible", "worst", "disgusting",
      "furious", "scam", "incompetent", "useless", "lawsuit",
      "ridiculous", "absurd", "demand", "immediately", "cancel my account",
    ],
    weight: 1.0,
  },
  frustrated: {
    keywords: [
      "frustrated", "annoyed", "disappointed", "still not working",
      "tried everything", "again", "how many times", "been waiting",
      "waste of time", "days now", "not helpful", "same issue",
      "already told you", "keep getting", "nothing works",
    ],
    weight: 0.7,
  },
  positive: {
    keywords: [
      "thank you", "thanks", "great", "helpful", "appreciate",
      "excellent", "working now", "resolved", "perfect", "amazing",
    ],
    weight: 0.3,
  },
  neutral: {
    keywords: [],
    weight: 0.0,
  },
};

function analyzeSentiment(messages: ConversationMessage[]): Sentiment {
  // Only analyze customer messages, weighted toward recent ones
  const customerMessages = messages.filter((m) => m.role === "user");
  if (customerMessages.length === 0) return "neutral";

  const scores: Record<Sentiment, number> = {
    positive: 0,
    neutral: 0.5, // Default baseline
    frustrated: 0,
    angry: 0,
  };

  // Weight recent messages more heavily
  for (let i = 0; i < customerMessages.length; i++) {
    const msg = customerMessages[i];
    if (!msg) continue;
    const recencyWeight = (i + 1) / customerMessages.length; // More recent = higher weight
    const text = msg.content.toLowerCase();

    for (const [sentiment, signals] of Object.entries(SENTIMENT_SIGNALS) as [Sentiment, typeof SENTIMENT_SIGNALS[Sentiment]][]) {
      for (const keyword of signals.keywords) {
        if (text.includes(keyword)) {
          scores[sentiment] += signals.weight * recencyWeight;
        }
      }
    }

    // Check for all-caps (shouting)
    const capsRatio = (text.match(/[A-Z]/g)?.length ?? 0) / Math.max(text.length, 1);
    if (capsRatio > 0.5 && text.length > 10) {
      scores.angry += 0.3 * recencyWeight;
    }

    // Check for excessive punctuation
    if (/[!?]{2,}/.test(msg.content)) {
      scores.frustrated += 0.2 * recencyWeight;
    }
  }

  // Return the highest-scoring sentiment
  let best: Sentiment = "neutral";
  let bestScore = 0;
  for (const [sentiment, score] of Object.entries(scores) as [Sentiment, number][]) {
    if (score > bestScore) {
      bestScore = score;
      best = sentiment;
    }
  }

  return best;
}

// ─── Issue Complexity Assessment ────────────────────────────────────────────

type Complexity = "simple" | "moderate" | "complex";

function assessComplexity(
  ticket: Ticket,
  conversation: Conversation,
  diagnostics?: DiagnosticReport,
): Complexity {
  let complexityScore = 0;

  // Multiple failing diagnostic checks = more complex
  if (diagnostics) {
    const failCount = diagnostics.checks.filter((c) => c.status === "fail").length;
    complexityScore += failCount * 2;
  }

  // Longer conversations suggest more complexity
  if (conversation.messages.length > 10) complexityScore += 2;
  if (conversation.messages.length > 20) complexityScore += 2;

  // Certain categories are inherently more complex
  const complexCategories = ["authentication_failure", "reputation_problem", "delivery_issue"];
  if (complexCategories.includes(ticket.category)) complexityScore += 1;

  // Multiple domains or cross-service issues
  const messageText = conversation.messages.map((m) => m.content).join(" ");
  const domainMentions = new Set(messageText.match(/\b[\w-]+\.[\w.]+/g) ?? []);
  if (domainMentions.size > 2) complexityScore += 2;

  if (complexityScore <= 2) return "simple";
  if (complexityScore <= 5) return "moderate";
  return "complex";
}

// ─── Escalation Rules ───────────────────────────────────────────────────────

const DEFAULT_RULES: EscalationRule[] = [
  {
    condition: (ctx) => ctx.aiConfidence < 0.3,
    team: "tier2_support",
    urgency: "urgent",
    description: "AI confidence is critically low - needs human expertise",
  },
  {
    condition: (ctx) => ctx.ticket.category === "billing",
    team: "billing",
    urgency: "normal",
    description: "Billing inquiries require human handling",
  },
  {
    condition: (ctx) =>
      ctx.customerSentiment === "angry" && ctx.turnCount > 3,
    team: "tier2_support",
    urgency: "urgent",
    description: "Customer is angry after multiple exchanges",
  },
  {
    condition: (ctx) =>
      ctx.ticket.category === "delivery_issue" &&
      ctx.issueComplexity === "complex" &&
      ctx.aiConfidence < 0.6,
    team: "deliverability",
    urgency: "urgent",
    description: "Complex deliverability issue beyond AI resolution",
  },
  {
    condition: (ctx) => {
      const content = ctx.conversation.messages
        .map((m) => m.content)
        .join(" ")
        .toLowerCase();
      return (
        content.includes("security") ||
        content.includes("compromised") ||
        content.includes("unauthorized") ||
        content.includes("breach")
      );
    },
    team: "security",
    urgency: "emergency",
    description: "Potential security concern detected",
  },
  {
    condition: (ctx) =>
      ctx.ticket.sla.firstResponseBreached || ctx.ticket.sla.resolutionBreached,
    team: "tier2_support",
    urgency: "urgent",
    description: "SLA has been breached",
  },
  {
    condition: (ctx) => ctx.isRepeatIssue && ctx.turnCount > 5,
    team: "engineering",
    urgency: "normal",
    description: "Recurring issue that may indicate a platform problem",
  },
  {
    condition: (ctx) =>
      ctx.issueComplexity === "complex" &&
      ctx.diagnostics !== undefined &&
      ctx.diagnostics.checks.filter((c) => c.status === "fail").length >= 3,
    team: "engineering",
    urgency: "urgent",
    description: "Multiple system failures detected across diagnostic checks",
  },
  {
    condition: (ctx) => ctx.turnCount > 15 && !ctx.conversation.messages.some(
      (m) => m.role === "assistant" && m.content.toLowerCase().includes("resolved"),
    ),
    team: "tier2_support",
    urgency: "normal",
    description: "Extended conversation without resolution",
  },
  {
    condition: (ctx) => {
      const customerMessages = ctx.conversation.messages.filter(
        (m) => m.role === "user",
      );
      return customerMessages.some((m) => {
        const lower = m.content.toLowerCase();
        return (
          lower.includes("speak to a human") ||
          lower.includes("talk to a person") ||
          lower.includes("real person") ||
          lower.includes("human agent") ||
          lower.includes("transfer me") ||
          lower.includes("escalate")
        );
      });
    },
    team: "tier2_support",
    urgency: "normal",
    description: "Customer explicitly requested human assistance",
  },
];

// ─── Escalation Router ─────────────────────────────────────────────────────

export class EscalationRouter {
  private readonly rules: EscalationRule[];
  private readonly teamAvailability: Map<EscalationTeam, boolean>;

  constructor(customRules?: EscalationRule[]) {
    this.rules = customRules ?? DEFAULT_RULES;
    this.teamAvailability = new Map([
      ["tier2_support", true],
      ["engineering", true],
      ["deliverability", true],
      ["security", true],
      ["billing", true],
      ["account_management", true],
    ]);
  }

  /**
   * Evaluate whether a ticket should be escalated, and to which team.
   * Returns the escalation decision with routing details.
   */
  evaluate(
    ticket: Ticket,
    conversation: Conversation,
    aiConfidence: number,
    diagnostics?: DiagnosticReport,
  ): EscalationResult {
    const context = this.buildContext(ticket, conversation, aiConfidence, diagnostics);

    // Evaluate all rules, collect matching ones
    const matchedRules: EscalationRule[] = [];
    for (const rule of this.rules) {
      try {
        if (rule.condition(context)) {
          matchedRules.push(rule);
        }
      } catch {
        // Rule evaluation failed - skip it
      }
    }

    if (matchedRules.length === 0) {
      return {
        escalated: false,
        reason: "No escalation criteria met. AI can continue handling this ticket.",
      };
    }

    // Prioritize matched rules by urgency
    const urgencyOrder: Record<string, number> = {
      emergency: 0,
      urgent: 1,
      normal: 2,
    };

    matchedRules.sort(
      (a, b) => (urgencyOrder[a.urgency] ?? 99) - (urgencyOrder[b.urgency] ?? 99),
    );

    const primaryRule = matchedRules[0];
    if (!primaryRule) {
      return {
        escalated: false,
        reason: "No escalation criteria met. AI can continue handling this ticket.",
      };
    }
    const team = this.findAvailableTeam(primaryRule.team);
    const reasons = matchedRules.map((r) => r.description);

    return {
      escalated: true,
      team,
      estimatedResponseTime: this.getEstimatedResponseTime(team, primaryRule.urgency),
      reason: reasons.join("; "),
    };
  }

  /**
   * Build a full escalation request with all context for the receiving team.
   */
  buildEscalationRequest(
    ticket: Ticket,
    conversation: Conversation,
    evaluationResult: EscalationResult,
    diagnostics?: DiagnosticReport,
  ): EscalationRequest | null {
    if (!evaluationResult.escalated || !evaluationResult.team) {
      return null;
    }

    const aiSummary = this.generateAiSummary(ticket, conversation, diagnostics);

    return {
      ticketId: ticket.id,
      reason: this.mapReasonToEnum(evaluationResult.reason),
      team: evaluationResult.team,
      urgency: this.determineUrgency(evaluationResult),
      context: evaluationResult.reason,
      aiSummary,
      conversationHistory: conversation.messages,
      ...(diagnostics !== undefined ? { diagnosticReport: diagnostics } : {}),
    };
  }

  /**
   * Score the AI's confidence for a particular response.
   * Takes into account multiple factors beyond the raw model confidence.
   */
  scoreConfidence(
    rawAiConfidence: number,
    ticket: Ticket,
    conversation: Conversation,
    diagnostics?: DiagnosticReport,
  ): {
    adjustedConfidence: number;
    factors: Record<string, number>;
    shouldEscalate: boolean;
  } {
    const factors: Record<string, number> = {
      rawModelConfidence: rawAiConfidence,
    };

    let adjusted = rawAiConfidence;

    // Factor: Diagnostic data availability
    if (diagnostics) {
      const passRate =
        diagnostics.checks.filter((c) => c.status === "pass").length /
        Math.max(diagnostics.checks.length, 1);
      factors.diagnosticClarity = passRate;
      // Clear diagnostic results boost confidence
      adjusted += (passRate - 0.5) * 0.2;
    } else {
      factors.diagnosticClarity = 0;
      adjusted -= 0.1; // No diagnostics reduces confidence
    }

    // Factor: Issue category familiarity
    const wellHandledCategories = [
      "dns_configuration",
      "authentication_failure",
      "bounce_issue",
      "rate_limiting",
    ];
    if (wellHandledCategories.includes(ticket.category)) {
      factors.categoryFamiliarity = 0.8;
      adjusted += 0.1;
    } else {
      factors.categoryFamiliarity = 0.4;
      adjusted -= 0.05;
    }

    // Factor: Conversation length (longer = harder)
    const turnCount = conversation.messages.filter((m) => m.role === "user").length;
    const turnPenalty = Math.max(0, (turnCount - 5) * 0.03);
    factors.conversationComplexity = Math.max(0, 1 - turnPenalty);
    adjusted -= turnPenalty;

    // Factor: Customer sentiment
    const sentiment = analyzeSentiment(conversation.messages);
    const sentimentModifier: Record<Sentiment, number> = {
      positive: 0.05,
      neutral: 0,
      frustrated: -0.1,
      angry: -0.2,
    };
    factors.customerSentiment = sentiment === "positive" ? 1.0 : sentiment === "neutral" ? 0.7 : sentiment === "frustrated" ? 0.4 : 0.1;
    adjusted += sentimentModifier[sentiment];

    // Clamp
    adjusted = Math.max(0, Math.min(1, adjusted));

    return {
      adjustedConfidence: adjusted,
      factors,
      shouldEscalate: adjusted < 0.4,
    };
  }

  /**
   * Update team availability (e.g., outside business hours).
   */
  setTeamAvailability(team: EscalationTeam, available: boolean): void {
    this.teamAvailability.set(team, available);
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private buildContext(
    ticket: Ticket,
    conversation: Conversation,
    aiConfidence: number,
    diagnostics?: DiagnosticReport,
  ): EscalationContext {
    const customerMessages = conversation.messages.filter((m) => m.role === "user");
    const sentiment = analyzeSentiment(conversation.messages);
    const complexity = assessComplexity(ticket, conversation, diagnostics);

    // Check if this is a repeat issue
    const isRepeatIssue = conversation.context.previousTickets.some(
      (prev) => prev.category === ticket.category && prev.status === "resolved",
    );

    return {
      ticket,
      conversation,
      ...(diagnostics !== undefined ? { diagnostics } : {}),
      aiConfidence,
      turnCount: customerMessages.length,
      customerSentiment: sentiment,
      issueComplexity: complexity,
      isRepeatIssue,
    };
  }

  private findAvailableTeam(preferred: EscalationTeam): EscalationTeam {
    if (this.teamAvailability.get(preferred)) {
      return preferred;
    }

    // Fallback chain
    const fallbacks: Record<EscalationTeam, EscalationTeam[]> = {
      tier2_support: ["account_management"],
      engineering: ["tier2_support"],
      deliverability: ["tier2_support", "engineering"],
      security: ["engineering", "tier2_support"],
      billing: ["account_management", "tier2_support"],
      account_management: ["tier2_support"],
    };

    const chain = fallbacks[preferred] ?? ["tier2_support"];
    for (const fallback of chain) {
      if (this.teamAvailability.get(fallback)) {
        return fallback;
      }
    }

    // Last resort
    return "tier2_support";
  }

  private getEstimatedResponseTime(
    team: EscalationTeam,
    urgency: string,
  ): number {
    // Response times in minutes
    const baseTimes: Record<EscalationTeam, number> = {
      tier2_support: 30,
      engineering: 120,
      deliverability: 60,
      security: 15,
      billing: 60,
      account_management: 120,
    };

    const urgencyMultiplier: Record<string, number> = {
      emergency: 0.25,
      urgent: 0.5,
      normal: 1.0,
    };

    const baseTime = baseTimes[team] ?? 60;
    const multiplier = urgencyMultiplier[urgency] ?? 1.0;
    return Math.round(baseTime * multiplier);
  }

  private generateAiSummary(
    ticket: Ticket,
    conversation: Conversation,
    diagnostics?: DiagnosticReport,
  ): string {
    const parts: string[] = [];

    parts.push(`## Ticket: ${ticket.subject}`);
    parts.push(`Category: ${ticket.category} | Priority: ${ticket.priority} | Status: ${ticket.status}`);

    if (diagnostics) {
      parts.push(`\n### Diagnostic Results (${diagnostics.overallStatus})`);
      for (const check of diagnostics.checks) {
        parts.push(`- ${check.name}: ${check.status} - ${check.message}`);
      }
      if (diagnostics.recommendations.length > 0) {
        parts.push(`\n### Recommendations`);
        for (const rec of diagnostics.recommendations) {
          parts.push(`- ${rec}`);
        }
      }
    }

    const turnCount = conversation.messages.filter((m) => m.role === "user").length;
    parts.push(`\n### Conversation: ${turnCount} customer messages, ${conversation.messages.length} total`);

    // Include the last few messages
    const lastMessages = conversation.messages.slice(-4);
    parts.push(`\n### Recent Messages`);
    for (const msg of lastMessages) {
      const preview = msg.content.length > 200
        ? msg.content.slice(0, 200) + "..."
        : msg.content;
      parts.push(`[${msg.role}]: ${preview}`);
    }

    return parts.join("\n");
  }

  private mapReasonToEnum(
    reason: string,
  ): EscalationReason {
    const lower = reason.toLowerCase();

    if (lower.includes("confidence")) return "low_confidence";
    if (lower.includes("customer") && (lower.includes("request") || lower.includes("asked"))) return "customer_request";
    if (lower.includes("complex")) return "complex_issue";
    if (lower.includes("billing")) return "billing_issue";
    if (lower.includes("security")) return "security_concern";
    if (lower.includes("repeat") || lower.includes("recurring")) return "repeated_failure";
    if (lower.includes("sla") || lower.includes("breach")) return "sla_breach";

    return "complex_issue";
  }

  private determineUrgency(
    result: EscalationResult,
  ): "normal" | "urgent" | "emergency" {
    const lower = result.reason.toLowerCase();

    if (lower.includes("security") || lower.includes("emergency")) return "emergency";
    if (lower.includes("sla") || lower.includes("angry") || lower.includes("urgent") || lower.includes("critical")) return "urgent";
    return "normal";
  }
}
