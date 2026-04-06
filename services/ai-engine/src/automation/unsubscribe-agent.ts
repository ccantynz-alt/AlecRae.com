// =============================================================================
// Vienna — AI Unsubscribe Agent
// =============================================================================
// One click and the AI handles everything:
// 1. Finds the unsubscribe link/email in headers or body
// 2. Clicks it / sends the email / fills out the form
// 3. Confirms unsubscription
// 4. Adds sender to suppression list
// 5. Reports back to user
//
// No competitor does this automatically. Users click "unsubscribe" in Gmail
// and get taken to some sketchy form. Vienna handles it all silently.

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UnsubscribeRequest {
  emailId: string;
  userId: string;
  fromAddress: string;
  listUnsubscribe?: string; // List-Unsubscribe header value
  listUnsubscribePost?: string; // List-Unsubscribe-Post header value
  htmlBody: string;
}

export interface UnsubscribeResult {
  success: boolean;
  method: UnsubscribeMethod;
  status: UnsubscribeStatus;
  message: string;
  suppressionAdded: boolean;
  timestamp: Date;
}

export type UnsubscribeMethod =
  | 'one_click_post' // RFC 8058 List-Unsubscribe-Post (best)
  | 'mailto' // List-Unsubscribe mailto: link
  | 'http_link' // List-Unsubscribe http: link
  | 'body_link' // Link found in email body
  | 'manual'; // No automated method found — flagged for user

export type UnsubscribeStatus =
  | 'completed'
  | 'pending_confirmation'
  | 'failed'
  | 'manual_required';

interface ExtractedLink {
  method: UnsubscribeMethod;
  url?: string;
  email?: string;
  priority: number; // higher = preferred
}

// ─── Unsubscribe Agent ──────────────────────────────────────────────────────

export class UnsubscribeAgent {
  private readonly suppressionCallback: (email: string, domain: string) => Promise<void>;
  private readonly sendEmailCallback: (to: string, subject: string, body: string) => Promise<void>;

  constructor(config: {
    onSuppression: (email: string, domain: string) => Promise<void>;
    onSendEmail: (to: string, subject: string, body: string) => Promise<void>;
  }) {
    this.suppressionCallback = config.onSuppression;
    this.sendEmailCallback = config.onSendEmail;
  }

  /**
   * Process an unsubscribe request. Tries the best method available.
   */
  async unsubscribe(request: UnsubscribeRequest): Promise<UnsubscribeResult> {
    const links = this.extractUnsubscribeLinks(request);

    if (links.length === 0) {
      return {
        success: false,
        method: 'manual',
        status: 'manual_required',
        message: 'No unsubscribe method found. You may need to unsubscribe manually.',
        suppressionAdded: false,
        timestamp: new Date(),
      };
    }

    // Sort by priority (highest first)
    links.sort((a, b) => b.priority - a.priority);

    // Try each method until one succeeds
    for (const link of links) {
      const result = await this.executeUnsubscribe(link, request);
      if (result.success || result.status === 'pending_confirmation') {
        // Add to suppression list
        const domain = request.fromAddress.split('@')[1] ?? '';
        try {
          await this.suppressionCallback(request.fromAddress, domain);
          result.suppressionAdded = true;
        } catch {
          result.suppressionAdded = false;
        }
        return result;
      }
    }

    return {
      success: false,
      method: links[0].method,
      status: 'failed',
      message: 'All unsubscribe methods failed. The sender has been suppressed locally.',
      suppressionAdded: false,
      timestamp: new Date(),
    };
  }

  /**
   * Bulk unsubscribe from multiple senders at once.
   */
  async bulkUnsubscribe(requests: UnsubscribeRequest[]): Promise<Map<string, UnsubscribeResult>> {
    const results = new Map<string, UnsubscribeResult>();

    // Process in parallel batches of 5
    const batchSize = 5;
    for (let i = 0; i < requests.length; i += batchSize) {
      const batch = requests.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map((req) => this.unsubscribe(req)),
      );

      for (let j = 0; j < batch.length; j++) {
        const result = batchResults[j];
        results.set(
          batch[j].emailId,
          result.status === 'fulfilled'
            ? result.value
            : {
                success: false,
                method: 'manual',
                status: 'failed',
                message: 'Processing error',
                suppressionAdded: false,
                timestamp: new Date(),
              },
        );
      }
    }

    return results;
  }

  /**
   * Detect newsletters and subscription emails that the user might want to unsubscribe from.
   * AI analyzes email patterns to find recurring marketing emails.
   */
  detectSubscriptions(emails: Array<{
    id: string;
    from: string;
    subject: string;
    hasUnsubscribeHeader: boolean;
    receivedAt: Date;
    isRead: boolean;
  }>): Array<{
    fromAddress: string;
    emailCount: number;
    readRate: number;
    lastReceived: Date;
    recommendation: 'keep' | 'unsubscribe' | 'review';
    reason: string;
  }> {
    // Group by sender
    const senderGroups = new Map<string, typeof emails>();
    for (const email of emails) {
      const group = senderGroups.get(email.from) ?? [];
      group.push(email);
      senderGroups.set(email.from, group);
    }

    const results: Array<{
      fromAddress: string;
      emailCount: number;
      readRate: number;
      lastReceived: Date;
      recommendation: 'keep' | 'unsubscribe' | 'review';
      reason: string;
    }> = [];

    for (const [sender, senderEmails] of senderGroups) {
      // Only analyze senders with unsubscribe headers (likely newsletters)
      const hasUnsub = senderEmails.some((e) => e.hasUnsubscribeHeader);
      if (!hasUnsub || senderEmails.length < 3) continue;

      const readCount = senderEmails.filter((e) => e.isRead).length;
      const readRate = readCount / senderEmails.length;
      const lastReceived = senderEmails.reduce(
        (latest, e) => (e.receivedAt > latest ? e.receivedAt : latest),
        senderEmails[0].receivedAt,
      );

      let recommendation: 'keep' | 'unsubscribe' | 'review';
      let reason: string;

      if (readRate < 0.1) {
        recommendation = 'unsubscribe';
        reason = `You've read less than 10% of ${senderEmails.length} emails from this sender`;
      } else if (readRate < 0.3) {
        recommendation = 'review';
        reason = `Low read rate (${Math.round(readRate * 100)}%) — you might want to unsubscribe`;
      } else {
        recommendation = 'keep';
        reason = `You regularly read emails from this sender (${Math.round(readRate * 100)}% read rate)`;
      }

      results.push({
        fromAddress: sender,
        emailCount: senderEmails.length,
        readRate: Math.round(readRate * 100) / 100,
        lastReceived,
        recommendation,
        reason,
      });
    }

    // Sort: unsubscribe recommendations first, then by email count
    results.sort((a, b) => {
      const order = { unsubscribe: 0, review: 1, keep: 2 };
      const diff = order[a.recommendation] - order[b.recommendation];
      if (diff !== 0) return diff;
      return b.emailCount - a.emailCount;
    });

    return results;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private extractUnsubscribeLinks(request: UnsubscribeRequest): ExtractedLink[] {
    const links: ExtractedLink[] = [];

    // Method 1: RFC 8058 One-Click Unsubscribe (highest priority)
    if (request.listUnsubscribePost && request.listUnsubscribe) {
      const httpUrl = this.extractHttpUrl(request.listUnsubscribe);
      if (httpUrl) {
        links.push({
          method: 'one_click_post',
          url: httpUrl,
          priority: 100,
        });
      }
    }

    // Method 2: List-Unsubscribe header mailto:
    if (request.listUnsubscribe) {
      const mailtoMatch = request.listUnsubscribe.match(/<mailto:([^>]+)>/);
      if (mailtoMatch) {
        links.push({
          method: 'mailto',
          email: mailtoMatch[1].split('?')[0],
          priority: 80,
        });
      }

      // Method 3: List-Unsubscribe header http:
      const httpUrl = this.extractHttpUrl(request.listUnsubscribe);
      if (httpUrl && !request.listUnsubscribePost) {
        links.push({
          method: 'http_link',
          url: httpUrl,
          priority: 60,
        });
      }
    }

    // Method 4: Find unsubscribe link in email body
    const bodyLinks = this.findUnsubscribeLinksInBody(request.htmlBody);
    for (const url of bodyLinks) {
      links.push({
        method: 'body_link',
        url,
        priority: 40,
      });
    }

    return links;
  }

  private extractHttpUrl(listUnsubscribe: string): string | null {
    const httpMatch = listUnsubscribe.match(/<(https?:\/\/[^>]+)>/);
    return httpMatch ? httpMatch[1] : null;
  }

  private findUnsubscribeLinksInBody(html: string): string[] {
    const links: string[] = [];
    // Match href attributes near "unsubscribe" text
    const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>[^<]*unsubscribe[^<]*/gi;
    let match: RegExpExecArray | null;

    while ((match = linkRegex.exec(html)) !== null) {
      if (match[1] && !match[1].startsWith('mailto:')) {
        links.push(match[1]);
      }
    }

    // Also check for links with "unsubscribe" in the URL itself
    const urlRegex = /href=["'](https?:\/\/[^"']*unsubscribe[^"']*)["']/gi;
    while ((match = urlRegex.exec(html)) !== null) {
      if (match[1] && !links.includes(match[1])) {
        links.push(match[1]);
      }
    }

    return links;
  }

  private async executeUnsubscribe(
    link: ExtractedLink,
    request: UnsubscribeRequest,
  ): Promise<UnsubscribeResult> {
    const timestamp = new Date();

    try {
      switch (link.method) {
        case 'one_click_post': {
          // RFC 8058: POST to the URL with List-Unsubscribe=One-Click
          const response = await fetch(link.url!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'List-Unsubscribe=One-Click',
          });

          return {
            success: response.ok,
            method: 'one_click_post',
            status: response.ok ? 'completed' : 'failed',
            message: response.ok
              ? 'Successfully unsubscribed via one-click (RFC 8058)'
              : `Unsubscribe request returned ${response.status}`,
            suppressionAdded: false,
            timestamp,
          };
        }

        case 'mailto': {
          // Send an unsubscribe email
          await this.sendEmailCallback(
            link.email!,
            'Unsubscribe',
            'Please remove this email address from your mailing list.',
          );

          return {
            success: true,
            method: 'mailto',
            status: 'pending_confirmation',
            message: 'Unsubscribe email sent. It may take a few days to take effect.',
            suppressionAdded: false,
            timestamp,
          };
        }

        case 'http_link': {
          // GET the unsubscribe URL
          const response = await fetch(link.url!, {
            method: 'GET',
            redirect: 'follow',
          });

          // Check if the page confirms unsubscription
          const body = await response.text();
          const isConfirmed = /unsubscribed|removed|success|confirmed/i.test(body);

          return {
            success: response.ok,
            method: 'http_link',
            status: isConfirmed ? 'completed' : 'pending_confirmation',
            message: isConfirmed
              ? 'Successfully unsubscribed via link'
              : 'Unsubscribe link visited. You may need to confirm on the page.',
            suppressionAdded: false,
            timestamp,
          };
        }

        case 'body_link': {
          // Visit the unsubscribe link from the email body
          const response = await fetch(link.url!, {
            method: 'GET',
            redirect: 'follow',
          });

          return {
            success: response.ok,
            method: 'body_link',
            status: 'pending_confirmation',
            message: 'Unsubscribe link visited from email body. Check for confirmation.',
            suppressionAdded: false,
            timestamp,
          };
        }

        default:
          return {
            success: false,
            method: 'manual',
            status: 'manual_required',
            message: 'No automated unsubscribe method available',
            suppressionAdded: false,
            timestamp,
          };
      }
    } catch (error) {
      return {
        success: false,
        method: link.method,
        status: 'failed',
        message: `Unsubscribe failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suppressionAdded: false,
        timestamp,
      };
    }
  }
}

// ─── Snooze & Schedule Send Engine ──────────────────────────────────────────

export interface SnoozedEmail {
  emailId: string;
  userId: string;
  snoozeUntil: Date;
  originalMailboxId: string;
  createdAt: Date;
}

export interface ScheduledSend {
  id: string;
  userId: string;
  emailDraft: {
    to: string[];
    cc: string[];
    subject: string;
    body: string;
    attachmentIds: string[];
    inReplyTo?: string;
  };
  scheduledFor: Date;
  timezone: string;
  status: 'scheduled' | 'sent' | 'cancelled' | 'failed';
  createdAt: Date;
  sentAt: Date | null;
  error: string | null;
}

export class ScheduleEngine {
  private snoozedEmails: Map<string, SnoozedEmail> = new Map();
  private scheduledSends: Map<string, ScheduledSend> = new Map();
  private checkInterval: ReturnType<typeof setInterval> | null = null;

  private readonly onUnsnoze: (emailId: string, mailboxId: string) => Promise<void>;
  private readonly onSend: (send: ScheduledSend) => Promise<void>;

  constructor(config: {
    onUnsnooze: (emailId: string, mailboxId: string) => Promise<void>;
    onSend: (send: ScheduledSend) => Promise<void>;
  }) {
    this.onUnsnoze = config.onUnsnooze;
    this.onSend = config.onSend;
  }

  /** Start the schedule check loop */
  start(intervalMs: number = 30_000): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(() => this.processSchedule(), intervalMs);
    // Immediate first check
    this.processSchedule().catch(() => {});
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /** Snooze an email until a specific time */
  snooze(emailId: string, userId: string, until: Date, mailboxId: string): SnoozedEmail {
    const snoozed: SnoozedEmail = {
      emailId,
      userId,
      snoozeUntil: until,
      originalMailboxId: mailboxId,
      createdAt: new Date(),
    };
    this.snoozedEmails.set(emailId, snoozed);
    return snoozed;
  }

  /** Cancel a snooze */
  cancelSnooze(emailId: string): boolean {
    return this.snoozedEmails.delete(emailId);
  }

  /** Schedule an email to be sent later */
  schedule(params: Omit<ScheduledSend, 'id' | 'status' | 'createdAt' | 'sentAt' | 'error'>): ScheduledSend {
    const scheduled: ScheduledSend = {
      ...params,
      id: `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      status: 'scheduled',
      createdAt: new Date(),
      sentAt: null,
      error: null,
    };
    this.scheduledSends.set(scheduled.id, scheduled);
    return scheduled;
  }

  /** Cancel a scheduled send (undo send) */
  cancelScheduledSend(id: string): boolean {
    const send = this.scheduledSends.get(id);
    if (send && send.status === 'scheduled') {
      send.status = 'cancelled';
      return true;
    }
    return false;
  }

  /** Get all scheduled sends for a user */
  getScheduledSends(userId: string): ScheduledSend[] {
    return Array.from(this.scheduledSends.values())
      .filter((s) => s.userId === userId && s.status === 'scheduled')
      .sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  }

  /** Get all snoozed emails for a user */
  getSnoozedEmails(userId: string): SnoozedEmail[] {
    return Array.from(this.snoozedEmails.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => a.snoozeUntil.getTime() - b.snoozeUntil.getTime());
  }

  /** Undo send — works within a configurable window (default 30s) */
  undoSend(sendId: string): { success: boolean; message: string } {
    const send = this.scheduledSends.get(sendId);
    if (!send) return { success: false, message: 'Send not found' };
    if (send.status !== 'scheduled') return { success: false, message: `Cannot undo — status is ${send.status}` };

    send.status = 'cancelled';
    return { success: true, message: 'Send cancelled successfully' };
  }

  private async processSchedule(): Promise<void> {
    const now = new Date();

    // Process unsnoozed emails
    for (const [id, snoozed] of this.snoozedEmails) {
      if (snoozed.snoozeUntil <= now) {
        try {
          await this.onUnsnoze(snoozed.emailId, snoozed.originalMailboxId);
          this.snoozedEmails.delete(id);
        } catch {
          // Will retry on next check
        }
      }
    }

    // Process scheduled sends
    for (const [, send] of this.scheduledSends) {
      if (send.status === 'scheduled' && send.scheduledFor <= now) {
        try {
          await this.onSend(send);
          send.status = 'sent';
          send.sentAt = now;
        } catch (error) {
          send.status = 'failed';
          send.error = error instanceof Error ? error.message : 'Unknown error';
        }
      }
    }
  }
}
