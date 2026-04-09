/**
 * @emailed/support - Support Email Intake Pipeline
 *
 * The engine that receives inbound support emails and routes them through AI.
 * This is the main entry point for the autonomous support system:
 *
 *   Inbound email arrives → Parse → Create/match ticket → Load context →
 *   AI Agent processes → Generate reply → Queue outbound reply
 *
 * Replaces an entire customer service team with AI-first resolution.
 */

import type {
  AgentConfig,
  AgentResponse,
  Conversation,
  ConversationContext,
  ConversationMessage,
  Ticket,
  TicketCategory,
  TicketPriority,
  Result,
} from "../types";
import { ok, err } from "../types";
import type { AiSupportAgent } from "../agent/ai-agent";
import type { TicketSystem } from "../tickets/system";
import type { EscalationRouter } from "../escalation/router";
import type { SupportReplyComposer, ComposedEmail } from "./reply-composer";
import type { AutoResponder } from "./auto-responder";
import type { SupportLearningEngine } from "./learning";

// ─── Inbound Email Types ───────────────────────────────────────────────────

export interface RawInboundEmail {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  textBody: string;
  htmlBody?: string;
  headers: Record<string, string>;
  inReplyTo?: string;
  references?: string[];
  attachments?: EmailAttachment[];
  receivedAt: Date;
  rawSize: number;
}

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
}

export interface IntakeResult {
  ticketId: string;
  isNewTicket: boolean;
  autoReplied: boolean;
  escalated: boolean;
  agentConfidence: number;
  responseTimeMs: number;
  reply?: ComposedEmail | undefined;
}

export interface PipelineMetrics {
  totalProcessed: number;
  autoResolved: number;
  escalated: number;
  newTickets: number;
  existingTickets: number;
  duplicatesDetected: number;
  outOfOfficeDetected: number;
  unsubscribeProcessed: number;
  avgResponseTimeMs: number;
  avgConfidence: number;
  errorCount: number;
}

export interface EmailQueueService {
  enqueueOutbound(email: ComposedEmail): Promise<Result<string>>;
}

export interface AccountLookupService {
  findByEmail(email: string): Promise<Result<{ accountId: string; domain?: string } | null>>;
}

export interface ThreadStore {
  findTicketByMessageId(messageId: string): Promise<string | null>;
  findTicketByReferences(references: string[]): Promise<string | null>;
  saveMapping(messageId: string, ticketId: string): Promise<void>;
}

export interface ConversationStore {
  get(conversationId: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
  findByTicketId(ticketId: string): Promise<Conversation | null>;
}

// ─── Pipeline Configuration ────────────────────────────────────────────────

export interface PipelineConfig {
  /** Confidence threshold for auto-sending replies (0-1) */
  autoReplyThreshold: number;
  /** Whether to send acknowledgment emails */
  sendAcknowledgments: boolean;
  /** Maximum body length to process (bytes) */
  maxBodyLength: number;
  /** Support email addresses (used to filter out self-replies) */
  supportAddresses: string[];
  /** Whether learning engine records outcomes */
  enableLearning: boolean;
  /** Whether to check for duplicate submissions */
  enableDuplicateDetection: boolean;
}

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  autoReplyThreshold: 0.7,
  sendAcknowledgments: true,
  maxBodyLength: 500_000,
  supportAddresses: ["support@emailed.dev", "help@emailed.dev"],
  enableLearning: true,
  enableDuplicateDetection: true,
};

// ─── Support Email Pipeline ────────────────────────────────────────────────

export class SupportEmailPipeline {
  private readonly agent: AiSupportAgent;
  private readonly tickets: TicketSystem;
  private readonly escalationRouter: EscalationRouter;
  private readonly replyComposer: SupportReplyComposer;
  private readonly autoResponder: AutoResponder;
  private readonly learningEngine: SupportLearningEngine | null;
  private readonly emailQueue: EmailQueueService;
  private readonly accountLookup: AccountLookupService;
  private readonly threadStore: ThreadStore;
  private readonly conversationStore: ConversationStore;
  private readonly config: PipelineConfig;
  private readonly metrics: PipelineMetrics;

  constructor(deps: {
    agent: AiSupportAgent;
    tickets: TicketSystem;
    escalationRouter: EscalationRouter;
    replyComposer: SupportReplyComposer;
    autoResponder: AutoResponder;
    learningEngine?: SupportLearningEngine;
    emailQueue: EmailQueueService;
    accountLookup: AccountLookupService;
    threadStore: ThreadStore;
    conversationStore: ConversationStore;
    config?: Partial<PipelineConfig>;
  }) {
    this.agent = deps.agent;
    this.tickets = deps.tickets;
    this.escalationRouter = deps.escalationRouter;
    this.replyComposer = deps.replyComposer;
    this.autoResponder = deps.autoResponder;
    this.learningEngine = deps.learningEngine ?? null;
    this.emailQueue = deps.emailQueue;
    this.accountLookup = deps.accountLookup;
    this.threadStore = deps.threadStore;
    this.conversationStore = deps.conversationStore;
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...deps.config };
    this.metrics = {
      totalProcessed: 0,
      autoResolved: 0,
      escalated: 0,
      newTickets: 0,
      existingTickets: 0,
      duplicatesDetected: 0,
      outOfOfficeDetected: 0,
      unsubscribeProcessed: 0,
      avgResponseTimeMs: 0,
      avgConfidence: 0,
      errorCount: 0,
    };
  }

  /**
   * Main entry point: process an inbound support email end-to-end.
   *
   * Flow:
   * 1. Validate & parse the email
   * 2. Check for OOO replies, duplicates, unsubscribes
   * 3. Look up the sender's account
   * 4. Match to existing ticket or create new one
   * 5. Load full conversation context
   * 6. Run AI agent
   * 7. Decide: auto-reply or escalate
   * 8. Queue outbound reply
   * 9. Record outcome for learning
   */
  async processInboundEmail(rawEmail: RawInboundEmail): Promise<Result<IntakeResult>> {
    const startTime = Date.now();

    try {
      // ── Step 1: Validate ──────────────────────────────────────────────
      const validationResult = this.validateEmail(rawEmail);
      if (!validationResult.ok) {
        this.metrics.errorCount++;
        return validationResult;
      }

      // ── Step 2: Pre-processing checks ─────────────────────────────────
      // Check if this is a self-reply (from our own support address)
      if (this.isSelfReply(rawEmail)) {
        return err(new Error("Ignoring self-reply from support address"));
      }

      // Check for out-of-office replies
      if (this.autoResponder.handleOutOfOffice(rawEmail)) {
        this.metrics.outOfOfficeDetected++;
        return ok({
          ticketId: "",
          isNewTicket: false,
          autoReplied: false,
          escalated: false,
          agentConfidence: 1.0,
          responseTimeMs: Date.now() - startTime,
        });
      }

      // Check for unsubscribe requests
      if (this.autoResponder.handleUnsubscribe(rawEmail)) {
        this.metrics.unsubscribeProcessed++;
        return ok({
          ticketId: "",
          isNewTicket: false,
          autoReplied: false,
          escalated: false,
          agentConfidence: 1.0,
          responseTimeMs: Date.now() - startTime,
        });
      }

      // Check for duplicates
      if (this.config.enableDuplicateDetection) {
        const isDuplicate = await this.autoResponder.detectDuplicate(rawEmail);
        if (isDuplicate) {
          this.metrics.duplicatesDetected++;
          return ok({
            ticketId: "",
            isNewTicket: false,
            autoReplied: false,
            escalated: false,
            agentConfidence: 1.0,
            responseTimeMs: Date.now() - startTime,
          });
        }
      }

      // ── Step 3: Account lookup ────────────────────────────────────────
      const accountResult = await this.accountLookup.findByEmail(rawEmail.from.address);
      const accountInfo = accountResult.ok ? accountResult.value : null;
      const accountId = accountInfo?.accountId ?? `anon-${this.hashEmail(rawEmail.from.address)}`;
      const domain = accountInfo?.domain;

      // ── Step 4: Match or create ticket ────────────────────────────────
      const { ticket, isNew, conversation } = await this.matchOrCreateTicket(
        rawEmail,
        accountId,
      );

      if (isNew) {
        this.metrics.newTickets++;
      } else {
        this.metrics.existingTickets++;
      }

      // Save the message-to-ticket mapping for threading
      await this.threadStore.saveMapping(rawEmail.messageId, ticket.id);

      // ── Step 5: Send acknowledgment for new tickets ───────────────────
      if (isNew && this.config.sendAcknowledgments) {
        const ackResult = await this.autoResponder.sendAcknowledgment(ticket);
        if (ackResult.ok && ackResult.value) {
          await this.emailQueue.enqueueOutbound(ackResult.value);
        }
      }

      // ── Step 6: Add user message to conversation ──────────────────────
      const userMessage = this.extractMessageBody(rawEmail);
      const msgRecord: ConversationMessage = {
        id: rawEmail.messageId,
        role: "user",
        content: userMessage,
        timestamp: rawEmail.receivedAt,
        metadata: {
          subject: rawEmail.subject,
          from: rawEmail.from.address,
          hasAttachments: (rawEmail.attachments?.length ?? 0) > 0,
        },
      };
      conversation.messages.push(msgRecord);

      // ── Step 7: Build context & run AI agent ──────────────────────────
      const contextResult = await this.agent.buildContext(accountId, domain);
      if (contextResult.ok) {
        conversation.context = contextResult.value;
      }

      const agentResult = await this.agent.processMessage(conversation, userMessage);
      if (!agentResult.ok) {
        this.metrics.errorCount++;
        // Even on AI failure, save conversation state
        await this.conversationStore.save(conversation);
        return err(agentResult.error);
      }

      const agentResponse = agentResult.value;
      this.metrics.totalProcessed++;

      // ── Step 8: Add agent response to conversation ────────────────────
      const agentMessage: ConversationMessage = {
        id: `agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: agentResponse.message,
        timestamp: new Date(),
        metadata: {
          confidence: agentResponse.confidence,
          actionsExecuted: agentResponse.actions.length,
          resolvedIssue: agentResponse.resolvedIssue,
        },
      };
      conversation.messages.push(agentMessage);

      // ── Step 9: Decide auto-reply vs escalation ───────────────────────
      let autoReplied = false;
      let escalated = false;
      let composedReply: ComposedEmail | undefined;

      const escalationResult = this.escalationRouter.evaluate(
        ticket,
        conversation,
        agentResponse.confidence,
      );

      if (escalationResult.escalated || agentResponse.suggestedEscalation) {
        // Escalate the ticket
        escalated = true;
        this.metrics.escalated++;

        await this.tickets.escalateTicket(
          ticket.id,
          escalationResult.reason,
          escalationResult.assignedTo,
        );

        conversation.status = "escalated";

        // Still compose a reply informing the customer about escalation
        const escalationReply = this.replyComposer.composeEscalationNotice(
          ticket,
          rawEmail,
          escalationResult.estimatedResponseTime ?? 60,
        );
        if (escalationReply.ok) {
          composedReply = escalationReply.value;
          await this.emailQueue.enqueueOutbound(composedReply);
          autoReplied = true;
        }
      } else if (agentResponse.confidence >= this.config.autoReplyThreshold) {
        // Auto-reply with AI response
        const replyResult = this.replyComposer.composeReply(
          ticket,
          agentResponse,
          rawEmail,
        );

        if (replyResult.ok) {
          composedReply = replyResult.value;
          await this.emailQueue.enqueueOutbound(composedReply);
          autoReplied = true;
          this.metrics.autoResolved++;

          // Record first response SLA
          await this.tickets.addNote(
            ticket.id,
            "ai-agent",
            agentResponse.message,
            { internal: false, authorType: "ai" },
          );

          // Mark as resolved if AI says it's resolved
          if (agentResponse.resolvedIssue) {
            await this.tickets.resolveTicket(
              ticket.id,
              agentResponse.message,
              "ai-agent",
            );
            conversation.status = "resolved";
          } else if (agentResponse.followUpNeeded) {
            conversation.status = "waiting_user";
            await this.tickets.updateTicket(ticket.id, { status: "waiting_customer" });
          } else {
            conversation.status = "active";
            await this.tickets.updateTicket(ticket.id, { status: "in_progress" });
          }
        }
      } else {
        // Confidence too low for auto-reply but not escalation-worthy
        // Queue for human review
        conversation.status = "waiting_agent";
        await this.tickets.updateTicket(ticket.id, { status: "waiting_internal" });
        await this.tickets.addNote(
          ticket.id,
          "ai-agent",
          `AI draft (confidence: ${(agentResponse.confidence * 100).toFixed(0)}%):\n\n${agentResponse.message}`,
          { internal: true, authorType: "ai" },
        );
      }

      // ── Step 10: Save conversation state ──────────────────────────────
      await this.conversationStore.save(conversation);

      // ── Step 11: Record outcome for learning ──────────────────────────
      if (this.config.enableLearning && this.learningEngine) {
        await this.learningEngine.recordOutcome(ticket, {
          type: autoReplied ? "auto_replied" : escalated ? "escalated" : "queued_for_review",
          confidence: agentResponse.confidence,
          responseTimeMs: Date.now() - startTime,
          actionsExecuted: agentResponse.actions.map((a) => a.action.type),
          resolved: agentResponse.resolvedIssue,
        });
      }

      // ── Update aggregate metrics ──────────────────────────────────────
      const responseTime = Date.now() - startTime;
      this.updateAverageMetrics(responseTime, agentResponse.confidence);

      return ok({
        ticketId: ticket.id,
        isNewTicket: isNew,
        autoReplied,
        escalated,
        agentConfidence: agentResponse.confidence,
        responseTimeMs: responseTime,
        reply: composedReply,
      });
    } catch (error) {
      this.metrics.errorCount++;
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get current pipeline metrics.
   */
  getMetrics(): Readonly<PipelineMetrics> {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (typically called at the start of a reporting period).
   */
  resetMetrics(): void {
    this.metrics.totalProcessed = 0;
    this.metrics.autoResolved = 0;
    this.metrics.escalated = 0;
    this.metrics.newTickets = 0;
    this.metrics.existingTickets = 0;
    this.metrics.duplicatesDetected = 0;
    this.metrics.outOfOfficeDetected = 0;
    this.metrics.unsubscribeProcessed = 0;
    this.metrics.avgResponseTimeMs = 0;
    this.metrics.avgConfidence = 0;
    this.metrics.errorCount = 0;
  }

  // ─── Private Methods ──────────────────────────────────────────────────────

  /**
   * Validate the inbound email before processing.
   */
  private validateEmail(email: RawInboundEmail): Result<void> {
    if (!email.from.address) {
      return err(new Error("Email has no sender address"));
    }

    if (!email.subject && !email.textBody) {
      return err(new Error("Email has no subject and no body"));
    }

    if (email.rawSize > this.config.maxBodyLength) {
      return err(new Error(`Email too large: ${email.rawSize} bytes exceeds ${this.config.maxBodyLength} limit`));
    }

    // Basic email format validation
    if (!email.from.address.includes("@")) {
      return err(new Error(`Invalid sender address: ${email.from.address}`));
    }

    return ok(undefined);
  }

  /**
   * Check if this email is from one of our own support addresses (loop detection).
   */
  private isSelfReply(email: RawInboundEmail): boolean {
    const lowerFrom = email.from.address.toLowerCase();
    return this.config.supportAddresses.some(
      (addr) => addr.toLowerCase() === lowerFrom,
    );
  }

  /**
   * Match the inbound email to an existing ticket or create a new one.
   * Uses In-Reply-To and References headers for thread matching.
   */
  private async matchOrCreateTicket(
    email: RawInboundEmail,
    accountId: string,
  ): Promise<{ ticket: Ticket; isNew: boolean; conversation: Conversation }> {
    // Try to find existing ticket via In-Reply-To header
    let existingTicketId: string | null = null;

    if (email.inReplyTo) {
      existingTicketId = await this.threadStore.findTicketByMessageId(email.inReplyTo);
    }

    // Fallback: try References header chain
    if (!existingTicketId && email.references && email.references.length > 0) {
      existingTicketId = await this.threadStore.findTicketByReferences(email.references);
    }

    // Fallback: try to match by subject line ticket reference (e.g., "[TKT-xxx]")
    if (!existingTicketId) {
      const ticketRef = this.extractTicketReference(email.subject);
      if (ticketRef) {
        const ticketResult = await this.tickets.getTicket(ticketRef);
        if (ticketResult.ok) {
          existingTicketId = ticketRef;
        }
      }
    }

    // Found existing ticket - load it and its conversation
    if (existingTicketId) {
      const ticketResult = await this.tickets.getTicket(existingTicketId);
      if (ticketResult.ok) {
        const ticket = ticketResult.value;

        // Re-open if it was resolved/closed
        if (ticket.status === "resolved" || ticket.status === "closed") {
          await this.tickets.updateTicket(ticket.id, { status: "open" });
          ticket.status = "open";
        }

        let conversation = await this.conversationStore.findByTicketId(ticket.id);
        if (!conversation) {
          conversation = this.createConversation(ticket);
        }

        return { ticket, isNew: false, conversation };
      }
    }

    // No existing ticket found - create a new one
    const createResult = await this.tickets.createTicket({
      accountId,
      subject: this.cleanSubject(email.subject),
      description: this.extractMessageBody(email),
    });

    if (!createResult.ok) {
      throw createResult.error;
    }

    const ticket = createResult.value;
    const conversation = this.createConversation(ticket);
    ticket.conversationId = conversation.id;

    return { ticket, isNew: true, conversation };
  }

  /**
   * Create a new Conversation for a ticket.
   */
  private createConversation(ticket: Ticket): Conversation {
    return {
      id: `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ticketId: ticket.id,
      accountId: ticket.accountId,
      messages: [],
      context: {
        accountId: ticket.accountId,
        recentErrors: [],
        previousTickets: [],
      },
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Extract the plain text message body, preferring text over HTML.
   * Strips quoted reply content to get only the new message.
   */
  private extractMessageBody(email: RawInboundEmail): string {
    let body = email.textBody || "";

    // If no text body, we'd need HTML-to-text conversion
    // For now, strip basic HTML tags as a fallback
    if (!body && email.htmlBody) {
      body = email.htmlBody
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, " ")
        .trim();
    }

    // Strip quoted reply content (lines starting with > or common reply markers)
    body = this.stripQuotedContent(body);

    // Truncate if too long
    const maxLength = 10_000;
    if (body.length > maxLength) {
      body = body.slice(0, maxLength) + "\n\n[Message truncated]";
    }

    return body.trim();
  }

  /**
   * Remove quoted reply content from the email body.
   * Detects common reply patterns from various email clients.
   */
  private stripQuotedContent(body: string): string {
    const lines = body.split("\n");
    const resultLines: string[] = [];
    let inQuotedBlock = false;

    for (const line of lines) {
      // Detect start of quoted content
      const trimmed = line.trim();

      // Common reply markers
      if (
        trimmed.startsWith("On ") && trimmed.includes(" wrote:") ||
        trimmed.startsWith("-----Original Message-----") ||
        trimmed.startsWith("________________________________") ||
        trimmed.startsWith("From:") && trimmed.includes("Sent:") ||
        trimmed === "-- " || // Signature delimiter
        trimmed.startsWith("> On ") && trimmed.includes(" wrote:")
      ) {
        inQuotedBlock = true;
        continue;
      }

      if (inQuotedBlock) {
        continue;
      }

      // Skip individual quoted lines (but keep the main body)
      if (trimmed.startsWith(">")) {
        continue;
      }

      resultLines.push(line);
    }

    return resultLines.join("\n").trim();
  }

  /**
   * Extract a ticket reference from a subject line like "Re: [TKT-abc123-0001] Your issue".
   */
  private extractTicketReference(subject: string): string | null {
    const match = subject.match(/\[?(TKT-[a-z0-9]+-[a-z0-9]+)\]?/i);
    return match ? match[1]! : null;
  }

  /**
   * Clean the subject line by removing Re:/Fwd: prefixes and ticket references.
   */
  private cleanSubject(subject: string): string {
    return subject
      .replace(/^(Re|Fwd|Fw):\s*/gi, "")
      .replace(/\[TKT-[a-z0-9]+-[a-z0-9]+\]\s*/gi, "")
      .trim() || "Support Request";
  }

  /**
   * Create a deterministic hash for anonymous account tracking.
   */
  private hashEmail(email: string): string {
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      const char = email.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(36).padStart(6, "0");
  }

  /**
   * Update running averages for metrics.
   */
  private updateAverageMetrics(responseTimeMs: number, confidence: number): void {
    const total = this.metrics.totalProcessed;
    if (total <= 1) {
      this.metrics.avgResponseTimeMs = responseTimeMs;
      this.metrics.avgConfidence = confidence;
    } else {
      // Incremental average calculation
      this.metrics.avgResponseTimeMs =
        this.metrics.avgResponseTimeMs + (responseTimeMs - this.metrics.avgResponseTimeMs) / total;
      this.metrics.avgConfidence =
        this.metrics.avgConfidence + (confidence - this.metrics.avgConfidence) / total;
    }
  }
}
