/**
 * @emailed/support - AI Support Agent
 *
 * Uses Claude API to handle customer inquiries with full platform access.
 * Can check delivery logs, DNS status, reputation scores, account settings.
 * Diagnoses and resolves issues autonomously.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  AgentAction,
  AgentActionResult,
  AgentActionType,
  AgentConfig,
  AgentResponse,
  Conversation,
  ConversationContext,
  DiagnosticReport,
  KnowledgeSearchResult,
  Result,
} from "../types";
import { ok, err } from "../types";

// ─── Platform Service Interfaces ────────────────────────────────────────────

export interface PlatformServices {
  dns: {
    checkStatus(domain: string): Promise<Result<ConversationContext["dnsStatus"]>>;
    updateRecord(domain: string, type: string, value: string): Promise<Result<void>>;
  };
  reputation: {
    getScore(domain: string): Promise<Result<ConversationContext["reputationScore"]>>;
    checkBlacklists(domain: string): Promise<Result<string[]>>;
  };
  delivery: {
    getLogs(accountId: string, params: { limit?: number; since?: Date; recipient?: string }): Promise<Result<ConversationContext["recentErrors"]>>;
    getStats(accountId: string, period: string): Promise<Result<ConversationContext["deliveryStats"]>>;
  };
  account: {
    getSettings(accountId: string): Promise<Result<ConversationContext["accountSettings"]>>;
    adjustSendingRate(accountId: string, ratePerHour: number): Promise<Result<void>>;
  };
  auth: {
    verifyDkim(domain: string): Promise<Result<{ valid: boolean; issues: string[] }>>;
    verifySpf(domain: string): Promise<Result<{ valid: boolean; issues: string[] }>>;
    rotateDkimKey(domain: string): Promise<Result<{ selector: string; publicKey: string }>>;
  };
  diagnostics: {
    runFull(accountId: string, domain: string): Promise<Result<DiagnosticReport>>;
  };
  knowledge: {
    search(query: string, limit?: number): Promise<Result<KnowledgeSearchResult[]>>;
  };
}

// ─── Tool Definitions for Claude ────────────────────────────────────────────

const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: "check_dns",
    description: "Check DNS configuration for a domain including SPF, DKIM, DMARC, and MX records. Use when a customer has delivery issues or is setting up a new domain.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "The domain to check" },
      },
      required: ["domain"],
    },
  },
  {
    name: "check_reputation",
    description: "Check the sending reputation for a domain including spam rate, bounce rate, blacklist status, and overall score.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "The domain to check" },
      },
      required: ["domain"],
    },
  },
  {
    name: "check_delivery_logs",
    description: "Retrieve recent delivery error logs for an account. Can filter by recipient or time range.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string", description: "The account ID" },
        recipient: { type: "string", description: "Optional: filter by recipient email" },
        hours: { type: "number", description: "Look back this many hours (default: 24)" },
        limit: { type: "number", description: "Max results (default: 50)" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "check_authentication",
    description: "Verify email authentication (DKIM and SPF) for a domain. Run this when emails are landing in spam or being rejected.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "The domain to verify" },
      },
      required: ["domain"],
    },
  },
  {
    name: "check_account_settings",
    description: "Get account configuration including plan, domains, sending limits, and features.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string", description: "The account ID" },
      },
      required: ["account_id"],
    },
  },
  {
    name: "run_diagnostics",
    description: "Run a comprehensive diagnostic suite on a domain: DNS, deliverability, authentication, reputation, and error analysis. Use for thorough troubleshooting.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string", description: "The account ID" },
        domain: { type: "string", description: "The domain to diagnose" },
      },
      required: ["account_id", "domain"],
    },
  },
  {
    name: "search_knowledge_base",
    description: "Search the knowledge base for relevant articles, troubleshooting guides, and documentation.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default: 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "update_dns_record",
    description: "Update a DNS record for a domain. Use with caution and always verify the change is correct.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "The domain" },
        record_type: { type: "string", description: "Record type (SPF, DKIM, DMARC, MX, etc.)" },
        value: { type: "string", description: "The new record value" },
      },
      required: ["domain", "record_type", "value"],
    },
  },
  {
    name: "rotate_dkim_key",
    description: "Rotate the DKIM signing key for a domain. Generates a new key pair and updates DNS.",
    input_schema: {
      type: "object" as const,
      properties: {
        domain: { type: "string", description: "The domain" },
      },
      required: ["domain"],
    },
  },
  {
    name: "adjust_sending_rate",
    description: "Adjust the sending rate limit for an account. Use when throttling is needed or limits should be raised.",
    input_schema: {
      type: "object" as const,
      properties: {
        account_id: { type: "string", description: "The account ID" },
        rate_per_hour: { type: "number", description: "New hourly sending rate" },
      },
      required: ["account_id", "rate_per_hour"],
    },
  },
  {
    name: "escalate_to_human",
    description: "Escalate the ticket to a human support agent. Use when the issue cannot be resolved automatically, involves billing, security concerns, or the customer explicitly requests human assistance.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "Why this needs human attention" },
        team: {
          type: "string",
          enum: ["tier2_support", "engineering", "deliverability", "security", "billing", "account_management"],
          description: "Which team should handle this",
        },
        urgency: {
          type: "string",
          enum: ["normal", "urgent", "emergency"],
          description: "How urgent is this escalation",
        },
      },
      required: ["reason", "team", "urgency"],
    },
  },
];

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(context: ConversationContext): string {
  const parts = [
    `You are an expert AI support agent for Emailed, an email infrastructure platform. You help customers diagnose and resolve email delivery issues.`,
    ``,
    `## Your capabilities`,
    `- Check and update DNS records (SPF, DKIM, DMARC, MX)`,
    `- Analyze delivery logs and error patterns`,
    `- Monitor domain reputation and blacklist status`,
    `- Verify email authentication configuration`,
    `- Run comprehensive diagnostics`,
    `- Search knowledge base for solutions`,
    `- Adjust sending rates and account settings`,
    ``,
    `## Guidelines`,
    `1. Always gather information before suggesting solutions. Use diagnostic tools.`,
    `2. Explain technical concepts clearly - customers may not be email experts.`,
    `3. When you find an issue, explain what it is, why it matters, and how to fix it.`,
    `4. If you need to make changes (DNS updates, key rotation), explain what you'll do and why before proceeding.`,
    `5. If you're not confident in a diagnosis (< 70% confidence), say so and consider escalating.`,
    `6. Never guess at billing or account status - check the actual data.`,
    `7. For security-related issues, always escalate to the security team.`,
    `8. Be direct and efficient. Customers want their problems solved quickly.`,
    ``,
    `## Current customer context`,
    `Account ID: ${context.accountId}`,
  ];

  if (context.domain) {
    parts.push(`Domain: ${context.domain}`);
  }

  if (context.accountSettings) {
    parts.push(`Plan: ${context.accountSettings.plan}`);
    parts.push(`Domains: ${context.accountSettings.domains.join(", ")}`);
  }

  if (context.previousTickets.length > 0) {
    parts.push(`\n## Previous tickets`);
    for (const ticket of context.previousTickets.slice(0, 5)) {
      parts.push(`- [${ticket.status}] ${ticket.subject} (${ticket.category}, ${ticket.createdAt.toISOString().split("T")[0]})`);
    }
  }

  if (context.recentErrors.length > 0) {
    parts.push(`\n## Recent errors (last 24h)`);
    for (const error of context.recentErrors.slice(0, 10)) {
      parts.push(`- [${error.level}] ${error.message} (${error.service}, ${error.timestamp.toISOString()})`);
    }
  }

  return parts.join("\n");
}

// ─── AI Support Agent ───────────────────────────────────────────────────────

export class AiSupportAgent {
  private readonly client: Anthropic;
  private readonly config: AgentConfig;
  private readonly platform: PlatformServices;

  constructor(config: AgentConfig, platform: PlatformServices) {
    this.client = new Anthropic();
    this.config = config;
    this.platform = platform;
  }

  /**
   * Process a customer message within an ongoing conversation.
   * Runs the full agent loop: analyze -> decide actions -> execute -> respond.
   */
  async processMessage(
    conversation: Conversation,
    userMessage: string,
  ): Promise<Result<AgentResponse>> {
    try {
      const systemPrompt = buildSystemPrompt(conversation.context);
      const messages = this.buildMessageHistory(conversation, userMessage);
      const allActions: AgentActionResult[] = [];
      let currentMessages = messages;
      let iterationCount = 0;
      const maxIterations = this.config.maxActionsPerTurn;

      // Agent loop: keep calling Claude until it produces a final text response
      while (iterationCount < maxIterations) {
        iterationCount++;

        const response = await this.client.messages.create({
          model: this.config.modelId,
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: systemPrompt,
          tools: AGENT_TOOLS,
          messages: currentMessages,
        });

        // Collect text blocks and tool use blocks
        const textBlocks: string[] = [];
        const toolUseBlocks: Anthropic.ContentBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "text") {
            textBlocks.push(block.text);
          } else if (block.type === "tool_use") {
            toolUseBlocks.push(block);
          }
        }

        // If no tool calls, we have our final response
        if (response.stop_reason === "end_turn" && toolUseBlocks.length === 0) {
          const finalMessage = textBlocks.join("\n\n");
          const confidence = this.estimateConfidence(allActions, finalMessage);

          return ok({
            message: finalMessage,
            actions: allActions,
            confidence,
            suggestedEscalation: confidence < this.config.escalationThreshold,
            resolvedIssue: this.detectResolution(finalMessage, allActions),
            followUpNeeded: this.detectFollowUp(finalMessage),
          });
        }

        // Execute tool calls and build tool results
        const assistantContent: Anthropic.ContentBlockParam[] = [];

        // Include text blocks in assistant message
        for (const text of textBlocks) {
          assistantContent.push({ type: "text", text });
        }

        const toolResultContent: Anthropic.ToolResultBlockParam[] = [];

        for (const block of toolUseBlocks) {
          if (block.type !== "tool_use") continue;

          assistantContent.push(block);

          const actionResult = await this.executeAction(
            block.name as AgentActionType,
            block.input as Record<string, unknown>,
          );
          allActions.push(actionResult);

          toolResultContent.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: actionResult.success
              ? JSON.stringify(actionResult.data)
              : `Error: ${actionResult.error}`,
            is_error: !actionResult.success,
          });
        }

        // Append assistant message with tool calls and the tool results
        currentMessages = [
          ...currentMessages,
          { role: "assistant" as const, content: assistantContent },
          { role: "user" as const, content: toolResultContent },
        ];
      }

      // Hit max iterations - return what we have
      return ok({
        message: "I've been working on your issue and have gathered some information, but I need more time to fully resolve it. Let me summarize what I've found so far and escalate if needed.",
        actions: allActions,
        confidence: 0.3,
        suggestedEscalation: true,
        resolvedIssue: false,
        followUpNeeded: true,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Build the conversation context for a new support session.
   * Fetches current account state from all platform services.
   */
  async buildContext(
    accountId: string,
    domain?: string,
  ): Promise<Result<ConversationContext>> {
    try {
      const context: ConversationContext = {
        accountId,
        ...(domain !== undefined ? { domain } : {}),
        recentErrors: [],
        previousTickets: [],
      };

      // Fetch data in parallel for speed
      const promises: Promise<void>[] = [];

      promises.push(
        this.platform.delivery
          .getLogs(accountId, { limit: 20, since: new Date(Date.now() - 86_400_000) })
          .then((result) => {
            if (result.ok && result.value) {
              context.recentErrors = result.value;
            }
          }),
      );

      promises.push(
        this.platform.account.getSettings(accountId).then((result) => {
          if (result.ok && result.value) {
            context.accountSettings = result.value;
          }
        }),
      );

      if (domain) {
        promises.push(
          this.platform.dns.checkStatus(domain).then((result) => {
            if (result.ok && result.value) {
              context.dnsStatus = result.value;
            }
          }),
        );

        promises.push(
          this.platform.reputation.getScore(domain).then((result) => {
            if (result.ok && result.value) {
              context.reputationScore = result.value;
            }
          }),
        );

        promises.push(
          this.platform.delivery.getStats(accountId, "24h").then((result) => {
            if (result.ok && result.value) {
              context.deliveryStats = result.value;
            }
          }),
        );
      }

      await Promise.allSettled(promises);

      return ok(context);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private buildMessageHistory(
    conversation: Conversation,
    newMessage: string,
  ): Anthropic.MessageParam[] {
    const messages: Anthropic.MessageParam[] = [];

    // Include relevant prior conversation messages (up to last 20)
    const recentMessages = conversation.messages.slice(-20);
    for (const msg of recentMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    // Add the new user message
    messages.push({
      role: "user",
      content: newMessage,
    });

    return messages;
  }

  private async executeAction(
    actionType: AgentActionType | string,
    params: Record<string, unknown>,
  ): Promise<AgentActionResult> {
    const action: AgentAction = {
      type: actionType as AgentActionType,
      params,
      description: `Executing ${actionType}`,
    };

    try {
      let data: unknown;

      switch (actionType) {
        case "check_dns": {
          const result = await this.platform.dns.checkStatus(params.domain as string);
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "check_reputation": {
          const result = await this.platform.reputation.getScore(params.domain as string);
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "check_delivery_logs": {
          const hours = (params.hours as number) ?? 24;
          const recipient = params.recipient as string | undefined;
          const result = await this.platform.delivery.getLogs(
            params.account_id as string,
            {
              limit: (params.limit as number) ?? 50,
              since: new Date(Date.now() - hours * 3_600_000),
              ...(recipient !== undefined ? { recipient } : {}),
            },
          );
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "check_authentication": {
          const domain = params.domain as string;
          const [dkim, spf] = await Promise.all([
            this.platform.auth.verifyDkim(domain),
            this.platform.auth.verifySpf(domain),
          ]);
          data = {
            dkim: dkim.ok ? dkim.value : { valid: false, issues: [String(dkim.error)] },
            spf: spf.ok ? spf.value : { valid: false, issues: [String(spf.error)] },
          };
          break;
        }

        case "check_account_settings": {
          const result = await this.platform.account.getSettings(params.account_id as string);
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "run_diagnostics": {
          const result = await this.platform.diagnostics.runFull(
            params.account_id as string,
            params.domain as string,
          );
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "search_knowledge_base": {
          const result = await this.platform.knowledge.search(
            params.query as string,
            (params.limit as number) ?? 5,
          );
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "update_dns_record": {
          const result = await this.platform.dns.updateRecord(
            params.domain as string,
            params.record_type as string,
            params.value as string,
          );
          if (!result.ok) throw result.error;
          data = { updated: true };
          break;
        }

        case "rotate_dkim_key": {
          const result = await this.platform.auth.rotateDkimKey(params.domain as string);
          if (!result.ok) throw result.error;
          data = result.value;
          break;
        }

        case "adjust_sending_rate": {
          const result = await this.platform.account.adjustSendingRate(
            params.account_id as string,
            params.rate_per_hour as number,
          );
          if (!result.ok) throw result.error;
          data = { adjusted: true, newRate: params.rate_per_hour };
          break;
        }

        case "escalate_to_human": {
          // Escalation is handled at the conversation level, just record intent
          data = {
            escalated: true,
            reason: params.reason,
            team: params.team,
            urgency: params.urgency,
          };
          break;
        }

        default:
          throw new Error(`Unknown action type: ${actionType}`);
      }

      return {
        action,
        success: true,
        data,
        executedAt: new Date(),
      };
    } catch (error) {
      return {
        action,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executedAt: new Date(),
      };
    }
  }

  /**
   * Estimate confidence based on actions taken and response content.
   * Higher confidence when diagnostics ran cleanly and data supports the conclusion.
   */
  private estimateConfidence(
    actions: AgentActionResult[],
    responseText: string,
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost for successful diagnostic actions
    const successfulActions = actions.filter((a) => a.success);
    const failedActions = actions.filter((a) => !a.success);

    if (successfulActions.length > 0) {
      confidence += Math.min(0.2, successfulActions.length * 0.05);
    }

    // Penalize for failed actions
    if (failedActions.length > 0) {
      confidence -= failedActions.length * 0.1;
    }

    // Boost for running comprehensive diagnostics
    if (successfulActions.some((a) => a.action.type === "run_diagnostics")) {
      confidence += 0.15;
    }

    // Boost for having knowledge base support
    if (successfulActions.some((a) => a.action.type === "search_knowledge_base")) {
      confidence += 0.05;
    }

    // Penalize for hedging language
    const hedgePhrases = ["i'm not sure", "might be", "possibly", "i think", "could be"];
    const lowerResponse = responseText.toLowerCase();
    for (const phrase of hedgePhrases) {
      if (lowerResponse.includes(phrase)) {
        confidence -= 0.05;
      }
    }

    // Boost for definitive language
    const confidentPhrases = ["the issue is", "i've fixed", "the problem was", "this is caused by"];
    for (const phrase of confidentPhrases) {
      if (lowerResponse.includes(phrase)) {
        confidence += 0.05;
      }
    }

    return Math.max(0, Math.min(1, confidence));
  }

  private detectResolution(
    responseText: string,
    actions: AgentActionResult[],
  ): boolean {
    const lower = responseText.toLowerCase();
    const resolutionPhrases = [
      "has been resolved",
      "should be fixed",
      "i've updated",
      "i've fixed",
      "the fix has been applied",
      "this should now work",
      "the issue is now resolved",
    ];

    const hasResolutionLanguage = resolutionPhrases.some((p) => lower.includes(p));
    const tookCorrectiveAction = actions.some(
      (a) =>
        a.success &&
        ["update_dns_record", "rotate_dkim_key", "adjust_sending_rate"].includes(a.action.type),
    );

    return hasResolutionLanguage || tookCorrectiveAction;
  }

  private detectFollowUp(responseText: string): boolean {
    const lower = responseText.toLowerCase();
    const followUpPhrases = [
      "let me know if",
      "please check",
      "try again",
      "can you confirm",
      "once you've",
      "propagation",
      "may take",
      "give it",
    ];
    return followUpPhrases.some((p) => lower.includes(p));
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createDefaultAgentConfig(): AgentConfig {
  return {
    modelId: "claude-sonnet-4-20250514",
    maxTokens: 4096,
    temperature: 0.3,
    maxActionsPerTurn: 8,
    confidenceThreshold: 0.7,
    escalationThreshold: 0.4,
    systemPrompt: "", // Built dynamically from context
  };
}
