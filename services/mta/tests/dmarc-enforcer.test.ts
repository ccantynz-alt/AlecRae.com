import { describe, it, expect } from 'bun:test';
import { parseDmarcRecord, determineAction, formatAuthResults } from '../src/dmarc/enforcer.js';
import type { DmarcEvaluationResult, SpfCheckResult, DkimVerificationResult } from '../src/types.js';

describe('DMARC Enforcer — parseDmarcRecord', () => {
  it('should parse a basic DMARC record with reject policy', () => {
    const result = parseDmarcRecord('v=DMARC1; p=reject; rua=mailto:dmarc@example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.version).toBe('DMARC1');
    expect(result.value.policy).toBe('reject');
    expect(result.value.reportingUris).toEqual(['mailto:dmarc@example.com']);
  });

  it('should reject a record without v=DMARC1 tag', () => {
    const result = parseDmarcRecord('p=reject; rua=mailto:dmarc@example.com');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('missing v=DMARC1');
  });

  it('should reject a record without a valid p= tag', () => {
    const result = parseDmarcRecord('v=DMARC1; rua=mailto:dmarc@example.com');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("'p' tag");
  });

  it('should parse alignment options: strict DKIM and relaxed SPF', () => {
    const result = parseDmarcRecord('v=DMARC1; p=quarantine; adkim=s; aspf=r');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.dkimAlignment).toBe('strict');
    expect(result.value.spfAlignment).toBe('relaxed');
  });

  it('should default alignment to relaxed when not specified', () => {
    const result = parseDmarcRecord('v=DMARC1; p=none');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.dkimAlignment).toBe('relaxed');
    expect(result.value.spfAlignment).toBe('relaxed');
  });

  it('should parse percentage tag', () => {
    const result = parseDmarcRecord('v=DMARC1; p=quarantine; pct=50');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.percentage).toBe(50);
  });

  it('should default percentage to 100 when not specified', () => {
    const result = parseDmarcRecord('v=DMARC1; p=reject');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.percentage).toBe(100);
  });

  it('should parse subdomain policy (sp=)', () => {
    const result = parseDmarcRecord('v=DMARC1; p=reject; sp=quarantine');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.policy).toBe('reject');
    expect(result.value.subdomainPolicy).toBe('quarantine');
  });

  it('should parse multiple reporting URIs', () => {
    const result = parseDmarcRecord(
      'v=DMARC1; p=none; rua=mailto:a@example.com,mailto:b@example.com',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.reportingUris).toEqual([
      'mailto:a@example.com',
      'mailto:b@example.com',
    ]);
  });

  it('should strip size limits from reporting URIs', () => {
    const result = parseDmarcRecord('v=DMARC1; p=none; rua=mailto:dmarc@example.com!10m');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.reportingUris).toEqual(['mailto:dmarc@example.com']);
  });

  it('should parse forensic URIs (ruf=)', () => {
    const result = parseDmarcRecord('v=DMARC1; p=none; ruf=mailto:forensic@example.com');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.forensicUris).toEqual(['mailto:forensic@example.com']);
  });

  it('should parse report interval (ri=)', () => {
    const result = parseDmarcRecord('v=DMARC1; p=none; ri=3600');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.reportInterval).toBe(3600);
  });

  it('should default report interval to 86400', () => {
    const result = parseDmarcRecord('v=DMARC1; p=none');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.reportInterval).toBe(86400);
  });
});

describe('DMARC Enforcer — determineAction', () => {
  function makeEvaluation(overrides: Partial<DmarcEvaluationResult>): DmarcEvaluationResult {
    return {
      result: 'pass',
      policy: 'none',
      appliedPolicy: 'none',
      spfResult: { result: 'pass', domain: 'example.com' },
      dkimResult: { status: 'pass', domain: 'example.com', selector: 's1' },
      spfAligned: true,
      dkimAligned: true,
      fromDomain: 'example.com',
      ...overrides,
    };
  }

  it('should accept when DMARC passes', () => {
    const action = determineAction(makeEvaluation({ result: 'pass' }));
    expect(action).toBe('accept');
  });

  it('should accept when result is none (no DMARC record)', () => {
    const action = determineAction(makeEvaluation({ result: 'none' }));
    expect(action).toBe('accept');
  });

  it('should reject when DMARC fails and applied policy is reject', () => {
    const action = determineAction(
      makeEvaluation({ result: 'fail', appliedPolicy: 'reject' }),
    );
    expect(action).toBe('reject');
  });

  it('should quarantine when DMARC fails and applied policy is quarantine', () => {
    const action = determineAction(
      makeEvaluation({ result: 'fail', appliedPolicy: 'quarantine' }),
    );
    expect(action).toBe('quarantine');
  });

  it('should accept when DMARC fails but applied policy is none', () => {
    const action = determineAction(
      makeEvaluation({ result: 'fail', appliedPolicy: 'none' }),
    );
    expect(action).toBe('accept');
  });
});

describe('DMARC Enforcer — formatAuthResults', () => {
  it('should format a complete auth results header', () => {
    const evaluation: DmarcEvaluationResult = {
      result: 'pass',
      policy: 'reject',
      appliedPolicy: 'none',
      spfResult: { result: 'pass', domain: 'example.com' },
      dkimResult: { status: 'pass', domain: 'example.com', selector: 's1' },
      spfAligned: true,
      dkimAligned: true,
      fromDomain: 'example.com',
    };

    const header = formatAuthResults('mx.alecrae.dev', evaluation);
    expect(header).toContain('mx.alecrae.dev');
    expect(header).toContain('dmarc=pass');
    expect(header).toContain('dkim=pass');
    expect(header).toContain('spf=pass');
    expect(header).toContain('header.from=example.com');
  });
});
