/**
 * @emailed/support - Auto-Responder
 *
 * Handles immediate auto-acknowledgment emails, smart routing to
 * specialist AI prompts, OOO detection, duplicate detection,
 * and unsubscribe processing.
 */

import type {
  Ticket,
  TicketCategory,
  TicketPriority,
  Result,
} from "../types";
import { ok, err, SLA_POLICIES } from "../types";
import type { RawInboundEmail } from "./email-intake";
import type { ComposedEmail, BrandConfig, SupportReplyComposer } from "./reply-composer";

// ─── Specialist Routing ────────────────────────────────────────────────────

export interface SpecialistRoute {
  category: TicketCategory;
  systemPromptAddendum: string;
  requiredTools: string[];
  priority: TicketPriority;
}

const SPECIALIST_ROUTES: Map<TicketCategory, SpecialistRoute> = new Map([
  ["delivery_issue", {
    category: "delivery_issue",
    systemPromptAddendum: `You are specializing in email delivery issues. Focus on:
- Checking delivery logs for specific error codes (4xx temporary, 5xx permanent)
- Analyzing recipient domain patterns (is one ISP rejecting more than others?)
- Checking sending IP reputation and blacklist status
- Reviewing recent volume changes that might trigger throttling
- Examining authentication (SPF/DKIM/DMARC alignment)
Always run diagnostics first to get a full picture.`,
    requiredTools: ["check_delivery_logs", "check_reputation", "run_diagnostics"],
    priority: "high",
  }],
  ["dns_configuration", {
    category: "dns_configuration",
    systemPromptAddendum: `You are specializing in DNS configuration for email. Focus on:
- Verifying SPF record syntax and include mechanisms
- Checking DKIM CNAME records and selector configuration
- Validating DMARC policy and reporting addresses
- Ensuring MX records point to the correct mail servers
- Checking for conflicting or duplicate records
You can update DNS records directly if the fix is clear-cut.`,
    requiredTools: ["check_dns", "check_authentication", "update_dns_record"],
    priority: "medium",
  }],
  ["authentication_failure", {
    category: "authentication_failure",
    systemPromptAddendum: `You are specializing in email authentication failures. Focus on:
- SPF alignment: is the sending IP authorized?
- DKIM signing: is the signature valid and the key published?
- DMARC alignment: do SPF and DKIM domains align with the From domain?
- Check if key rotation is needed (old/weak keys)
Always verify all three protocols together, as they are interdependent.`,
    requiredTools: ["check_authentication", "check_dns", "rotate_dkim_key"],
    priority: "high",
  }],
  ["reputation_problem", {
    category: "reputation_problem",
    systemPromptAddendum: `You are specializing in sender reputation management. Focus on:
- Current reputation scores across major ISPs
- Blacklist status and delisting procedures
- Spam complaint rates and sources
- Bounce rate analysis
- Sending pattern analysis (sudden spikes, inconsistency)
- Recommended warm-up or recovery strategies`,
    requiredTools: ["check_reputation", "check_delivery_logs", "run_diagnostics"],
    priority: "high",
  }],
  ["billing", {
    category: "billing",
    systemPromptAddendum: `This is a billing inquiry. You should:
- Look up the customer's current plan and usage
- Provide factual information about their account
- For refunds, plan changes, or disputes, always escalate to the billing team
- Never make promises about pricing or credits
- Be empathetic but clear about what you can and cannot do`,
    requiredTools: ["check_account_settings", "escalate_to_human"],
    priority: "medium",
  }],
  ["rate_limiting", {
    category: "rate_limiting",
    systemPromptAddendum: `You are specializing in rate limiting issues. Focus on:
- Current sending rates vs. plan limits
- ISP-specific rate limiting (check delivery logs for 4xx codes)
- Sending pattern analysis (burst vs. spread)
- IP warm-up status for new IPs
- Recommendations for optimal sending patterns
You can adjust sending rates if needed.`,
    requiredTools: ["check_account_settings", "check_delivery_logs", "adjust_sending_rate"],
    priority: "medium",
  }],
]);

// ─── Duplicate Detection ───────────────────────────────────────────────────

export interface DuplicateStore {
  /** Check if we've seen a message with this fingerprint recently */
  has(fingerprint: string): Promise<boolean>;
  /** Store a fingerprint with TTL */
  set(fingerprint: string, ttlSeconds: number): Promise<void>;
}

// ─── Unsubscribe Handler ───────────────────────────────────────────────────

export interface UnsubscribeService {
  /** Process an unsubscribe request for a given email address */
  processUnsubscribe(email: string, ticketId?: string): Promise<Result<void>>;
}

// ─── Out-of-Office Handler ─────────────────────────────────────────────────

export interface FollowUpService {
  /** Pause follow-up reminders for a ticket */
  pauseFollowUps(ticketId: string, resumeAt: Date): Promise<void>;
}

// ─── Auto Responder ────────────────────────────────────────────────────────

export class AutoResponder {
  private readonly replyComposer: SupportReplyComposer;
  private readonly duplicateStore: DuplicateStore;
  private readonly unsubscribeService: UnsubscribeService;
  private readonly followUpService: FollowUpService | null;
  private readonly duplicateTtlSeconds: number;

  constructor(deps: {
    replyComposer: SupportReplyComposer;
    duplicateStore: DuplicateStore;
    unsubscribeService: UnsubscribeService;
    followUpService?: FollowUpService;
    /** How long to remember fingerprints for duplicate detection (default: 1 hour) */
    duplicateTtlSeconds?: number;
  }) {
    this.replyComposer = deps.replyComposer;
    this.duplicateStore = deps.duplicateStore;
    this.unsubscribeService = deps.unsubscribeService;
    this.followUpService = deps.followUpService ?? null;
    this.duplicateTtlSeconds = deps.duplicateTtlSeconds ?? 3600;
  }

  /**
   * Send an immediate acknowledgment email for a new ticket.
   * Includes the ticket number and estimated response time based on SLA.
   */
  async sendAcknowledgment(ticket: Ticket): Promise<Result<ComposedEmail>> {
    try {
      const slaPolicy = SLA_POLICIES[ticket.priority];
      const estimatedMinutes = slaPolicy.firstResponseMinutes;
      const timeEstimate = this.formatTimeEstimate(estimatedMinutes);

      const subject = `We've received your request [${ticket.id}]`;

      const priorityLabel = ticket.priority === "critical" ? "critical priority"
        : ticket.priority === "high" ? "high priority"
        : "our queue";

      const textBody = [
        `Thank you for contacting support.`,
        "",
        `We've created ticket [${ticket.id}] for your request:`,
        `"${ticket.subject}"`,
        "",
        `Your ticket has been classified as ${priorityLabel}. Our AI support system is analyzing your issue and you can expect a detailed response within ${timeEstimate}.`,
        "",
        `In many cases, our AI agent can diagnose and resolve issues automatically. If your issue requires specialized attention, we'll route it to the right team.`,
        "",
        `You can reply to this email to add more information to your ticket.`,
        "",
        `Ticket reference: ${ticket.id}`,
        "",
        `— The Emailed Support Team`,
      ].join("\n");

      const htmlBody = this.buildAckHtml(ticket, timeEstimate, priorityLabel);

      const messageId = this.generateMessageId();

      const composedEmail: ComposedEmail = {
        messageId,
        from: { name: "Emailed Support", address: "support@emailed.dev" },
        to: { address: "pending" }, // Will be filled by the pipeline with the actual sender
        subject,
        textBody,
        htmlBody,
        headers: {
          "X-Emailed-Ticket": ticket.id,
          "X-Emailed-Type": "acknowledgment",
          "X-Emailed-Priority": ticket.priority,
        },
      };

      return ok(composedEmail);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Route a ticket to a specialist AI prompt configuration.
   * Returns the specialist route with enhanced system prompt and required tools.
   */
  routeToSpecialist(
    ticket: Ticket,
    category: TicketCategory,
  ): Result<SpecialistRoute> {
    const route = SPECIALIST_ROUTES.get(category);

    if (!route) {
      // Default route for categories without specialist configuration
      return ok({
        category,
        systemPromptAddendum: `Handle this ${category.replace(/_/g, " ")} inquiry using available tools. Gather information before responding.`,
        requiredTools: ["search_knowledge_base"],
        priority: ticket.priority,
      });
    }

    return ok({
      ...route,
      // Override priority if ticket priority is higher
      priority: this.higherPriority(route.priority, ticket.priority),
    });
  }

  /**
   * Detect out-of-office auto-replies.
   * Returns true if the email is an OOO reply (and should not be processed further).
   * If a follow-up service is configured, pauses follow-ups accordingly.
   */
  handleOutOfOffice(email: RawInboundEmail): boolean {
    if (!this.isOutOfOffice(email)) {
      return false;
    }

    // Try to extract return date from the OOO message
    const returnDate = this.extractReturnDate(email.textBody);

    // If we have a follow-up service and can find the ticket, pause follow-ups
    if (this.followUpService && email.inReplyTo) {
      const resumeAt = returnDate ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 7 days
      // Fire and forget - we don't want OOO handling to block
      void this.followUpService.pauseFollowUps(email.inReplyTo, resumeAt);
    }

    return true;
  }

  /**
   * Detect if an inbound email is a duplicate submission.
   * Uses content fingerprinting to identify duplicates within a time window.
   */
  async detectDuplicate(email: RawInboundEmail): Promise<boolean> {
    const fingerprint = this.computeFingerprint(email);

    const isDuplicate = await this.duplicateStore.has(fingerprint);
    if (isDuplicate) {
      return true;
    }

    // Store the fingerprint for future duplicate detection
    await this.duplicateStore.set(fingerprint, this.duplicateTtlSeconds);
    return false;
  }

  /**
   * Handle unsubscribe requests.
   * Detects unsubscribe intent in the email and processes it.
   * Returns true if this was an unsubscribe request.
   */
  handleUnsubscribe(email: RawInboundEmail): boolean {
    if (!this.isUnsubscribeRequest(email)) {
      return false;
    }

    // Extract ticket ID if present for targeted unsubscribe
    const ticketRef = this.extractTicketReference(email.subject + " " + email.textBody);

    // Fire and forget
    void this.unsubscribeService.processUnsubscribe(email.from.address, ticketRef ?? undefined);

    return true;
  }

  // ─── Private: OOO Detection ───────────────────────────────────────────────

  private isOutOfOffice(email: RawInboundEmail): boolean {
    // Check headers first (most reliable)
    const autoSubmitted = email.headers["auto-submitted"]?.toLowerCase();
    if (autoSubmitted === "auto-replied") {
      return true;
    }

    const xAutoResponseSuppress = email.headers["x-auto-response-suppress"];
    if (xAutoResponseSuppress) {
      return true;
    }

    const precedence = email.headers["precedence"]?.toLowerCase();
    if (precedence === "auto_reply" || precedence === "bulk") {
      // Could be OOO or mailing list - check subject too
      const subject = email.subject.toLowerCase();
      if (this.hasOooSubject(subject)) {
        return true;
      }
    }

    // Check subject patterns
    const subject = email.subject.toLowerCase();
    if (this.hasOooSubject(subject)) {
      // Verify with body content to reduce false positives
      const body = email.textBody.toLowerCase();
      return this.hasOooBody(body);
    }

    return false;
  }

  private hasOooSubject(subject: string): boolean {
    const oooPatterns = [
      "out of office",
      "out of the office",
      "away from office",
      "automatic reply",
      "auto-reply",
      "autoreply",
      "auto reply",
      "i am out of",
      "i'm out of",
      "on vacation",
      "on leave",
      "on holiday",
      "ooo:",
      "ooo -",
      "abwesenheit", // German
      "absence", // French
    ];

    return oooPatterns.some((p) => subject.includes(p));
  }

  private hasOooBody(body: string): boolean {
    const bodyPatterns = [
      "out of the office",
      "out of office",
      "limited access to email",
      "not checking email",
      "will return",
      "i will be back",
      "i'll be back",
      "returning on",
      "return to the office",
      "away from",
      "on vacation until",
      "on leave until",
    ];

    return bodyPatterns.some((p) => body.includes(p));
  }

  /**
   * Try to extract a return date from OOO message text.
   */
  private extractReturnDate(body: string): Date | null {
    // Common patterns: "returning on January 15", "back on 2025-01-15", "until 01/15/2025"
    const patterns = [
      /(?:return|back|available)\s+(?:on\s+)?(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
      /(?:until|through)\s+(\w+\s+\d{1,2}(?:,?\s+\d{4})?)/i,
      /(?:return|back|until)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})/i,
      /(?:return|back|until)\s+(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    ];

    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match?.[1]) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
          return parsed;
        }
      }
    }

    return null;
  }

  // ─── Private: Duplicate Detection ─────────────────────────────────────────

  /**
   * Compute a fingerprint for duplicate detection.
   * Based on sender + subject + first N chars of body (normalized).
   */
  private computeFingerprint(email: RawInboundEmail): string {
    const normalized = [
      email.from.address.toLowerCase().trim(),
      email.subject.toLowerCase()
        .replace(/^(re|fwd|fw):\s*/gi, "")
        .replace(/\[TKT-[a-z0-9]+-[a-z0-9]+\]\s*/gi, "")
        .trim(),
      email.textBody.slice(0, 500)
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    ].join("|");

    // Simple hash
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `dup-${Math.abs(hash).toString(36)}`;
  }

  // ─── Private: Unsubscribe Detection ───────────────────────────────────────

  private isUnsubscribeRequest(email: RawInboundEmail): boolean {
    const subject = email.subject.toLowerCase();
    const body = email.textBody.toLowerCase().slice(0, 1000);

    const unsubPatterns = [
      "unsubscribe",
      "stop emailing",
      "stop sending",
      "remove me",
      "remove my email",
      "opt out",
      "opt-out",
      "don't email me",
      "do not email",
      "no more emails",
    ];

    // Subject is a strong signal
    if (unsubPatterns.some((p) => subject.includes(p))) {
      return true;
    }

    // Body alone requires more signals
    const bodyMatchCount = unsubPatterns.filter((p) => body.includes(p)).length;
    return bodyMatchCount >= 2;
  }

  private extractTicketReference(text: string): string | null {
    const match = text.match(/\[?(TKT-[a-z0-9]+-[a-z0-9]+)\]?/i);
    return match ? match[1]! : null;
  }

  // ─── Private: Utilities ───────────────────────────────────────────────────

  private higherPriority(a: TicketPriority, b: TicketPriority): TicketPriority {
    const order: Record<TicketPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a] <= order[b] ? a : b;
  }

  private formatTimeEstimate(minutes: number): string {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  private generateMessageId(): string {
    const random = Math.random().toString(36).slice(2, 14);
    const timestamp = Date.now().toString(36);
    return `<ack-${timestamp}.${random}@emailed.dev>`;
  }

  private buildAckHtml(
    ticket: Ticket,
    timeEstimate: string,
    priorityLabel: string,
  ): string {
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-block;background:#dbeafe;color:#1d4ed8;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:600;">
          Ticket ${this.escapeHtml(ticket.id)}
        </div>
      </div>
      <h2 style="color:#111827;font-size:18px;margin:0 0 16px;">We've received your request</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 12px;">
        Thank you for contacting support. We've created a ticket for your request:
      </p>
      <div style="background:#f8fafc;border-left:4px solid #2563eb;padding:12px 16px;border-radius:0 8px 8px 0;margin:16px 0;">
        <p style="margin:0;color:#374151;font-weight:500;">${this.escapeHtml(ticket.subject)}</p>
      </div>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:16px 0 12px;">
        Your ticket has been classified as <strong>${this.escapeHtml(priorityLabel)}</strong>.
        Our AI support system is analyzing your issue and you can expect a detailed response
        within <strong>${this.escapeHtml(timeEstimate)}</strong>.
      </p>
      <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:16px 0 0;">
        You can reply to this email to add more information to your ticket.
      </p>
    </div>
    <div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px;">
      <p style="margin:0;">Emailed - AI-Native Email Infrastructure</p>
    </div>
  </div>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
