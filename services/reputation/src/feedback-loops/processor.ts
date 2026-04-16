/**
 * @alecrae/reputation — ISP Feedback Loop Processor
 *
 * Processes ARF (Abuse Reporting Format, RFC 5965) complaint messages
 * received from ISP feedback loops. When a recipient marks an email as
 * spam, the ISP sends an ARF report back to us. This processor:
 *
 *  1. Parses ARF messages into structured complaint records
 *  2. Tracks complaint rates per domain and IP
 *  3. Automatically adds complained addresses to suppression lists
 *  4. Notifies senders about complaints
 *  5. Manages FBL subscription state per ISP
 *
 * All major ISPs support feedback loops (Gmail via Postmaster Tools,
 * Yahoo via CFL, Microsoft via SNDS/JMRP, AOL via direct FBL).
 */

import type {
  ArfComplaint,
  ArfFeedbackType,
  FblSubscription,
  IspProvider,
  SuppressionEntry,
  SuppressionReason,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum complaint rate before triggering automatic suspension review */
const CRITICAL_COMPLAINT_RATE = 0.005; // 0.5%

/** Warning complaint rate threshold */
const WARNING_COMPLAINT_RATE = 0.001; // 0.1%

/** Retention period for complaint records (days) */
const COMPLAINT_RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// Processor Events
// ---------------------------------------------------------------------------

export interface ComplaintNotification {
  complaintId: string;
  senderDomain: string;
  senderAddress: string;
  recipientAddress: string;
  feedbackType: ArfFeedbackType;
  sourceIp: string;
  timestamp: Date;
}

export interface ComplaintRateReport {
  domain: string;
  ipAddress?: string;
  totalSent: number;
  totalComplaints: number;
  complaintRate: number;
  status: 'healthy' | 'warning' | 'critical';
  period: string;
}

// ---------------------------------------------------------------------------
// Processor Configuration
// ---------------------------------------------------------------------------

export interface FeedbackLoopProcessorConfig {
  /** Override critical complaint rate threshold */
  criticalComplaintRate?: number;
  /** Override warning complaint rate threshold */
  warningComplaintRate?: number;
  /** Automatically suppress complained addresses */
  autoSuppress?: boolean;
  /** Retention period for complaint records in days */
  retentionDays?: number;
}

// ---------------------------------------------------------------------------
// Feedback Loop Processor
// ---------------------------------------------------------------------------

/**
 * Processes ISP feedback loop (FBL) messages in ARF format.
 *
 * Maintains complaint records, suppression lists, and FBL subscription
 * state. Tracks per-domain and per-IP complaint rates for reputation
 * monitoring.
 */
export class FeedbackLoopProcessor {
  private readonly config: Required<FeedbackLoopProcessorConfig>;

  /** All processed complaints, keyed by complaint ID */
  private readonly complaints = new Map<string, ArfComplaint>();

  /** Suppression list: email -> SuppressionEntry */
  private readonly suppressions = new Map<string, SuppressionEntry>();

  /** FBL subscriptions keyed by subscription ID */
  private readonly subscriptions = new Map<string, FblSubscription>();

  /** Complaint counts per domain (for rate calculation) */
  private readonly domainComplaintCounts = new Map<string, number>();

  /** Complaint counts per IP (for rate calculation) */
  private readonly ipComplaintCounts = new Map<string, number>();

  /** Sent counts per domain (set externally for rate calculation) */
  private readonly domainSentCounts = new Map<string, number>();

  /** Pending notifications for consumers to drain */
  private readonly pendingNotifications: ComplaintNotification[] = [];

  constructor(config: FeedbackLoopProcessorConfig = {}) {
    this.config = {
      criticalComplaintRate: config.criticalComplaintRate ?? CRITICAL_COMPLAINT_RATE,
      warningComplaintRate: config.warningComplaintRate ?? WARNING_COMPLAINT_RATE,
      autoSuppress: config.autoSuppress ?? true,
      retentionDays: config.retentionDays ?? COMPLAINT_RETENTION_DAYS,
    };
  }

  /**
   * Parse and process a raw ARF message.
   *
   * Extracts complaint details from the ARF format, records the complaint,
   * optionally suppresses the recipient, and queues a notification.
   */
  processArfMessage(rawMessage: string): Result<ArfComplaint> {
    const parseResult = this.parseArfMessage(rawMessage);
    if (!parseResult.ok) {
      return parseResult;
    }

    const complaint = parseResult.value;

    // Store the complaint
    this.complaints.set(complaint.id, complaint);

    // Update complaint counts
    this.incrementCount(this.domainComplaintCounts, complaint.reportedDomain);
    this.incrementCount(this.ipComplaintCounts, complaint.sourceIp);

    // Auto-suppress the complained address
    if (this.config.autoSuppress) {
      this.addSuppression(
        complaint.originalRcptTo,
        'complaint',
        `ARF complaint ${complaint.id}`,
        complaint.reportedDomain,
      );
    }

    // Queue notification for the sender
    this.pendingNotifications.push({
      complaintId: complaint.id,
      senderDomain: complaint.reportedDomain,
      senderAddress: complaint.originalMailFrom,
      recipientAddress: complaint.originalRcptTo,
      feedbackType: complaint.feedbackType,
      sourceIp: complaint.sourceIp,
      timestamp: complaint.processedAt,
    });

    return ok(complaint);
  }

  /**
   * Parse a raw ARF (RFC 5965) message into a structured complaint.
   *
   * An ARF message is a multipart/report with three parts:
   *  1. Human-readable description
   *  2. Machine-readable feedback report (key: value pairs)
   *  3. Original message (headers or full message)
   */
  parseArfMessage(rawMessage: string): Result<ArfComplaint> {
    try {
      // Extract the feedback report section
      const feedbackSection = this.extractFeedbackReport(rawMessage);
      if (!feedbackSection) {
        return err(new Error('Could not find feedback-report section in ARF message'));
      }

      const fields = this.parseKeyValueSection(feedbackSection);

      const feedbackType = this.parseFeedbackType(fields.get('Feedback-Type') ?? 'abuse');
      const userAgent = fields.get('User-Agent') ?? 'unknown';
      const version = fields.get('Version') ?? '1';
      const originalMailFrom = fields.get('Original-Mail-From') ?? '';
      const originalRcptTo = fields.get('Original-Rcpt-To') ?? '';
      const reportedDomain = fields.get('Reported-Domain') ?? this.extractDomain(originalMailFrom);
      const reportedUri = fields.get('Reported-URI');
      const arrivalDateStr = fields.get('Arrival-Date');
      const sourceIp = fields.get('Source-IP') ?? '';
      const authResults = fields.get('Authentication-Results');
      const reportingMta = fields.get('Reporting-MTA');

      const arrivalDate = arrivalDateStr ? new Date(arrivalDateStr) : new Date();

      // Extract original headers from third MIME part
      const originalHeaders = this.extractOriginalHeaders(rawMessage);

      const complaint: ArfComplaint = {
        id: `arf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        feedbackType,
        userAgent,
        version,
        originalMailFrom,
        originalRcptTo,
        reportedDomain,
        ...(reportedUri !== undefined ? { reportedUri } : {}),
        arrivalDate,
        sourceIp,
        ...(authResults !== undefined ? { authenticationResults: authResults } : {}),
        ...(reportingMta !== undefined ? { reportingMta } : {}),
        originalHeaders,
        rawMessage,
        processedAt: new Date(),
      };

      return ok(complaint);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown ARF parse error';
      return err(new Error(`Failed to parse ARF message: ${message}`));
    }
  }

  /**
   * Register or update an FBL subscription for an ISP.
   */
  registerSubscription(subscription: FblSubscription): Result<FblSubscription> {
    if (!subscription.id) {
      return err(new Error('Subscription must have an ID'));
    }

    this.subscriptions.set(subscription.id, { ...subscription });
    return ok(subscription);
  }

  /**
   * Update the status of an FBL subscription.
   */
  updateSubscriptionStatus(
    subscriptionId: string,
    status: FblSubscription['status'],
  ): Result<FblSubscription> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return err(new Error(`Subscription "${subscriptionId}" not found`));
    }

    sub.status = status;
    return ok(sub);
  }

  /**
   * Add a domain or IP to an existing FBL subscription.
   */
  addToSubscription(
    subscriptionId: string,
    type: 'domain' | 'ip',
    value: string,
  ): Result<FblSubscription> {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return err(new Error(`Subscription "${subscriptionId}" not found`));
    }

    if (type === 'domain') {
      if (!sub.enrolledDomains.includes(value)) {
        sub.enrolledDomains.push(value);
      }
    } else {
      if (!sub.enrolledIps.includes(value)) {
        sub.enrolledIps.push(value);
      }
    }

    return ok(sub);
  }

  /**
   * Record the number of emails sent for a domain (needed for rate calculation).
   */
  recordSentCount(domain: string, count: number): void {
    const existing = this.domainSentCounts.get(domain) ?? 0;
    this.domainSentCounts.set(domain, existing + count);
  }

  /**
   * Get complaint rate report for a domain.
   */
  getComplaintRate(domain: string): Result<ComplaintRateReport> {
    const totalComplaints = this.domainComplaintCounts.get(domain) ?? 0;
    const totalSent = this.domainSentCounts.get(domain) ?? 0;

    if (totalSent === 0) {
      return ok({
        domain,
        totalSent: 0,
        totalComplaints,
        complaintRate: 0,
        status: 'healthy',
        period: 'all-time',
      });
    }

    const complaintRate = totalComplaints / totalSent;
    let status: ComplaintRateReport['status'];

    if (complaintRate >= this.config.criticalComplaintRate) {
      status = 'critical';
    } else if (complaintRate >= this.config.warningComplaintRate) {
      status = 'warning';
    } else {
      status = 'healthy';
    }

    return ok({
      domain,
      totalSent,
      totalComplaints,
      complaintRate,
      status,
      period: 'all-time',
    });
  }

  /**
   * Get complaint rate report for an IP address.
   */
  getIpComplaintCount(ipAddress: string): number {
    return this.ipComplaintCounts.get(ipAddress) ?? 0;
  }

  /**
   * Add an address to the suppression list.
   */
  addSuppression(
    email: string,
    reason: SuppressionReason,
    source: string,
    domain: string,
    expiresAt?: Date,
  ): SuppressionEntry {
    const entry: SuppressionEntry = {
      email: email.toLowerCase(),
      reason,
      source,
      domain,
      createdAt: new Date(),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
    };

    this.suppressions.set(email.toLowerCase(), entry);
    return entry;
  }

  /**
   * Check if an address is suppressed.
   */
  isSuppressed(email: string): boolean {
    const entry = this.suppressions.get(email.toLowerCase());
    if (!entry) return false;

    // Check if the suppression has expired
    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      this.suppressions.delete(email.toLowerCase());
      return false;
    }

    return true;
  }

  /**
   * Remove an address from the suppression list.
   */
  removeSuppression(email: string): boolean {
    return this.suppressions.delete(email.toLowerCase());
  }

  /**
   * Get all suppression entries for a domain.
   */
  getSuppressions(domain?: string): SuppressionEntry[] {
    const entries = [...this.suppressions.values()];
    if (domain) {
      return entries.filter((e) => e.domain === domain);
    }
    return entries;
  }

  /**
   * Drain pending complaint notifications. Returns and clears the queue.
   */
  drainNotifications(): ComplaintNotification[] {
    const pending = [...this.pendingNotifications];
    this.pendingNotifications.length = 0;
    return pending;
  }

  /**
   * Get all FBL subscriptions, optionally filtered by provider.
   */
  getSubscriptions(provider?: IspProvider): FblSubscription[] {
    const subs = [...this.subscriptions.values()];
    if (provider) {
      return subs.filter((s) => s.provider === provider);
    }
    return subs;
  }

  /**
   * Get a specific complaint by ID.
   */
  getComplaint(id: string): ArfComplaint | undefined {
    return this.complaints.get(id);
  }

  /**
   * Prune old complaints beyond the retention period.
   */
  pruneOldComplaints(): number {
    const cutoff = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    let pruned = 0;

    for (const [id, complaint] of this.complaints) {
      if (complaint.processedAt.getTime() < cutoff) {
        this.complaints.delete(id);
        pruned++;
      }
    }

    return pruned;
  }

  // ─── Internal ───

  /**
   * Extract the feedback-report section from a multipart ARF message.
   * Looks for a MIME part with Content-Type: message/feedback-report.
   */
  private extractFeedbackReport(rawMessage: string): string | null {
    // Find boundary from Content-Type header
    const boundaryMatch = rawMessage.match(/boundary="?([^"\s;]+)"?/i);
    if (!boundaryMatch) {
      // Try parsing as a simple key-value report (non-MIME)
      if (rawMessage.includes('Feedback-Type:')) {
        return rawMessage;
      }
      return null;
    }

    const boundary = boundaryMatch[1];
    if (!boundary) return null;

    const parts = rawMessage.split(`--${boundary}`);

    for (const part of parts) {
      if (part.toLowerCase().includes('message/feedback-report')) {
        // Find the start of the body after the headers
        const headerEnd = part.indexOf('\n\n');
        if (headerEnd !== -1) {
          return part.slice(headerEnd + 2).trim();
        }
      }
    }

    return null;
  }

  /**
   * Parse a key-value section (like the feedback report body).
   * Each line is "Key: Value".
   */
  private parseKeyValueSection(section: string): Map<string, string> {
    const fields = new Map<string, string>();
    const lines = section.split('\n');

    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim();
        if (key.length > 0) {
          fields.set(key, value);
        }
      }
    }

    return fields;
  }

  /**
   * Extract original message headers from the third MIME part of an ARF message.
   */
  private extractOriginalHeaders(rawMessage: string): Map<string, string> {
    const headers = new Map<string, string>();

    const boundaryMatch = rawMessage.match(/boundary="?([^"\s;]+)"?/i);
    if (!boundaryMatch) return headers;

    const boundary = boundaryMatch[1];
    if (!boundary) return headers;

    const parts = rawMessage.split(`--${boundary}`);

    // The third part (index 3 in split output, accounting for preamble) is the original message
    for (const part of parts) {
      if (
        part.toLowerCase().includes('message/rfc822') ||
        part.toLowerCase().includes('text/rfc822-headers')
      ) {
        const headerEnd = part.indexOf('\n\n');
        if (headerEnd !== -1) {
          const headerSection = part.slice(headerEnd + 2).trim();
          const headerLines = headerSection.split('\n');

          for (const line of headerLines) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
              const key = line.slice(0, colonIndex).trim();
              const value = line.slice(colonIndex + 1).trim();
              if (key.length > 0) {
                headers.set(key, value);
              }
            }
          }
        }
        break;
      }
    }

    return headers;
  }

  /** Parse a feedback type string into the typed enum */
  private parseFeedbackType(value: string): ArfFeedbackType {
    const normalized = value.toLowerCase().trim();
    const validTypes: ArfFeedbackType[] = ['abuse', 'fraud', 'virus', 'other', 'not-spam'];

    for (const t of validTypes) {
      if (normalized === t) return t;
    }

    return 'abuse';
  }

  /** Extract domain from an email address */
  private extractDomain(email: string): string {
    const atIndex = email.lastIndexOf('@');
    if (atIndex === -1) return '';
    return email.slice(atIndex + 1).toLowerCase();
  }

  /** Increment a count in a string->number map */
  private incrementCount(map: Map<string, number>, key: string): void {
    map.set(key, (map.get(key) ?? 0) + 1);
  }
}
