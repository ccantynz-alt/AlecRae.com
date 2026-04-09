/**
 * @emailed/support - Support Reply Composer
 *
 * Composes professional support email replies from AI agent output.
 * Handles brand voice, template selection, proper email headers,
 * multipart formatting, and white-label configurations.
 */

import type {
  AgentResponse,
  Ticket,
  TicketCategory,
  Result,
} from "../types";
import { ok, err } from "../types";
import type { RawInboundEmail } from "./email-intake";

// ─── Composed Email Types ──────────────────────────────────────────────────

export interface ComposedEmail {
  messageId: string;
  from: { name: string; address: string };
  to: { name?: string | undefined; address: string };
  replyTo?: { name: string; address: string } | undefined;
  subject: string;
  textBody: string;
  htmlBody: string;
  headers: Record<string, string>;
}

export interface BrandConfig {
  brandName: string;
  supportEmail: string;
  supportName: string;
  replyToAddress: string;
  websiteUrl: string;
  logoUrl?: string;
  primaryColor: string;
  /** Greeting style: "formal" | "friendly" | "casual" */
  tone: "formal" | "friendly" | "casual";
  /** Custom signature lines */
  signatureLines: string[];
  /** Custom footer text */
  footerText: string;
  /** Unsubscribe URL template ({{ticketId}} replaced) */
  unsubscribeUrlTemplate: string;
  /** Satisfaction survey URL template ({{ticketId}} replaced) */
  surveyUrlTemplate: string;
}

export interface CategoryTemplate {
  category: TicketCategory;
  greeting?: string;
  closingLine?: string;
  additionalResources?: string[];
}

// ─── Default Brand Configuration ───────────────────────────────────────────

const DEFAULT_BRAND: BrandConfig = {
  brandName: "Emailed",
  supportEmail: "support@emailed.dev",
  supportName: "Emailed Support",
  replyToAddress: "support@emailed.dev",
  websiteUrl: "https://emailed.dev",
  primaryColor: "#2563eb",
  tone: "friendly",
  signatureLines: [
    "Best regards,",
    "The Emailed Support Team",
  ],
  footerText: "Emailed - AI-Native Email Infrastructure",
  unsubscribeUrlTemplate: "https://emailed.dev/support/unsubscribe?ticket={{ticketId}}",
  surveyUrlTemplate: "https://emailed.dev/support/feedback?ticket={{ticketId}}",
};

// ─── Category-Specific Templates ───────────────────────────────────────────

const CATEGORY_TEMPLATES: Record<TicketCategory, CategoryTemplate> = {
  delivery_issue: {
    category: "delivery_issue",
    greeting: "We've looked into your delivery issue.",
    closingLine: "If the problem persists after applying these changes, please reply and we'll dig deeper.",
    additionalResources: [
      "Delivery Troubleshooting Guide: https://docs.emailed.dev/guides/delivery",
      "Understanding Bounce Codes: https://docs.emailed.dev/guides/bounce-codes",
    ],
  },
  dns_configuration: {
    category: "dns_configuration",
    greeting: "We've reviewed your DNS configuration.",
    closingLine: "DNS changes may take up to 48 hours to propagate fully. If you still see issues after that, let us know.",
    additionalResources: [
      "DNS Setup Guide: https://docs.emailed.dev/guides/dns-setup",
      "SPF/DKIM/DMARC Reference: https://docs.emailed.dev/guides/authentication",
    ],
  },
  authentication_failure: {
    category: "authentication_failure",
    greeting: "We've investigated the authentication issue you reported.",
    closingLine: "After making changes, you can verify your setup using our diagnostics tool in the dashboard.",
    additionalResources: [
      "Authentication Setup: https://docs.emailed.dev/guides/authentication",
    ],
  },
  reputation_problem: {
    category: "reputation_problem",
    greeting: "We've analyzed your sender reputation.",
    closingLine: "Reputation improvements typically take 1-2 weeks of consistent good sending practices.",
    additionalResources: [
      "Reputation Best Practices: https://docs.emailed.dev/guides/reputation",
      "IP Warm-up Guide: https://docs.emailed.dev/guides/warmup",
    ],
  },
  bounce_issue: {
    category: "bounce_issue",
    greeting: "We've looked into the bounce issues you're experiencing.",
    closingLine: "Maintaining a clean list with low bounce rates is key to good deliverability.",
    additionalResources: [
      "Understanding Bounces: https://docs.emailed.dev/guides/bounces",
    ],
  },
  rate_limiting: {
    category: "rate_limiting",
    greeting: "We've reviewed the rate limiting situation.",
    closingLine: "Gradual volume increases and proper IP warm-up will help avoid future rate limiting.",
    additionalResources: [
      "Rate Limiting Guide: https://docs.emailed.dev/guides/rate-limits",
      "IP Warm-up Guide: https://docs.emailed.dev/guides/warmup",
    ],
  },
  account_access: {
    category: "account_access",
    greeting: "We're here to help with your account access.",
    closingLine: "For security reasons, never share your credentials in email. Use our secure password reset if needed.",
    additionalResources: [
      "Account Security: https://docs.emailed.dev/guides/security",
    ],
  },
  billing: {
    category: "billing",
    greeting: "Thank you for reaching out about your billing question.",
    closingLine: "A member of our billing team will review this and follow up shortly.",
  },
  feature_request: {
    category: "feature_request",
    greeting: "Thank you for your feature suggestion!",
    closingLine: "We value your feedback and use it to shape our roadmap.",
  },
  bug_report: {
    category: "bug_report",
    greeting: "Thank you for reporting this issue.",
    closingLine: "We take all bug reports seriously and will investigate further.",
  },
  general_inquiry: {
    category: "general_inquiry",
    greeting: "Thank you for reaching out.",
    closingLine: "Let us know if you have any other questions.",
    additionalResources: [
      "Documentation: https://docs.emailed.dev",
      "API Reference: https://docs.emailed.dev/api",
    ],
  },
};

// ─── Reply Composer ────────────────────────────────────────────────────────

export class SupportReplyComposer {
  private readonly brand: BrandConfig;
  private readonly categoryOverrides: Map<TicketCategory, CategoryTemplate>;

  constructor(brand?: Partial<BrandConfig>) {
    this.brand = { ...DEFAULT_BRAND, ...brand };
    this.categoryOverrides = new Map();
  }

  /**
   * Register a custom template for a specific ticket category.
   */
  setCategoryTemplate(template: CategoryTemplate): void {
    this.categoryOverrides.set(template.category, template);
  }

  /**
   * Compose a full email reply from the AI agent's response.
   */
  composeReply(
    ticket: Ticket,
    agentResponse: AgentResponse,
    originalEmail: RawInboundEmail,
  ): Result<ComposedEmail> {
    try {
      const template = this.getCategoryTemplate(ticket.category);
      const subject = this.buildSubject(ticket, originalEmail.subject);
      const greeting = this.buildGreeting(originalEmail.from.name, template);
      const body = this.formatAgentResponse(agentResponse.message);
      const closing = this.buildClosing(template, ticket);
      const resources = this.buildResourcesSection(template);
      const surveyLink = this.buildSurveyLink(ticket);
      const signature = this.buildSignature();

      // Build plain text version
      const textParts = [greeting, "", body];
      if (closing) textParts.push("", closing);
      if (resources) textParts.push("", resources);
      if (surveyLink) textParts.push("", surveyLink);
      textParts.push("", signature);
      const textBody = textParts.join("\n");

      // Build HTML version
      const htmlBody = this.buildHtmlEmail({
        greeting,
        body,
        closing,
        resources: template.additionalResources ?? [],
        surveyUrl: this.resolveSurveyUrl(ticket.id),
        ticketId: ticket.id,
      });

      // Build email headers
      const headers = this.buildHeaders(ticket, originalEmail);

      const messageId = this.generateMessageId();

      return ok({
        messageId,
        from: {
          name: this.brand.supportName,
          address: this.brand.supportEmail,
        },
        to: {
          name: originalEmail.from.name,
          address: originalEmail.from.address,
        },
        replyTo: {
          name: this.brand.supportName,
          address: this.brand.replyToAddress,
        },
        subject,
        textBody,
        htmlBody,
        headers,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Compose an escalation notice email informing the customer
   * that their issue has been routed to a specialist.
   */
  composeEscalationNotice(
    ticket: Ticket,
    originalEmail: RawInboundEmail,
    estimatedResponseMinutes: number,
  ): Result<ComposedEmail> {
    try {
      const subject = this.buildSubject(ticket, originalEmail.subject);
      const customerName = originalEmail.from.name ?? "there";
      const timeEstimate = this.formatTimeEstimate(estimatedResponseMinutes);

      const textBody = [
        this.getGreetingPrefix(customerName),
        "",
        `Thank you for contacting ${this.brand.brandName} Support. We've reviewed your message and determined that your issue requires specialized attention.`,
        "",
        `Your ticket [${ticket.id}] has been assigned to our specialist team. You can expect a response within ${timeEstimate}.`,
        "",
        "We take your issue seriously and want to make sure you get the best possible assistance.",
        "",
        "You don't need to do anything right now. We'll follow up with you directly in this email thread.",
        "",
        ...this.brand.signatureLines,
        "",
        this.brand.footerText,
      ].join("\n");

      const htmlBody = this.buildHtmlEmail({
        greeting: this.getGreetingPrefix(customerName),
        body: `<p>Thank you for contacting ${this.brand.brandName} Support. We've reviewed your message and determined that your issue requires specialized attention.</p>
<p>Your ticket <strong>[${ticket.id}]</strong> has been assigned to our specialist team. You can expect a response within <strong>${timeEstimate}</strong>.</p>
<p>We take your issue seriously and want to make sure you get the best possible assistance.</p>
<p>You don't need to do anything right now. We'll follow up with you directly in this email thread.</p>`,
        closing: null,
        resources: [],
        surveyUrl: null,
        ticketId: ticket.id,
      });

      const headers = this.buildHeaders(ticket, originalEmail);
      const messageId = this.generateMessageId();

      return ok({
        messageId,
        from: {
          name: this.brand.supportName,
          address: this.brand.supportEmail,
        },
        to: {
          name: originalEmail.from.name,
          address: originalEmail.from.address,
        },
        replyTo: {
          name: this.brand.supportName,
          address: this.brand.replyToAddress,
        },
        subject,
        textBody,
        htmlBody,
        headers,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Compose a satisfaction survey email.
   */
  composeSurveyEmail(
    ticket: Ticket,
    recipientEmail: string,
    recipientName?: string,
  ): Result<ComposedEmail> {
    try {
      const surveyUrl = this.resolveSurveyUrl(ticket.id);
      const name = recipientName ?? "there";
      const subject = `How did we do? [${ticket.id}]`;

      const textBody = [
        this.getGreetingPrefix(name),
        "",
        `Your support ticket [${ticket.id}] "${ticket.subject}" has been resolved.`,
        "",
        "We'd love to hear about your experience. Your feedback helps us improve.",
        "",
        `Please take a moment to rate your experience: ${surveyUrl}`,
        "",
        "Thank you for being an Emailed customer!",
        "",
        ...this.brand.signatureLines,
      ].join("\n");

      const htmlBody = this.buildHtmlEmail({
        greeting: this.getGreetingPrefix(name),
        body: `<p>Your support ticket <strong>[${ticket.id}]</strong> "${this.escapeHtml(ticket.subject)}" has been resolved.</p>
<p>We'd love to hear about your experience. Your feedback helps us improve.</p>`,
        closing: "Thank you for being an Emailed customer!",
        resources: [],
        surveyUrl,
        ticketId: ticket.id,
      });

      const messageId = this.generateMessageId();

      return ok({
        messageId,
        from: {
          name: this.brand.supportName,
          address: this.brand.supportEmail,
        },
        to: { name: recipientName, address: recipientEmail },
        subject,
        textBody,
        htmlBody,
        headers: {
          "List-Unsubscribe": `<${this.resolveUnsubscribeUrl(ticket.id)}>`,
          "X-Emailed-Ticket": ticket.id,
          "X-Emailed-Type": "survey",
        },
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Private: Subject & Greeting ──────────────────────────────────────────

  private buildSubject(ticket: Ticket, originalSubject: string): string {
    const cleanSubject = originalSubject
      .replace(/^(Re|Fwd|Fw):\s*/gi, "")
      .replace(/\[TKT-[a-z0-9]+-[a-z0-9]+\]\s*/gi, "")
      .trim();

    return `Re: [${ticket.id}] ${cleanSubject || ticket.subject}`;
  }

  private buildGreeting(senderName: string | undefined, template: CategoryTemplate): string {
    const name = senderName ?? "there";
    const prefix = this.getGreetingPrefix(name);

    if (template.greeting) {
      return `${prefix}\n\n${template.greeting}`;
    }

    return prefix;
  }

  private getGreetingPrefix(name: string): string {
    switch (this.brand.tone) {
      case "formal":
        return `Dear ${name},`;
      case "casual":
        return `Hey ${name}!`;
      case "friendly":
      default:
        return `Hi ${name},`;
    }
  }

  // ─── Private: Body Formatting ─────────────────────────────────────────────

  private formatAgentResponse(message: string): string {
    // The AI response is already well-formatted text.
    // Just ensure consistent line breaks and trim.
    return message
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  private buildClosing(
    template: CategoryTemplate,
    ticket: Ticket,
  ): string | null {
    return template.closingLine ?? null;
  }

  private buildResourcesSection(template: CategoryTemplate): string | null {
    const resources = template.additionalResources;
    if (!resources || resources.length === 0) return null;

    const lines = ["Helpful resources:", ...resources.map((r) => `  - ${r}`)];
    return lines.join("\n");
  }

  private buildSurveyLink(ticket: Ticket): string | null {
    const url = this.resolveSurveyUrl(ticket.id);
    return `Was this helpful? Let us know: ${url}`;
  }

  private buildSignature(): string {
    return [...this.brand.signatureLines, "", this.brand.footerText].join("\n");
  }

  // ─── Private: HTML Rendering ──────────────────────────────────────────────

  private buildHtmlEmail(params: {
    greeting: string;
    body: string;
    closing: string | null;
    resources: string[];
    surveyUrl: string | null;
    ticketId: string;
  }): string {
    const { greeting, body, closing, resources, surveyUrl, ticketId } = params;

    // Convert plain text body to HTML paragraphs if it doesn't contain HTML tags
    const htmlBody = body.includes("<p>") ? body : this.textToHtml(body);

    const resourcesHtml = resources.length > 0
      ? `<div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:8px;">
          <p style="margin:0 0 8px;font-weight:600;color:#374151;">Helpful Resources</p>
          <ul style="margin:0;padding:0 0 0 20px;color:#6b7280;">
            ${resources.map((r) => {
              const match = r.match(/^(.+?):\s*(https?:\/\/.+)$/);
              if (match) {
                return `<li><a href="${this.escapeHtml(match[2]!)}" style="color:${this.brand.primaryColor};">${this.escapeHtml(match[1]!)}</a></li>`;
              }
              return `<li>${this.escapeHtml(r)}</li>`;
            }).join("\n            ")}
          </ul>
        </div>`
      : "";

    const surveyHtml = surveyUrl
      ? `<div style="margin-top:24px;text-align:center;">
          <p style="color:#6b7280;margin:0 0 12px;">Was this helpful?</p>
          <a href="${this.escapeHtml(surveyUrl)}" style="display:inline-block;padding:10px 24px;background:${this.brand.primaryColor};color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;">Share Feedback</a>
        </div>`
      : "";

    const unsubscribeUrl = this.resolveUnsubscribeUrl(ticketId);

    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
      <p style="color:#374151;font-size:15px;line-height:1.6;">${this.escapeHtml(greeting)}</p>
      <div style="color:#374151;font-size:15px;line-height:1.6;">${htmlBody}</div>
      ${closing ? `<p style="color:#374151;font-size:15px;line-height:1.6;margin-top:16px;">${this.escapeHtml(closing)}</p>` : ""}
      ${resourcesHtml}
      ${surveyHtml}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p style="color:#6b7280;font-size:13px;margin:0;">${this.brand.signatureLines.map((l) => this.escapeHtml(l)).join("<br>")}</p>
      </div>
    </div>
    <div style="text-align:center;padding:16px;color:#9ca3af;font-size:12px;">
      <p style="margin:0 0 4px;">${this.escapeHtml(this.brand.footerText)}</p>
      <p style="margin:0;">Ticket: ${this.escapeHtml(ticketId)} | <a href="${this.escapeHtml(unsubscribeUrl)}" style="color:#9ca3af;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;
  }

  private textToHtml(text: string): string {
    return text
      .split("\n\n")
      .map((paragraph) => {
        const escapedParagraph = this.escapeHtml(paragraph.trim());
        if (!escapedParagraph) return "";

        // Detect lists (lines starting with - or *)
        if (escapedParagraph.includes("\n")) {
          const lines = escapedParagraph.split("\n");
          const isList = lines.every((l) => l.startsWith("- ") || l.startsWith("* ") || l.trim() === "");
          if (isList) {
            const items = lines
              .filter((l) => l.startsWith("- ") || l.startsWith("* "))
              .map((l) => `<li>${l.slice(2)}</li>`);
            return `<ul style="color:#374151;padding-left:20px;">${items.join("")}</ul>`;
          }
        }

        return `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${escapedParagraph.replace(/\n/g, "<br>")}</p>`;
      })
      .filter(Boolean)
      .join("\n");
  }

  // ─── Private: Headers ─────────────────────────────────────────────────────

  private buildHeaders(
    ticket: Ticket,
    originalEmail: RawInboundEmail,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Emailed-Ticket": ticket.id,
      "X-Emailed-Category": ticket.category,
      "X-Emailed-Priority": ticket.priority,
      "X-Emailed-Type": "support-reply",
      "List-Unsubscribe": `<${this.resolveUnsubscribeUrl(ticket.id)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };

    // Thread the reply properly
    if (originalEmail.messageId) {
      headers["In-Reply-To"] = originalEmail.messageId;

      const references = [
        ...(originalEmail.references ?? []),
        originalEmail.messageId,
      ];
      headers["References"] = references.join(" ");
    }

    return headers;
  }

  // ─── Private: Utilities ───────────────────────────────────────────────────

  private getCategoryTemplate(category: TicketCategory): CategoryTemplate {
    return this.categoryOverrides.get(category) ?? CATEGORY_TEMPLATES[category];
  }

  private generateMessageId(): string {
    const random = Math.random().toString(36).slice(2, 14);
    const timestamp = Date.now().toString(36);
    return `<${timestamp}.${random}@emailed.dev>`;
  }

  private resolveSurveyUrl(ticketId: string): string {
    return this.brand.surveyUrlTemplate.replace("{{ticketId}}", ticketId);
  }

  private resolveUnsubscribeUrl(ticketId: string): string {
    return this.brand.unsubscribeUrlTemplate.replace("{{ticketId}}", ticketId);
  }

  private formatTimeEstimate(minutes: number): string {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
}
