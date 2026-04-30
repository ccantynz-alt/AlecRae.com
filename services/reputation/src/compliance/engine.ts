/**
 * @alecrae/reputation — Compliance Enforcement Engine
 *
 * Validates outbound email against major regulatory frameworks:
 *
 *  - CAN-SPAM (US): Unsubscribe header, physical address, opt-out mechanism
 *  - GDPR (EU): Consent tracking, right to erasure, data minimization
 *  - CASL (Canada): Express/implied consent, identification, unsubscribe
 *
 * Also enforces technical standards:
 *  - List-Unsubscribe header (RFC 2369) and One-Click Unsubscribe (RFC 8058)
 *  - Suppression list management (global and per-domain)
 *
 * Every outbound email passes through compliance checks before sending.
 * Non-compliant emails are blocked with a detailed violation report.
 */

import type {
  ComplianceFramework,
  ComplianceCheckResult,
  ComplianceViolation,
  ConsentRecord,
  EmailMetadata,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** RFC 8058 one-click unsubscribe header format */
const ONE_CLICK_UNSUBSCRIBE_PATTERN = /List-Unsubscribe-Post:\s*List-Unsubscribe=One-Click/i;

/** Maximum consent age for implied consent under CASL (6 months) */
const CASL_IMPLIED_CONSENT_MAX_DAYS = 180;

/** Maximum consent age for implied consent from business relationship under CASL (24 months) */
const CASL_BUSINESS_CONSENT_MAX_DAYS = 730;

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
// Suppression List Types
// ---------------------------------------------------------------------------

export interface SuppressionListEntry {
  email: string;
  domain: string;
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'gdpr_erasure' | 'manual';
  addedAt: Date;
  source: string;
}

// ---------------------------------------------------------------------------
// Engine Configuration
// ---------------------------------------------------------------------------

export interface ComplianceEngineConfig {
  /** Frameworks to enforce (default: all) */
  frameworks?: ComplianceFramework[];
  /** Require RFC 8058 one-click unsubscribe (recommended for Gmail compliance) */
  requireOneClickUnsubscribe?: boolean;
  /** Exempt transactional emails from marketing-only rules */
  exemptTransactional?: boolean;
}

// ---------------------------------------------------------------------------
// Compliance Engine
// ---------------------------------------------------------------------------

/**
 * Validates outbound email against CAN-SPAM, GDPR, and CASL regulations.
 *
 * Maintains consent records and suppression lists, and provides
 * per-email compliance checks that return detailed violation reports.
 */
export class ComplianceEngine {
  private readonly config: Required<ComplianceEngineConfig>;

  /** Consent records keyed by "email::domain" */
  private readonly consentRecords = new Map<string, ConsentRecord>();

  /** Global suppression list keyed by lowercase email */
  private readonly globalSuppressions = new Map<string, SuppressionListEntry>();

  /** Per-domain suppression lists keyed by "domain::email" */
  private readonly domainSuppressions = new Map<string, SuppressionListEntry>();

  constructor(config: ComplianceEngineConfig = {}) {
    this.config = {
      frameworks: config.frameworks ?? ['can-spam', 'gdpr', 'casl'],
      requireOneClickUnsubscribe: config.requireOneClickUnsubscribe ?? true,
      exemptTransactional: config.exemptTransactional ?? true,
    };
  }

  /**
   * Run all configured compliance checks on an email.
   * Returns a combined result with any violations found.
   */
  checkAll(email: EmailMetadata): Result<ComplianceCheckResult[]> {
    const results: ComplianceCheckResult[] = [];

    for (const framework of this.config.frameworks) {
      const result = this.checkFramework(framework, email);
      if (!result.ok) {
        return result as Result<never, Error>;
      }
      results.push(result.value);
    }

    return ok(results);
  }

  /**
   * Check an email against a specific compliance framework.
   */
  checkFramework(
    framework: ComplianceFramework,
    email: EmailMetadata,
  ): Result<ComplianceCheckResult> {
    switch (framework) {
      case 'can-spam':
        return ok(this.checkCanSpam(email));
      case 'gdpr':
        return ok(this.checkGdpr(email));
      case 'casl':
        return ok(this.checkCasl(email));
      default:
        return err(new Error(`Unknown compliance framework: ${String(framework)}`));
    }
  }

  /**
   * Check if an email is blocked by the suppression list.
   * Should be called before sending any email.
   */
  isEmailSuppressed(recipientEmail: string, senderDomain: string): boolean {
    const normalized = recipientEmail.toLowerCase();

    // Check global suppression
    if (this.globalSuppressions.has(normalized)) {
      return true;
    }

    // Check domain-specific suppression
    const domainKey = `${senderDomain}::${normalized}`;
    return this.domainSuppressions.has(domainKey);
  }

  /**
   * Record consent for a subscriber.
   */
  recordConsent(record: ConsentRecord): Result<ConsentRecord> {
    if (!record.email || !record.domain) {
      return err(new Error('Consent record must include email and domain'));
    }

    const key = this.consentKey(record.email, record.domain);
    this.consentRecords.set(key, { ...record });

    return ok(record);
  }

  /**
   * Withdraw consent for a subscriber (right to object / unsubscribe).
   */
  withdrawConsent(email: string, domain: string): Result<ConsentRecord> {
    const key = this.consentKey(email, domain);
    const existing = this.consentRecords.get(key);

    if (!existing) {
      return err(new Error(`No consent record found for ${email} on ${domain}`));
    }

    existing.withdrawnAt = new Date();
    return ok(existing);
  }

  /**
   * Check if valid consent exists for sending to a subscriber.
   */
  hasValidConsent(email: string, domain: string): boolean {
    const key = this.consentKey(email, domain);
    const record = this.consentRecords.get(key);

    if (!record) return false;
    if (record.withdrawnAt) return false;

    return true;
  }

  /**
   * Get the consent record for a subscriber.
   */
  getConsentRecord(email: string, domain: string): ConsentRecord | undefined {
    const key = this.consentKey(email, domain);
    return this.consentRecords.get(key);
  }

  /**
   * Process a GDPR erasure request (right to be forgotten).
   * Removes all consent records and adds to global suppression.
   */
  processErasureRequest(email: string): Result<{ recordsRemoved: number }> {
    const normalized = email.toLowerCase();
    let recordsRemoved = 0;

    // Remove all consent records for this email
    for (const [key, record] of this.consentRecords) {
      if (record.email.toLowerCase() === normalized) {
        this.consentRecords.delete(key);
        recordsRemoved++;
      }
    }

    // Add to global suppression
    this.addToGlobalSuppression(email, 'gdpr_erasure', 'GDPR erasure request');

    return ok({ recordsRemoved });
  }

  /**
   * Add an email to the global suppression list.
   */
  addToGlobalSuppression(
    email: string,
    reason: SuppressionListEntry['reason'],
    source: string,
  ): void {
    this.globalSuppressions.set(email.toLowerCase(), {
      email: email.toLowerCase(),
      domain: '*',
      reason,
      addedAt: new Date(),
      source,
    });
  }

  /**
   * Add an email to a domain-specific suppression list.
   */
  addToDomainSuppression(
    email: string,
    domain: string,
    reason: SuppressionListEntry['reason'],
    source: string,
  ): void {
    const domainKey = `${domain}::${email.toLowerCase()}`;
    this.domainSuppressions.set(domainKey, {
      email: email.toLowerCase(),
      domain,
      reason,
      addedAt: new Date(),
      source,
    });
  }

  /**
   * Remove an email from the global suppression list.
   * Use with caution — may have compliance implications.
   */
  removeFromGlobalSuppression(email: string): boolean {
    return this.globalSuppressions.delete(email.toLowerCase());
  }

  /**
   * Remove an email from a domain-specific suppression list.
   */
  removeFromDomainSuppression(email: string, domain: string): boolean {
    const domainKey = `${domain}::${email.toLowerCase()}`;
    return this.domainSuppressions.delete(domainKey);
  }

  /**
   * Get all suppression entries, optionally filtered by domain.
   */
  getSuppressionList(domain?: string): SuppressionListEntry[] {
    const global = [...this.globalSuppressions.values()];
    const domainEntries = [...this.domainSuppressions.values()];

    if (domain) {
      return [
        ...global,
        ...domainEntries.filter((e) => e.domain === domain),
      ];
    }

    return [...global, ...domainEntries];
  }

  /**
   * Process a List-Unsubscribe request (RFC 8058 one-click or mailto).
   * Withdraws consent and adds to domain suppression.
   */
  processUnsubscribe(email: string, domain: string): Result<void> {
    // Withdraw consent
    const key = this.consentKey(email, domain);
    const record = this.consentRecords.get(key);
    if (record) {
      record.withdrawnAt = new Date();
    }

    // Add to domain suppression
    this.addToDomainSuppression(email, domain, 'unsubscribe', 'List-Unsubscribe');

    return ok(undefined);
  }

  // ─── Framework-Specific Checks ───

  /**
   * CAN-SPAM Act compliance check.
   *
   * Requirements for commercial email:
   *  1. Must include a valid physical postal address
   *  2. Must include a visible unsubscribe mechanism
   *  3. Must include a List-Unsubscribe header
   *  4. Must honor opt-out requests within 10 business days
   *  5. Must not use deceptive subject lines
   *  6. Must identify the message as an advertisement (if applicable)
   */
  private checkCanSpam(email: EmailMetadata): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Transactional emails are largely exempt from CAN-SPAM
    if (this.config.exemptTransactional && email.contentType === 'transactional') {
      return {
        framework: 'can-spam',
        compliant: true,
        violations: [],
        warnings: ['Transactional email — CAN-SPAM marketing requirements waived'],
        checkedAt: new Date(),
      };
    }

    // Check for physical address
    if (!email.hasPhysicalAddress) {
      violations.push({
        rule: 'CAN-SPAM-PHYSICAL-ADDRESS',
        description: 'Email must include a valid physical postal address',
        severity: 'critical',
        field: 'body',
        recommendation: 'Add your company physical address to the email footer',
      });
    }

    // Check for unsubscribe link in body
    if (!email.hasUnsubscribeLink) {
      violations.push({
        rule: 'CAN-SPAM-UNSUBSCRIBE-LINK',
        description: 'Email must include a visible unsubscribe mechanism',
        severity: 'critical',
        field: 'body',
        recommendation: 'Add a clear, conspicuous unsubscribe link to the email',
      });
    }

    // Check for List-Unsubscribe header
    if (!email.hasUnsubscribeHeader) {
      violations.push({
        rule: 'CAN-SPAM-LIST-UNSUBSCRIBE',
        description: 'Email must include a List-Unsubscribe header',
        severity: 'critical',
        field: 'headers',
        recommendation: 'Add List-Unsubscribe header with mailto: and/or https: URI',
      });
    }

    // Check for RFC 8058 one-click unsubscribe
    if (this.config.requireOneClickUnsubscribe) {
      const postHeader = email.headers.get('List-Unsubscribe-Post');
      if (!postHeader || !ONE_CLICK_UNSUBSCRIBE_PATTERN.test(`List-Unsubscribe-Post: ${postHeader}`)) {
        violations.push({
          rule: 'RFC-8058-ONE-CLICK',
          description: 'Email should include RFC 8058 one-click unsubscribe (List-Unsubscribe-Post header)',
          severity: 'warning',
          field: 'headers',
          recommendation: 'Add header: List-Unsubscribe-Post: List-Unsubscribe=One-Click',
        });
      }
    }

    // Check suppression list
    if (this.isEmailSuppressed(email.to, email.senderDomain)) {
      violations.push({
        rule: 'CAN-SPAM-SUPPRESSION',
        description: 'Recipient is on the suppression list — sending is prohibited',
        severity: 'critical',
        field: 'to',
        recommendation: 'Remove this recipient from your mailing list',
      });
    }

    // Warnings
    if (!email.from.includes(email.senderDomain)) {
      warnings.push('From address domain does not match sender domain — may appear deceptive');
    }

    return {
      framework: 'can-spam',
      compliant: violations.filter((v) => v.severity === 'critical').length === 0,
      violations,
      warnings,
      checkedAt: new Date(),
    };
  }

  /**
   * GDPR compliance check.
   *
   * Requirements:
   *  1. Must have explicit consent for marketing emails
   *  2. Must provide easy opt-out mechanism
   *  3. Must honor erasure requests
   *  4. Consent must be recorded with timestamp and source
   *  5. Transactional emails require legitimate interest basis
   */
  private checkGdpr(email: EmailMetadata): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Transactional emails can proceed under "legitimate interest"
    if (this.config.exemptTransactional && email.contentType === 'transactional') {
      warnings.push('Transactional email — proceeding under legitimate interest basis');

      // Still check suppression
      if (this.isEmailSuppressed(email.to, email.senderDomain)) {
        violations.push({
          rule: 'GDPR-SUPPRESSION',
          description: 'Recipient has exercised right to erasure or objection',
          severity: 'critical',
          field: 'to',
          recommendation: 'Remove this recipient — they have exercised GDPR rights',
        });
      }

      return {
        framework: 'gdpr',
        compliant: violations.length === 0,
        violations,
        warnings,
        checkedAt: new Date(),
      };
    }

    // Check for consent
    const consentRecord = this.getConsentRecord(email.to, email.senderDomain);

    if (!consentRecord) {
      violations.push({
        rule: 'GDPR-CONSENT-MISSING',
        description: 'No consent record found for this recipient',
        severity: 'critical',
        field: 'to',
        recommendation: 'Obtain explicit consent before sending marketing emails under GDPR',
      });
    } else if (consentRecord.withdrawnAt) {
      violations.push({
        rule: 'GDPR-CONSENT-WITHDRAWN',
        description: 'Recipient has withdrawn consent',
        severity: 'critical',
        field: 'to',
        recommendation: 'Remove this recipient — they have withdrawn consent',
      });
    } else if (consentRecord.consentType !== 'explicit') {
      warnings.push(
        `Consent type is "${consentRecord.consentType}" — GDPR prefers explicit consent for marketing`,
      );
    }

    // Check for unsubscribe mechanism
    if (!email.hasUnsubscribeHeader || !email.hasUnsubscribeLink) {
      violations.push({
        rule: 'GDPR-OPT-OUT',
        description: 'Email must provide an easy way to withdraw consent (unsubscribe)',
        severity: 'critical',
        field: 'headers',
        recommendation: 'Include both List-Unsubscribe header and visible unsubscribe link',
      });
    }

    // Check suppression list
    if (this.isEmailSuppressed(email.to, email.senderDomain)) {
      violations.push({
        rule: 'GDPR-SUPPRESSION',
        description: 'Recipient is on the suppression list',
        severity: 'critical',
        field: 'to',
        recommendation: 'Remove this recipient — they may have exercised GDPR rights',
      });
    }

    return {
      framework: 'gdpr',
      compliant: violations.filter((v) => v.severity === 'critical').length === 0,
      violations,
      warnings,
      checkedAt: new Date(),
    };
  }

  /**
   * CASL (Canada Anti-Spam Legislation) compliance check.
   *
   * Requirements:
   *  1. Must have express or valid implied consent
   *  2. Must identify the sender (name and contact info)
   *  3. Must include a working unsubscribe mechanism
   *  4. Implied consent expires (6 months for inquiry, 24 months for business)
   */
  private checkCasl(email: EmailMetadata): ComplianceCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: string[] = [];

    // Transactional emails are exempt from CASL consent requirements
    if (this.config.exemptTransactional && email.contentType === 'transactional') {
      return {
        framework: 'casl',
        compliant: true,
        violations: [],
        warnings: ['Transactional email — CASL consent requirements waived'],
        checkedAt: new Date(),
      };
    }

    // Check for consent
    const consentRecord = this.getConsentRecord(email.to, email.senderDomain);

    if (!consentRecord) {
      violations.push({
        rule: 'CASL-CONSENT-MISSING',
        description: 'No consent record found for this recipient',
        severity: 'critical',
        field: 'to',
        recommendation: 'Obtain express consent before sending commercial electronic messages under CASL',
      });
    } else if (consentRecord.withdrawnAt) {
      violations.push({
        rule: 'CASL-CONSENT-WITHDRAWN',
        description: 'Recipient has withdrawn consent',
        severity: 'critical',
        field: 'to',
        recommendation: 'Remove this recipient — they have unsubscribed',
      });
    } else if (consentRecord.consentType === 'implicit') {
      // Check implied consent expiration
      const consentAge = this.daysSince(consentRecord.consentDate);

      if (consentAge > CASL_BUSINESS_CONSENT_MAX_DAYS) {
        violations.push({
          rule: 'CASL-IMPLIED-EXPIRED',
          description: `Implied consent expired — ${consentAge} days old (max ${CASL_BUSINESS_CONSENT_MAX_DAYS} for business relationship)`,
          severity: 'critical',
          field: 'to',
          recommendation: 'Obtain express consent — implied consent has expired',
        });
      } else if (consentAge > CASL_IMPLIED_CONSENT_MAX_DAYS) {
        warnings.push(
          `Implied consent is ${consentAge} days old — may have expired if based on inquiry (max ${CASL_IMPLIED_CONSENT_MAX_DAYS} days)`,
        );
      }
    }

    // Check for sender identification
    if (!email.hasPhysicalAddress) {
      violations.push({
        rule: 'CASL-IDENTIFICATION',
        description: 'Must include sender contact information (name, mailing address)',
        severity: 'critical',
        field: 'body',
        recommendation: 'Include sender name and physical mailing address',
      });
    }

    // Check for unsubscribe mechanism
    if (!email.hasUnsubscribeHeader) {
      violations.push({
        rule: 'CASL-UNSUBSCRIBE-HEADER',
        description: 'Must include a working unsubscribe mechanism',
        severity: 'critical',
        field: 'headers',
        recommendation: 'Add List-Unsubscribe header',
      });
    }

    if (!email.hasUnsubscribeLink) {
      violations.push({
        rule: 'CASL-UNSUBSCRIBE-LINK',
        description: 'Must include a visible unsubscribe link in the message body',
        severity: 'critical',
        field: 'body',
        recommendation: 'Add a clear unsubscribe link to the email footer',
      });
    }

    // Check suppression list
    if (this.isEmailSuppressed(email.to, email.senderDomain)) {
      violations.push({
        rule: 'CASL-SUPPRESSION',
        description: 'Recipient is on the suppression list',
        severity: 'critical',
        field: 'to',
        recommendation: 'Remove this recipient from your mailing list',
      });
    }

    return {
      framework: 'casl',
      compliant: violations.filter((v) => v.severity === 'critical').length === 0,
      violations,
      warnings,
      checkedAt: new Date(),
    };
  }

  // ─── Internal ───

  /** Generate a consent record key */
  private consentKey(email: string, domain: string): string {
    return `${email.toLowerCase()}::${domain.toLowerCase()}`;
  }

  /** Calculate days since a given date */
  private daysSince(date: Date): number {
    return Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
  }
}
