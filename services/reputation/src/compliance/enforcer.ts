import type {
  ComplianceFramework,
  ComplianceCheckResult,
  ComplianceViolation,
  ConsentRecord,
  EmailMetadata,
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

// ─── Compliance Configuration ────────────────────────────────────────────────

interface ComplianceConfig {
  /** Enable/disable individual frameworks */
  enabledFrameworks: Set<ComplianceFramework>;
  /** Domains that are exempt from marketing checks (e.g., purely transactional senders) */
  transactionalDomains: Set<string>;
  /** Maximum days of implicit consent validity (CASL default: 730 = 2 years) */
  implicitConsentMaxDays: number;
  /** Whether to enforce strict GDPR mode (requires explicit consent for everything) */
  strictGdpr: boolean;
}

const DEFAULT_CONFIG: ComplianceConfig = {
  enabledFrameworks: new Set(['can-spam', 'gdpr', 'casl']),
  transactionalDomains: new Set(),
  implicitConsentMaxDays: 730,
  strictGdpr: false,
};

// ─── Compliance Enforcer ─────────────────────────────────────────────────────

export class ComplianceEnforcer {
  private readonly config: ComplianceConfig;
  private readonly consentStore: Map<string, ConsentRecord> = new Map();
  private readonly erasureLog: Map<string, { erasedAt: Date; requestedBy: string }> = new Map();

  constructor(config?: Partial<ComplianceConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      enabledFrameworks: config?.enabledFrameworks ?? new Set(DEFAULT_CONFIG.enabledFrameworks),
      transactionalDomains: config?.transactionalDomains ?? new Set(DEFAULT_CONFIG.transactionalDomains),
    };
  }

  // ─── Pre-Send Compliance Checking ──────────────────────────────────────────

  /** Run all enabled compliance checks on an email before sending */
  checkCompliance(email: EmailMetadata): Result<ComplianceCheckResult[]> {
    const results: ComplianceCheckResult[] = [];

    if (this.config.enabledFrameworks.has('can-spam')) {
      results.push(this.checkCanSpam(email));
    }

    if (this.config.enabledFrameworks.has('gdpr')) {
      results.push(this.checkGdpr(email));
    }

    if (this.config.enabledFrameworks.has('casl')) {
      results.push(this.checkCasl(email));
    }

    return ok(results);
  }

  /** Check if an email passes ALL enabled compliance frameworks */
  isFullyCompliant(email: EmailMetadata): Result<{
    compliant: boolean;
    failures: ComplianceCheckResult[];
  }> {
    const checkResult = this.checkCompliance(email);
    if (!checkResult.ok) {
      return err(checkResult.error);
    }

    const failures = checkResult.value.filter(r => !r.compliant);
    return ok({
      compliant: failures.length === 0,
      failures,
    });
  }

  // ─── CAN-SPAM Checks (15 U.S.C. 7701-7713) ──────────────────────────────

  checkCanSpam(email: EmailMetadata): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Rule 1: No deceptive subject lines
    if (this.hasDeceptiveSubject(email.subject)) {
      violations.push({
        rule: 'CAN-SPAM §5(a)(2)',
        description: 'Subject line may be deceptive or misleading',
        severity: 'warning',
        field: 'subject',
        recommendation: 'Ensure the subject line accurately reflects the content of the email',
      });
    }

    // Rule 2: Must identify as an advertisement (for marketing emails)
    if (email.contentType === 'marketing') {
      // We check for the header or a pattern in the subject; exact mechanism is flexible under CAN-SPAM
      const adIdentifier = email.headers.get('X-Advertisement') ?? email.headers.get('X-Campaign-Type');
      if (!adIdentifier) {
        warnings.push(
          'Marketing email should be identifiable as an advertisement. ' +
          'Consider adding an X-Advertisement or X-Campaign-Type header.',
        );
      }
    }

    // Rule 3: From address must be valid and not spoofed
    if (!this.isValidFromAddress(email.from)) {
      violations.push({
        rule: 'CAN-SPAM §5(a)(1)',
        description: 'From address is invalid or potentially deceptive',
        severity: 'critical',
        field: 'from',
        recommendation: 'Use a valid, non-deceptive From address that identifies the sender',
      });
    }

    // Rule 4: Must include physical postal address
    if (!email.hasPhysicalAddress && email.contentType === 'marketing') {
      violations.push({
        rule: 'CAN-SPAM §5(a)(5)(A)(iii)',
        description: 'Marketing email must include a valid physical postal address',
        severity: 'critical',
        field: 'body',
        recommendation: 'Include a valid physical postal address in the email body or footer',
      });
    }

    // Rule 5: Must include opt-out mechanism for marketing
    if (email.contentType === 'marketing') {
      if (!email.hasUnsubscribeLink && !email.hasUnsubscribeHeader) {
        violations.push({
          rule: 'CAN-SPAM §5(a)(5)(A)(ii)',
          description: 'Marketing email must include a clear opt-out/unsubscribe mechanism',
          severity: 'critical',
          field: 'headers',
          recommendation: 'Add a List-Unsubscribe header and a visible unsubscribe link in the email body',
        });
      }
    }

    // Rule 6: List-Unsubscribe-Post header (RFC 8058) for one-click unsubscribe
    if (email.contentType === 'marketing') {
      this.checkUnsubscribeHeaders(email, violations, warnings);
    }

    return {
      framework: 'can-spam',
      compliant: violations.filter(v => v.severity === 'critical').length === 0,
      violations,
      warnings,
      checkedAt: new Date(),
    };
  }

  // ─── GDPR Checks (EU Regulation 2016/679) ────────────────────────────────

  checkGdpr(email: EmailMetadata): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Check consent for marketing emails
    if (email.contentType === 'marketing') {
      const consentResult = this.getConsent(email.to, email.senderDomain);

      if (!consentResult) {
        violations.push({
          rule: 'GDPR Article 6(1)(a)',
          description: 'No consent record found for recipient. Marketing email requires explicit consent.',
          severity: 'critical',
          field: 'to',
          recommendation: 'Obtain and record explicit consent before sending marketing emails to EU recipients',
        });
      } else if (consentResult.withdrawnAt) {
        violations.push({
          rule: 'GDPR Article 7(3)',
          description: 'Recipient has withdrawn consent. Sending is prohibited.',
          severity: 'critical',
          field: 'to',
          recommendation: 'Remove this recipient from marketing lists — consent has been withdrawn',
        });
      } else if (this.config.strictGdpr && consentResult.consentType !== 'explicit') {
        violations.push({
          rule: 'GDPR Article 6(1)(a) [strict mode]',
          description: 'Only explicit consent is accepted in strict GDPR mode. Implicit consent is insufficient.',
          severity: 'critical',
          field: 'to',
          recommendation: 'Upgrade consent to explicit by sending a re-confirmation email',
        });
      }

      // Check for erasure requests
      if (this.hasErasureRequest(email.to)) {
        violations.push({
          rule: 'GDPR Article 17',
          description: 'Recipient has exercised right to erasure. All communication must cease.',
          severity: 'critical',
          field: 'to',
          recommendation: 'Delete all data for this recipient and cease all communications',
        });
      }
    }

    // Transactional emails need legitimate interest basis
    if (email.contentType === 'transactional') {
      if (this.hasErasureRequest(email.to)) {
        warnings.push(
          'Recipient has requested data erasure. Transactional emails may still be sent for ' +
          'legal obligations, but review whether this communication is strictly necessary.',
        );
      }
    }

    // Must provide easy opt-out
    if (email.contentType === 'marketing' && !email.hasUnsubscribeHeader) {
      violations.push({
        rule: 'GDPR Article 7(3)',
        description: 'Must provide easy mechanism to withdraw consent (List-Unsubscribe header)',
        severity: 'critical',
        field: 'headers',
        recommendation: 'Add List-Unsubscribe and List-Unsubscribe-Post headers',
      });
    }

    // Data minimization check — warn about unnecessary headers
    const sensitiveHeaders = ['X-User-Location', 'X-Device-Info', 'X-Browser-Fingerprint'];
    for (const header of sensitiveHeaders) {
      if (email.headers.has(header)) {
        warnings.push(
          `Header '${header}' may contain personal data. Review for GDPR data minimization (Article 5(1)(c)).`,
        );
      }
    }

    return {
      framework: 'gdpr',
      compliant: violations.filter(v => v.severity === 'critical').length === 0,
      violations,
      warnings,
      checkedAt: new Date(),
    };
  }

  // ─── CASL Checks (Canada's Anti-Spam Legislation, S.C. 2010, c. 23) ──────

  checkCasl(email: EmailMetadata): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    if (email.contentType === 'marketing') {
      // CASL Section 6(1): Must have consent
      const consent = this.getConsent(email.to, email.senderDomain);

      if (!consent) {
        violations.push({
          rule: 'CASL §6(1)',
          description: 'No consent record found. CASL requires express or implied consent for commercial electronic messages.',
          severity: 'critical',
          field: 'to',
          recommendation: 'Obtain consent before sending commercial messages to Canadian recipients',
        });
      } else if (consent.withdrawnAt) {
        violations.push({
          rule: 'CASL §11(1)',
          description: 'Recipient has unsubscribed. Further messages are prohibited.',
          severity: 'critical',
          field: 'to',
          recommendation: 'Process the unsubscribe within 10 business days as required by CASL',
        });
      } else if (consent.consentType === 'implicit') {
        // Implied consent has a time limit under CASL
        const daysSinceConsent = this.daysBetween(consent.consentDate, new Date());
        if (daysSinceConsent > this.config.implicitConsentMaxDays) {
          violations.push({
            rule: 'CASL §10(2)',
            description: `Implied consent has expired (${daysSinceConsent} days old, max ${this.config.implicitConsentMaxDays}).`,
            severity: 'critical',
            field: 'to',
            recommendation: 'Obtain express consent or re-establish the business relationship',
          });
        } else if (daysSinceConsent > this.config.implicitConsentMaxDays * 0.8) {
          warnings.push(
            `Implied consent is nearing expiration (${daysSinceConsent} of ${this.config.implicitConsentMaxDays} days). ` +
            'Consider converting to express consent.',
          );
        }
      }

      // CASL Section 6(2): Must include sender identification
      if (!this.isValidFromAddress(email.from)) {
        violations.push({
          rule: 'CASL §6(2)(a)',
          description: 'From address does not clearly identify the sender',
          severity: 'critical',
          field: 'from',
          recommendation: 'Use a from address that clearly identifies the person/organization sending the message',
        });
      }

      // CASL Section 6(2)(b): Must include contact information
      if (!email.hasPhysicalAddress) {
        violations.push({
          rule: 'CASL §6(2)(b)',
          description: 'Commercial email must include sender mailing address and contact information',
          severity: 'critical',
          field: 'body',
          recommendation: 'Include the sender\'s mailing address, phone number or web address, and email address',
        });
      }

      // CASL Section 6(2)(c): Must include unsubscribe mechanism
      if (!email.hasUnsubscribeLink && !email.hasUnsubscribeHeader) {
        violations.push({
          rule: 'CASL §6(2)(c)',
          description: 'Commercial email must include a functioning unsubscribe mechanism',
          severity: 'critical',
          field: 'headers',
          recommendation: 'Add a clear, easy-to-use unsubscribe mechanism that works for at least 60 days',
        });
      }
    }

    return {
      framework: 'casl',
      compliant: violations.filter(v => v.severity === 'critical').length === 0,
      violations,
      warnings,
      checkedAt: new Date(),
    };
  }

  // ─── Unsubscribe Header Verification (RFC 8058) ──────────────────────────

  /** Verify that List-Unsubscribe and List-Unsubscribe-Post headers are correctly formed */
  verifyUnsubscribeHeaders(email: EmailMetadata): Result<{
    hasListUnsubscribe: boolean;
    hasListUnsubscribePost: boolean;
    isRfc8058Compliant: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    const listUnsub = email.headers.get('List-Unsubscribe');
    const listUnsubPost = email.headers.get('List-Unsubscribe-Post');

    const hasListUnsubscribe = !!listUnsub;
    const hasListUnsubscribePost = !!listUnsubPost;

    if (!hasListUnsubscribe) {
      issues.push('Missing List-Unsubscribe header');
    } else {
      // List-Unsubscribe should contain at least one mailto: or https: URI
      const hasMailto = listUnsub.includes('mailto:');
      const hasHttps = listUnsub.includes('https:');

      if (!hasMailto && !hasHttps) {
        issues.push('List-Unsubscribe header must contain at least one mailto: or https: URI');
      }

      if (hasHttps && !listUnsub.includes('https://')) {
        issues.push('List-Unsubscribe https URI must use HTTPS (not HTTP)');
      }

      // RFC 8058 requires angle brackets around URIs
      if (!listUnsub.includes('<')) {
        issues.push('List-Unsubscribe URIs should be enclosed in angle brackets per RFC 2369');
      }
    }

    if (!hasListUnsubscribePost) {
      issues.push('Missing List-Unsubscribe-Post header (required for one-click unsubscribe per RFC 8058)');
    } else {
      // Must contain "List-Unsubscribe=One-Click"
      if (!listUnsubPost.includes('List-Unsubscribe=One-Click')) {
        issues.push('List-Unsubscribe-Post header must contain "List-Unsubscribe=One-Click"');
      }
    }

    const isRfc8058Compliant = hasListUnsubscribe && hasListUnsubscribePost && issues.length === 0;

    return ok({
      hasListUnsubscribe,
      hasListUnsubscribePost,
      isRfc8058Compliant,
      issues,
    });
  }

  // ─── Physical Address Checking ─────────────────────────────────────────────

  /** Check if an email contains a physical address indicator */
  verifyPhysicalAddress(email: EmailMetadata): Result<{
    present: boolean;
    recommendation: string;
  }> {
    if (email.hasPhysicalAddress) {
      return ok({
        present: true,
        recommendation: 'Physical address is present. Ensure it remains up to date.',
      });
    }

    const isTransactional = email.contentType === 'transactional' ||
      this.config.transactionalDomains.has(email.senderDomain);

    if (isTransactional) {
      return ok({
        present: false,
        recommendation: 'Transactional email — physical address is recommended but not required by CAN-SPAM.',
      });
    }

    return ok({
      present: false,
      recommendation: 'Marketing email must include a valid physical postal address per CAN-SPAM and CASL.',
    });
  }

  // ─── Consent Record Management ─────────────────────────────────────────────

  /** Store a consent record */
  recordConsent(record: ConsentRecord): Result<ConsentRecord> {
    if (!record.email || !record.email.includes('@')) {
      return err(`Invalid email address: ${record.email}`);
    }
    if (!record.domain || record.domain.trim().length === 0) {
      return err('Domain is required for consent record');
    }

    // Check if there's an erasure request — cannot re-consent after erasure without new interaction
    if (this.hasErasureRequest(record.email)) {
      return err(
        `Cannot record consent for ${record.email} — a right-to-erasure request is active. ` +
        'The erasure must be processed first.',
      );
    }

    const key = this.consentKey(record.email, record.domain);
    this.consentStore.set(key, record);
    return ok(record);
  }

  /** Withdraw consent (unsubscribe) */
  withdrawConsent(email: string, domain: string): Result<ConsentRecord> {
    const key = this.consentKey(email, domain);
    const existing = this.consentStore.get(key);

    if (!existing) {
      return err(`No consent record found for ${email} on ${domain}`);
    }

    if (existing.withdrawnAt) {
      return ok(existing); // Already withdrawn
    }

    existing.withdrawnAt = new Date();
    return ok(existing);
  }

  /** Get consent record for an email+domain */
  getConsent(email: string, domain: string): ConsentRecord | undefined {
    const key = this.consentKey(email.toLowerCase().trim(), domain);
    return this.consentStore.get(key);
  }

  /** Check if valid (non-withdrawn, non-expired) consent exists */
  hasValidConsent(email: string, domain: string): boolean {
    const consent = this.getConsent(email, domain);
    if (!consent) return false;
    if (consent.withdrawnAt) return false;

    // Check implicit consent expiration
    if (consent.consentType === 'implicit') {
      const daysSince = this.daysBetween(consent.consentDate, new Date());
      if (daysSince > this.config.implicitConsentMaxDays) return false;
    }

    return true;
  }

  /** Get all consent records for a domain */
  getConsentRecordsForDomain(domain: string): ConsentRecord[] {
    const records: ConsentRecord[] = [];
    for (const record of this.consentStore.values()) {
      if (record.domain === domain) {
        records.push(record);
      }
    }
    return records;
  }

  // ─── GDPR Right-to-Erasure (Article 17) ───────────────────────────────────

  /** Process a GDPR right-to-erasure request */
  processErasureRequest(
    email: string,
    requestedBy: string,
  ): Result<{
    consentRecordsErased: number;
    domains: string[];
  }> {
    if (!email || !email.includes('@')) {
      return err(`Invalid email address: ${email}`);
    }

    const normalizedEmail = email.toLowerCase().trim();
    let consentRecordsErased = 0;
    const domains: string[] = [];

    // Remove all consent records for this email across all domains
    const keysToDelete: string[] = [];
    for (const [key, record] of this.consentStore) {
      if (record.email.toLowerCase() === normalizedEmail) {
        keysToDelete.push(key);
        domains.push(record.domain);
        consentRecordsErased++;
      }
    }

    for (const key of keysToDelete) {
      this.consentStore.delete(key);
    }

    // Log the erasure
    this.erasureLog.set(normalizedEmail, {
      erasedAt: new Date(),
      requestedBy,
    });

    return ok({ consentRecordsErased, domains });
  }

  /** Check if an erasure request has been filed for an email */
  hasErasureRequest(email: string): boolean {
    return this.erasureLog.has(email.toLowerCase().trim());
  }

  /** Get the erasure log (for audit purposes) */
  getErasureLog(): Map<string, { erasedAt: Date; requestedBy: string }> {
    return new Map(this.erasureLog);
  }

  /** Clear an erasure record (e.g., person re-engages with new explicit consent) */
  clearErasureRecord(email: string): Result<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const existed = this.erasureLog.has(normalizedEmail);
    this.erasureLog.delete(normalizedEmail);
    return ok(existed);
  }

  // ─── Configuration ─────────────────────────────────────────────────────────

  /** Mark a domain as transactional (exempt from some marketing requirements) */
  addTransactionalDomain(domain: string): void {
    this.config.transactionalDomains.add(domain);
  }

  /** Remove a domain from transactional exemptions */
  removeTransactionalDomain(domain: string): void {
    this.config.transactionalDomains.delete(domain);
  }

  /** Enable a compliance framework */
  enableFramework(framework: ComplianceFramework): void {
    this.config.enabledFrameworks.add(framework);
  }

  /** Disable a compliance framework */
  disableFramework(framework: ComplianceFramework): void {
    this.config.enabledFrameworks.delete(framework);
  }

  /** Get the list of enabled frameworks */
  getEnabledFrameworks(): ComplianceFramework[] {
    return Array.from(this.config.enabledFrameworks);
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private checkUnsubscribeHeaders(
    email: EmailMetadata,
    violations: ComplianceViolation[],
    warnings: string[],
  ): void {
    const listUnsub = email.headers.get('List-Unsubscribe');
    const listUnsubPost = email.headers.get('List-Unsubscribe-Post');

    if (email.hasUnsubscribeHeader && !listUnsub) {
      warnings.push(
        'hasUnsubscribeHeader is true but no List-Unsubscribe header value found. Verify header is properly set.',
      );
    }

    if (listUnsub && !listUnsubPost) {
      violations.push({
        rule: 'RFC 8058',
        description: 'List-Unsubscribe-Post header is required for one-click unsubscribe',
        severity: 'warning',
        field: 'headers',
        recommendation: 'Add "List-Unsubscribe-Post: List-Unsubscribe=One-Click" header alongside List-Unsubscribe',
      });
    }

    if (listUnsubPost && !listUnsub) {
      violations.push({
        rule: 'RFC 8058',
        description: 'List-Unsubscribe-Post present without List-Unsubscribe header',
        severity: 'warning',
        field: 'headers',
        recommendation: 'List-Unsubscribe header must be present when List-Unsubscribe-Post is used',
      });
    }
  }

  private hasDeceptiveSubject(subject: string): boolean {
    const lowerSubject = subject.toLowerCase().trim();

    // Check for common deceptive patterns
    const deceptivePatterns = [
      /^re:\s/i,    // Fake reply (when no prior thread)
      /^fw:\s/i,    // Fake forward
      /^fwd:\s/i,   // Fake forward variant
    ];

    // We only flag these if they appear to be faked.
    // The caller should ideally pass thread context; we check for obvious fakes.
    for (const pattern of deceptivePatterns) {
      if (pattern.test(lowerSubject)) {
        // This is a heuristic — may produce false positives for legitimate replies
        // included as warning-level, not critical
        return true;
      }
    }

    return false;
  }

  private isValidFromAddress(from: string): boolean {
    if (!from || from.trim().length === 0) return false;

    // Extract email from potential "Display Name <email>" format
    const emailMatch = from.match(/<([^>]+)>/);
    const email = emailMatch ? emailMatch[1] : from;

    if (!email) return false;

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  private consentKey(email: string, domain: string): string {
    return `${email.toLowerCase().trim()}:${domain.toLowerCase().trim()}`;
  }

  private daysBetween(date1: Date, date2: Date): number {
    const ms = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createComplianceEnforcer(
  config?: Partial<ComplianceConfig>,
): ComplianceEnforcer {
  return new ComplianceEnforcer(config);
}
