import type {
  ArfComplaint,
  ArfFeedbackType,
  FblSubscription,
  SuppressionEntry,
  SuppressionReason,
  IspProvider,
} from '../types';

// ─── Result Pattern ──────────────────────────────────────────────────────────

type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Complaint Rate Tracker ──────────────────────────────────────────────────

interface ComplaintRateEntry {
  domain: string;
  ipAddress: string;
  totalComplaints: number;
  totalDelivered: number;
  rate: number;
  windowStart: Date;
  windowEnd: Date;
}

// ─── Feedback Loop Processor ─────────────────────────────────────────────────

export class FeedbackLoopProcessor {
  private readonly subscriptions: Map<string, FblSubscription> = new Map();
  private readonly suppressionList: Map<string, SuppressionEntry> = new Map();
  private readonly complaints: ArfComplaint[] = [];
  private readonly complaintCounts: Map<string, { complaints: number; delivered: number }> = new Map();
  private readonly maxComplaintsRetained: number;

  constructor(maxComplaintsRetained = 100_000) {
    this.maxComplaintsRetained = maxComplaintsRetained;
  }

  // ─── ARF Complaint Parsing ──────────────────────────────────────────────────

  /** Parse a raw ARF (RFC 5965) message into a structured complaint */
  parseArfMessage(rawMessage: string): Result<ArfComplaint> {
    if (!rawMessage || rawMessage.trim().length === 0) {
      return err('Cannot parse empty ARF message');
    }

    // ARF messages are multipart/report with 3 MIME parts:
    // 1. Human-readable description
    // 2. machine-readable report (message/feedback-report)
    // 3. Original message (message/rfc822) or headers (text/rfc822-headers)

    const feedbackReport = this.extractFeedbackReport(rawMessage);
    if (!feedbackReport.ok) {
      return err(`Failed to extract feedback report: ${feedbackReport.error}`);
    }

    const fields = feedbackReport.value;

    const feedbackType = this.parseFeedbackType(fields.get('Feedback-Type') ?? 'abuse');
    const userAgent = fields.get('User-Agent') ?? 'unknown';
    const version = fields.get('Version') ?? '1';
    const originalMailFrom = fields.get('Original-Mail-From') ?? '';
    const originalRcptTo = fields.get('Original-Rcpt-To') ?? '';
    const reportedDomain = fields.get('Reported-Domain') ?? this.extractDomain(originalMailFrom);
    const reportedUri = fields.get('Reported-URI') ?? undefined;
    const arrivalDateStr = fields.get('Arrival-Date') ?? '';
    const sourceIp = fields.get('Source-IP') ?? '';
    const authResults = fields.get('Authentication-Results') ?? undefined;
    const reportingMta = fields.get('Reporting-MTA') ?? undefined;

    const arrivalDate = arrivalDateStr
      ? new Date(arrivalDateStr)
      : new Date();

    if (isNaN(arrivalDate.getTime())) {
      return err(`Invalid Arrival-Date in ARF message: ${arrivalDateStr}`);
    }

    const originalHeaders = this.extractOriginalHeaders(rawMessage);
    const id = this.generateComplaintId(sourceIp, originalRcptTo, arrivalDate);

    const complaint: ArfComplaint = {
      id,
      feedbackType,
      userAgent,
      version,
      originalMailFrom,
      originalRcptTo,
      reportedDomain,
      reportedUri,
      arrivalDate,
      sourceIp,
      authenticationResults: authResults,
      reportingMta,
      originalHeaders,
      rawMessage,
      processedAt: new Date(),
    };

    return ok(complaint);
  }

  /** Process a parsed ARF complaint: store it, update rates, auto-suppress */
  processComplaint(complaint: ArfComplaint): Result<{
    suppressed: boolean;
    suppressionEntry?: SuppressionEntry;
    complaintRate: number;
  }> {
    // Store the complaint
    this.complaints.push(complaint);
    this.trimComplaints();

    // Update complaint counts for the domain+IP combo
    const rateKey = `${complaint.reportedDomain}:${complaint.sourceIp}`;
    const counts = this.complaintCounts.get(rateKey) ?? { complaints: 0, delivered: 0 };
    counts.complaints += 1;
    this.complaintCounts.set(rateKey, counts);

    const currentRate = counts.delivered > 0
      ? counts.complaints / counts.delivered
      : 0;

    // Auto-suppress the complainant's email
    let suppressionEntry: SuppressionEntry | undefined;
    let suppressed = false;

    if (complaint.originalRcptTo && complaint.feedbackType !== 'not-spam') {
      const addResult = this.addToSuppressionList({
        email: complaint.originalRcptTo,
        reason: 'complaint',
        source: `fbl:${complaint.userAgent}`,
        domain: complaint.reportedDomain,
        createdAt: new Date(),
      });

      if (addResult.ok) {
        suppressionEntry = addResult.value;
        suppressed = true;
      }
    }

    // If feedback is "not-spam", remove from suppression
    if (complaint.feedbackType === 'not-spam' && complaint.originalRcptTo) {
      this.removeFromSuppressionList(complaint.originalRcptTo, complaint.reportedDomain);
    }

    return ok({ suppressed, suppressionEntry, complaintRate: currentRate });
  }

  /** Batch process raw ARF messages */
  processBatch(rawMessages: string[]): Result<{
    processed: number;
    failed: number;
    errors: Array<{ index: number; error: string }>;
  }> {
    let processed = 0;
    let failed = 0;
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < rawMessages.length; i++) {
      const raw = rawMessages[i];
      if (raw === undefined) continue;

      const parseResult = this.parseArfMessage(raw);
      if (!parseResult.ok) {
        failed++;
        errors.push({ index: i, error: parseResult.error });
        continue;
      }

      const processResult = this.processComplaint(parseResult.value);
      if (!processResult.ok) {
        failed++;
        errors.push({ index: i, error: processResult.error });
        continue;
      }

      processed++;
    }

    return ok({ processed, failed, errors });
  }

  // ─── Suppression List Management ───────────────────────────────────────────

  /** Add an email to the suppression list */
  addToSuppressionList(
    entry: Omit<SuppressionEntry, 'createdAt'> & { createdAt?: Date },
  ): Result<SuppressionEntry> {
    const email = entry.email.toLowerCase().trim();
    if (!email || !email.includes('@')) {
      return err(`Invalid email address for suppression: ${entry.email}`);
    }

    const key = this.suppressionKey(email, entry.domain);
    const existing = this.suppressionList.get(key);

    // Don't overwrite a more severe suppression reason
    if (existing && this.severityRank(existing.reason) >= this.severityRank(entry.reason)) {
      return ok(existing);
    }

    const fullEntry: SuppressionEntry = {
      email,
      reason: entry.reason,
      source: entry.source,
      domain: entry.domain,
      createdAt: entry.createdAt ?? new Date(),
      expiresAt: entry.expiresAt,
    };

    this.suppressionList.set(key, fullEntry);
    return ok(fullEntry);
  }

  /** Remove an email from the suppression list for a domain */
  removeFromSuppressionList(email: string, domain: string): Result<boolean> {
    const key = this.suppressionKey(email.toLowerCase().trim(), domain);
    const existed = this.suppressionList.has(key);
    this.suppressionList.delete(key);
    return ok(existed);
  }

  /** Check if an email is suppressed for a domain */
  isSuppressed(email: string, domain: string): boolean {
    const key = this.suppressionKey(email.toLowerCase().trim(), domain);
    const entry = this.suppressionList.get(key);

    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
      this.suppressionList.delete(key);
      return false;
    }

    return true;
  }

  /** Get all suppressed emails for a domain */
  getSuppressionListForDomain(domain: string): SuppressionEntry[] {
    const entries: SuppressionEntry[] = [];
    for (const entry of this.suppressionList.values()) {
      if (entry.domain === domain) {
        // Prune expired
        if (entry.expiresAt && entry.expiresAt.getTime() < Date.now()) {
          continue;
        }
        entries.push(entry);
      }
    }
    return entries;
  }

  /** Get the full suppression list size */
  getSuppressionListSize(): number {
    return this.suppressionList.size;
  }

  /** Purge expired entries from the suppression list */
  purgeExpiredSuppressions(): number {
    const now = Date.now();
    let purged = 0;
    for (const [key, entry] of this.suppressionList) {
      if (entry.expiresAt && entry.expiresAt.getTime() < now) {
        this.suppressionList.delete(key);
        purged++;
      }
    }
    return purged;
  }

  // ─── Complaint Rate Tracking ───────────────────────────────────────────────

  /** Record delivered email count for rate calculation */
  recordDelivered(domain: string, ipAddress: string, count: number): void {
    const rateKey = `${domain}:${ipAddress}`;
    const counts = this.complaintCounts.get(rateKey) ?? { complaints: 0, delivered: 0 };
    counts.delivered += count;
    this.complaintCounts.set(rateKey, counts);
  }

  /** Get the current complaint rate for a domain+IP */
  getComplaintRate(domain: string, ipAddress: string): Result<ComplaintRateEntry> {
    const rateKey = `${domain}:${ipAddress}`;
    const counts = this.complaintCounts.get(rateKey);

    if (!counts) {
      return err(`No complaint data found for ${domain} on ${ipAddress}`);
    }

    const rate = counts.delivered > 0 ? counts.complaints / counts.delivered : 0;

    return ok({
      domain,
      ipAddress,
      totalComplaints: counts.complaints,
      totalDelivered: counts.delivered,
      rate,
      windowStart: new Date(0), // Tracks from the beginning — windowed tracking is a future enhancement
      windowEnd: new Date(),
    });
  }

  /** Get complaint rates for all tracked domain+IP combinations */
  getAllComplaintRates(): ComplaintRateEntry[] {
    const entries: ComplaintRateEntry[] = [];
    for (const [key, counts] of this.complaintCounts) {
      const parts = key.split(':');
      const domain = parts[0] ?? '';
      const ipAddress = parts.slice(1).join(':'); // Handle IPv6

      const rate = counts.delivered > 0 ? counts.complaints / counts.delivered : 0;

      entries.push({
        domain,
        ipAddress,
        totalComplaints: counts.complaints,
        totalDelivered: counts.delivered,
        rate,
        windowStart: new Date(0),
        windowEnd: new Date(),
      });
    }
    return entries;
  }

  /** Reset complaint counts (e.g., for a new tracking window) */
  resetComplaintCounts(domain?: string, ipAddress?: string): void {
    if (domain && ipAddress) {
      this.complaintCounts.delete(`${domain}:${ipAddress}`);
    } else if (domain) {
      for (const key of this.complaintCounts.keys()) {
        if (key.startsWith(`${domain}:`)) {
          this.complaintCounts.delete(key);
        }
      }
    } else {
      this.complaintCounts.clear();
    }
  }

  // ─── FBL Subscription Management ──────────────────────────────────────────

  /** Register an FBL subscription with an ISP */
  registerSubscription(subscription: FblSubscription): Result<FblSubscription> {
    if (!subscription.id || subscription.id.trim().length === 0) {
      return err('Subscription ID is required');
    }

    if (subscription.enrolledDomains.length === 0 && subscription.enrolledIps.length === 0) {
      return err('At least one domain or IP must be enrolled');
    }

    this.subscriptions.set(subscription.id, subscription);
    return ok(subscription);
  }

  /** Update an existing FBL subscription */
  updateSubscription(
    id: string,
    updates: Partial<Pick<FblSubscription, 'enrolledDomains' | 'enrolledIps' | 'status' | 'feedbackAddress'>>,
  ): Result<FblSubscription> {
    const existing = this.subscriptions.get(id);
    if (!existing) {
      return err(`FBL subscription '${id}' not found`);
    }

    if (updates.enrolledDomains !== undefined) {
      existing.enrolledDomains = updates.enrolledDomains;
    }
    if (updates.enrolledIps !== undefined) {
      existing.enrolledIps = updates.enrolledIps;
    }
    if (updates.status !== undefined) {
      existing.status = updates.status;
    }
    if (updates.feedbackAddress !== undefined) {
      existing.feedbackAddress = updates.feedbackAddress;
    }

    return ok(existing);
  }

  /** Remove an FBL subscription */
  removeSubscription(id: string): Result<boolean> {
    const existed = this.subscriptions.has(id);
    this.subscriptions.delete(id);
    return ok(existed);
  }

  /** Get all active subscriptions */
  getActiveSubscriptions(): FblSubscription[] {
    const results: FblSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.status === 'active') {
        results.push(sub);
      }
    }
    return results;
  }

  /** Get subscriptions for a specific provider */
  getSubscriptionsForProvider(provider: IspProvider): FblSubscription[] {
    const results: FblSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.provider === provider) {
        results.push(sub);
      }
    }
    return results;
  }

  /** Mark a subscription as having received feedback */
  markFeedbackReceived(id: string): Result<FblSubscription> {
    const sub = this.subscriptions.get(id);
    if (!sub) {
      return err(`FBL subscription '${id}' not found`);
    }
    sub.lastReceivedAt = new Date();
    return ok(sub);
  }

  /** Get recent complaints (optionally filtered) */
  getRecentComplaints(options?: {
    domain?: string;
    ipAddress?: string;
    feedbackType?: ArfFeedbackType;
    limit?: number;
  }): ArfComplaint[] {
    let results = this.complaints;

    if (options?.domain) {
      results = results.filter(c => c.reportedDomain === options.domain);
    }
    if (options?.ipAddress) {
      results = results.filter(c => c.sourceIp === options.ipAddress);
    }
    if (options?.feedbackType) {
      results = results.filter(c => c.feedbackType === options.feedbackType);
    }

    const limit = options?.limit ?? 100;
    return results.slice(-limit);
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private extractFeedbackReport(raw: string): Result<Map<string, string>> {
    const fields = new Map<string, string>();

    // Look for the feedback-report section between boundaries
    // The feedback report section contains key: value pairs
    const lines = raw.split(/\r?\n/);
    let inFeedbackSection = false;
    let foundFeedbackSection = false;

    for (const line of lines) {
      // Detect if we're entering the feedback-report content type section
      if (line.toLowerCase().includes('content-type: message/feedback-report') ||
          line.toLowerCase().includes('content-type:message/feedback-report')) {
        inFeedbackSection = true;
        foundFeedbackSection = true;
        continue;
      }

      // If we hit a MIME boundary after finding the feedback section, stop
      if (inFeedbackSection && line.startsWith('--') && fields.size > 0) {
        break;
      }

      if (inFeedbackSection) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key.length > 0 && value.length > 0) {
            fields.set(key, value);
          }
        }
      }
    }

    // Fallback: if no feedback-report section found, try to parse the whole thing
    // as key-value pairs (some ISPs send simplified formats)
    if (!foundFeedbackSection) {
      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key.length > 0 && value.length > 0 && !fields.has(key)) {
            fields.set(key, value);
          }
        }
      }
    }

    if (fields.size === 0) {
      return err('No parseable fields found in ARF message');
    }

    return ok(fields);
  }

  private extractOriginalHeaders(raw: string): Map<string, string> {
    const headers = new Map<string, string>();
    const lines = raw.split(/\r?\n/);
    let inOriginalSection = false;

    for (const line of lines) {
      if (line.toLowerCase().includes('content-type: message/rfc822') ||
          line.toLowerCase().includes('content-type: text/rfc822-headers')) {
        inOriginalSection = true;
        continue;
      }

      if (inOriginalSection && line.startsWith('--')) {
        break;
      }

      if (inOriginalSection) {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key.length > 0 && value.length > 0) {
            headers.set(key, value);
          }
        }
      }
    }

    return headers;
  }

  private parseFeedbackType(value: string): ArfFeedbackType {
    const normalized = value.toLowerCase().trim();
    const validTypes: ArfFeedbackType[] = ['abuse', 'fraud', 'virus', 'other', 'not-spam'];
    const found = validTypes.find(t => t === normalized);
    return found ?? 'abuse';
  }

  private extractDomain(email: string): string {
    const atIndex = email.lastIndexOf('@');
    if (atIndex < 0) return '';
    return email.substring(atIndex + 1).toLowerCase().trim();
  }

  private suppressionKey(email: string, domain: string): string {
    return `${email}:${domain}`;
  }

  private severityRank(reason: SuppressionReason): number {
    const ranks: Record<SuppressionReason, number> = {
      spam_trap: 5,
      complaint: 4,
      bounce: 3,
      manual: 2,
      unsubscribe: 1,
    };
    return ranks[reason];
  }

  private generateComplaintId(sourceIp: string, rcptTo: string, date: Date): string {
    const timestamp = date.getTime().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const ipHash = simpleHash(sourceIp);
    const rcptHash = simpleHash(rcptTo);
    return `arf-${timestamp}-${ipHash}-${rcptHash}-${random}`;
  }

  private trimComplaints(): void {
    while (this.complaints.length > this.maxComplaintsRetained) {
      this.complaints.shift();
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36).substring(0, 6);
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createFeedbackLoopProcessor(
  maxComplaintsRetained?: number,
): FeedbackLoopProcessor {
  return new FeedbackLoopProcessor(maxComplaintsRetained);
}
