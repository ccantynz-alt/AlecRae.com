import { describe, it, expect, beforeEach } from 'bun:test';
import { ComplianceEngine } from '../src/compliance/engine.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeEmailMetadata(overrides: Record<string, unknown> = {}) {
  return {
    from: (overrides['from'] as string) ?? 'sender@example.com',
    to: (overrides['to'] as string) ?? 'recipient@example.com',
    senderDomain: (overrides['senderDomain'] as string) ?? 'example.com',
    contentType: (overrides['contentType'] as string) ?? 'marketing',
    hasPhysicalAddress: (overrides['hasPhysicalAddress'] as boolean) ?? true,
    hasUnsubscribeLink: (overrides['hasUnsubscribeLink'] as boolean) ?? true,
    hasUnsubscribeHeader: (overrides['hasUnsubscribeHeader'] as boolean) ?? true,
    headers: (overrides['headers'] as Map<string, string>) ?? new Map([
      ['List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'],
    ]),
  } as never;
}

function makeConsentRecord(overrides: Record<string, unknown> = {}) {
  return {
    email: (overrides['email'] as string) ?? 'recipient@example.com',
    domain: (overrides['domain'] as string) ?? 'example.com',
    consentType: (overrides['consentType'] as string) ?? 'explicit',
    consentDate: (overrides['consentDate'] as Date) ?? new Date(),
    source: (overrides['source'] as string) ?? 'signup_form',
    withdrawnAt: overrides['withdrawnAt'] as Date | undefined,
  } as never;
}

// ---------------------------------------------------------------------------
// CAN-SPAM validation
// ---------------------------------------------------------------------------

describe('ComplianceEngine - CAN-SPAM', () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine({ requireOneClickUnsubscribe: true });
  });

  it('should pass a fully compliant marketing email', () => {
    const email = makeEmailMetadata();
    const result = engine.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(true);
    }
  });

  it('should fail when physical address is missing', () => {
    const email = makeEmailMetadata({ hasPhysicalAddress: false });
    const result = engine.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(false);
      expect(result.value.violations.some((v) => v.rule === 'CAN-SPAM-PHYSICAL-ADDRESS')).toBe(true);
    }
  });

  it('should fail when unsubscribe link is missing', () => {
    const email = makeEmailMetadata({ hasUnsubscribeLink: false });
    const result = engine.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(false);
      expect(result.value.violations.some((v) => v.rule === 'CAN-SPAM-UNSUBSCRIBE-LINK')).toBe(true);
    }
  });

  it('should fail when List-Unsubscribe header is missing', () => {
    const email = makeEmailMetadata({ hasUnsubscribeHeader: false });
    const result = engine.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.rule === 'CAN-SPAM-LIST-UNSUBSCRIBE')).toBe(true);
    }
  });

  it('should warn about missing one-click unsubscribe header', () => {
    const email = makeEmailMetadata({
      headers: new Map(), // no List-Unsubscribe-Post
    });
    const result = engine.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.rule === 'RFC-8058-ONE-CLICK')).toBe(true);
    }
  });

  it('should exempt transactional emails from marketing rules', () => {
    const engine2 = new ComplianceEngine({ exemptTransactional: true });
    const email = makeEmailMetadata({
      contentType: 'transactional',
      hasPhysicalAddress: false,
      hasUnsubscribeLink: false,
      hasUnsubscribeHeader: false,
    });
    const result = engine2.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(true);
    }
  });

  it('should block sending to suppressed recipients', () => {
    engine.addToGlobalSuppression('recipient@example.com', 'unsubscribe', 'manual');
    const email = makeEmailMetadata();
    const result = engine.checkFramework('can-spam', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.rule === 'CAN-SPAM-SUPPRESSION')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// GDPR consent tracking
// ---------------------------------------------------------------------------

describe('ComplianceEngine - GDPR', () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine();
  });

  it('should fail when no consent record exists', () => {
    const email = makeEmailMetadata();
    const result = engine.checkFramework('gdpr', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(false);
      expect(result.value.violations.some((v) => v.rule === 'GDPR-CONSENT-MISSING')).toBe(true);
    }
  });

  it('should pass when explicit consent is recorded', () => {
    engine.recordConsent(makeConsentRecord());
    const email = makeEmailMetadata();
    const result = engine.checkFramework('gdpr', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(true);
    }
  });

  it('should fail when consent has been withdrawn', () => {
    engine.recordConsent(makeConsentRecord());
    engine.withdrawConsent('recipient@example.com', 'example.com');
    const email = makeEmailMetadata();
    const result = engine.checkFramework('gdpr', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(false);
      expect(result.value.violations.some((v) => v.rule === 'GDPR-CONSENT-WITHDRAWN')).toBe(true);
    }
  });

  it('should process erasure requests and add to suppression', () => {
    engine.recordConsent(makeConsentRecord());
    engine.recordConsent(makeConsentRecord({ domain: 'other.com' }));
    const result = engine.processErasureRequest('recipient@example.com');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recordsRemoved).toBe(2);
    }
    expect(engine.isEmailSuppressed('recipient@example.com', 'example.com')).toBe(true);
  });

  it('should allow transactional email under legitimate interest', () => {
    // No consent record, but transactional
    const email = makeEmailMetadata({ contentType: 'transactional' });
    const result = engine.checkFramework('gdpr', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// CASL checks
// ---------------------------------------------------------------------------

describe('ComplianceEngine - CASL', () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine();
  });

  it('should pass with express consent', () => {
    engine.recordConsent(makeConsentRecord({ consentType: 'explicit' }));
    const email = makeEmailMetadata();
    const result = engine.checkFramework('casl', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(true);
    }
  });

  it('should fail without consent', () => {
    const email = makeEmailMetadata();
    const result = engine.checkFramework('casl', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.rule === 'CASL-CONSENT-MISSING')).toBe(true);
    }
  });

  it('should flag expired implied consent', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 800); // >730 days
    engine.recordConsent(makeConsentRecord({
      consentType: 'implicit',
      consentDate: oldDate,
    }));
    const email = makeEmailMetadata();
    const result = engine.checkFramework('casl', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.rule === 'CASL-IMPLIED-EXPIRED')).toBe(true);
    }
  });

  it('should require sender identification (physical address)', () => {
    engine.recordConsent(makeConsentRecord());
    const email = makeEmailMetadata({ hasPhysicalAddress: false });
    const result = engine.checkFramework('casl', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.violations.some((v) => v.rule === 'CASL-IDENTIFICATION')).toBe(true);
    }
  });

  it('should exempt transactional emails from CASL consent', () => {
    const email = makeEmailMetadata({ contentType: 'transactional' });
    const result = engine.checkFramework('casl', email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.compliant).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Unsubscribe enforcement & suppression lists
// ---------------------------------------------------------------------------

describe('ComplianceEngine - unsubscribe and suppression', () => {
  let engine: ComplianceEngine;

  beforeEach(() => {
    engine = new ComplianceEngine();
  });

  it('should process unsubscribe and add to domain suppression', () => {
    engine.recordConsent(makeConsentRecord());
    const result = engine.processUnsubscribe('recipient@example.com', 'example.com');
    expect(result.ok).toBe(true);
    expect(engine.isEmailSuppressed('recipient@example.com', 'example.com')).toBe(true);
    expect(engine.hasValidConsent('recipient@example.com', 'example.com')).toBe(false);
  });

  it('should support per-domain suppression', () => {
    engine.addToDomainSuppression('user@test.com', 'domain-a.com', 'unsubscribe', 'manual');
    expect(engine.isEmailSuppressed('user@test.com', 'domain-a.com')).toBe(true);
    expect(engine.isEmailSuppressed('user@test.com', 'domain-b.com')).toBe(false);
  });

  it('should allow removing from suppression lists', () => {
    engine.addToGlobalSuppression('user@test.com', 'manual', 'admin');
    expect(engine.isEmailSuppressed('user@test.com', 'any.com')).toBe(true);
    engine.removeFromGlobalSuppression('user@test.com');
    expect(engine.isEmailSuppressed('user@test.com', 'any.com')).toBe(false);
  });

  it('should run all configured frameworks via checkAll', () => {
    engine.recordConsent(makeConsentRecord());
    const email = makeEmailMetadata();
    const result = engine.checkAll(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(3); // can-spam, gdpr, casl
    }
  });

  it('should list all suppression entries', () => {
    engine.addToGlobalSuppression('a@test.com', 'bounce', 'system');
    engine.addToDomainSuppression('b@test.com', 'domain.com', 'complaint', 'fbl');
    const all = engine.getSuppressionList();
    expect(all.length).toBe(2);
  });
});
