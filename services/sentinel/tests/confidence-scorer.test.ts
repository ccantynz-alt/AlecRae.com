import { describe, it, expect, beforeEach } from 'bun:test';
import { ConfidenceScorer } from '../src/scoring/confidence-scorer.js';
import type { SentinelConfig, ValidationItem, ConfidenceTier } from '../src/types.js';

const defaultConfig: SentinelConfig = {
  thresholds: { trusted: 95, probable: 70, uncertain: 40, suspicious: 10 },
  maxThroughput: 100_000,
  cache: { maxEntries: 1_000, defaultTtlMs: 60_000, cleanupIntervalMs: 600_000 },
  asyncVerification: { enabled: false, delayMs: 5_000, maxRetries: 3 },
  checkTimeouts: { parallel: 50, deep: 500 },
};

function makeItem(payload: Record<string, unknown> = {}, metadata?: Partial<ValidationItem['metadata']>): ValidationItem {
  return {
    id: 'test-item',
    type: 'email_inbound',
    timestamp: Date.now(),
    payload,
    metadata: {
      sourceIp: '10.0.0.1',
      previousItemCount: 5,
      ...metadata,
    },
  };
}

describe('ConfidenceScorer', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer(defaultConfig);
  });

  it('should assign TRUSTED tier to a well-authenticated email from a known good sender', () => {
    const item = makeItem({
      senderReputation: 99,
      ipReputation: 95,
      historicalBehavior: 95,
      recipientKnowsSender: true,
      from: 'ceo@trusted.com',
      envelopeFrom: 'ceo@trusted.com',
      subject: 'Quarterly update',
      body: 'Please see the attached report.',
      headers: {
        'message-id': '<id@trusted.com>',
        'date': 'now',
        'dkim-signature': 'v=1; a=rsa-sha256; d=trusted.com',
        'received-spf': 'pass',
        'authentication-results': 'dkim=pass; dmarc=pass',
      },
    });

    const result = scorer.score(item);
    expect(result.tier).toBe('TRUSTED');
    expect(result.score).toBeGreaterThanOrEqual(95);
  });

  it('should assign REJECTED tier to email with all bad signals', () => {
    const item = makeItem(
      {
        senderReputation: 0,
        ipReputation: 0,
        historicalBehavior: 0,
        recipientKnowsSender: false,
        from: 'scam@evil.test',
        envelopeFrom: 'bounce@other.test',
        subject: '',
        body: '',
        headers: {},
      },
      { sourceIp: '203.0.113.1', previousItemCount: 5000 },
    );

    const result = scorer.score(item);
    expect(result.tier).toBe('REJECTED');
    expect(result.score).toBeLessThan(10);
  });

  it('should assign PROBABLE tier to email with moderate signals', () => {
    const item = makeItem({
      senderReputation: 75,
      ipReputation: 70,
      historicalBehavior: 70,
      recipientKnowsSender: false,
      from: 'info@company.com',
      envelopeFrom: 'info@company.com',
      subject: 'Monthly newsletter',
      body: 'Check out our latest products https://company.com',
      headers: {
        'message-id': '<id@company.com>',
        'date': 'now',
        'dkim-signature': 'v=1',
        'received-spf': 'pass',
        'authentication-results': 'dkim=pass; dmarc=pass',
        'list-unsubscribe': '<mailto:unsub@company.com>',
      },
    });

    const result = scorer.score(item);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThan(95);
    expect(result.tier).toBe('PROBABLE');
  });

  it('should assign SUSPICIOUS tier to email with phishing signals', () => {
    const item = makeItem(
      {
        senderReputation: 20,
        ipReputation: 15,
        historicalBehavior: 15,
        recipientKnowsSender: false,
        from: 'security@bank-verify.xyz',
        envelopeFrom: 'bounce@other-domain.xyz',
        subject: 'urgent verify your account immediately',
        body: 'Your password will expire. Click here now to verify your account within 24 hours https://192.168.1.1/login',
        headers: {},
      },
      { sourceIp: '203.0.113.50', previousItemCount: 300 },
    );

    const result = scorer.score(item);
    expect(result.score).toBeLessThan(40);
    expect(['SUSPICIOUS', 'REJECTED'] as ConfidenceTier[]).toContain(result.tier);
  });

  it('should return all signal scores in the result', () => {
    const item = makeItem({ senderReputation: 80 });
    const result = scorer.score(item);

    expect(result.signals.length).toBeGreaterThanOrEqual(5);
    for (const signal of result.signals) {
      expect(signal.score).toBeGreaterThanOrEqual(0);
      expect(signal.score).toBeLessThanOrEqual(100);
      expect(signal.weight).toBeGreaterThan(0);
      expect(typeof signal.reason).toBe('string');
    }
  });

  it('should compute within fast time target (cached = false)', () => {
    const item = makeItem({ senderReputation: 80 });
    const result = scorer.score(item);
    expect(result.cached).toBe(false);
    expect(result.computeTimeUs).toBeGreaterThanOrEqual(0);
  });

  it('should penalize emails with no authentication at all', () => {
    const authedItem = makeItem({
      senderReputation: 50,
      headers: {
        'dkim-signature': 'v=1',
        'received-spf': 'pass',
        'authentication-results': 'dkim=pass; dmarc=pass',
        'message-id': '<id@test>',
        'date': 'now',
      },
    });

    const noAuthItem = makeItem({
      senderReputation: 50,
      headers: {
        'message-id': '<id@test>',
        'date': 'now',
      },
    });

    const authedResult = scorer.score(authedItem);
    const noAuthResult = scorer.score(noAuthItem);

    expect(authedResult.score).toBeGreaterThan(noAuthResult.score);
  });

  it('should penalize high-volume senders', () => {
    const normalItem = makeItem({ senderReputation: 70 }, { previousItemCount: 5 });
    const spammyItem = makeItem({ senderReputation: 70 }, { previousItemCount: 2000 });

    const normalResult = scorer.score(normalItem);
    const spammyResult = scorer.score(spammyItem);

    expect(normalResult.score).toBeGreaterThan(spammyResult.score);
  });

  it('should boost score when recipient knows sender', () => {
    const knownItem = makeItem({ senderReputation: 60, recipientKnowsSender: true });
    const unknownItem = makeItem({ senderReputation: 60, recipientKnowsSender: false });

    const knownResult = scorer.score(knownItem);
    const unknownResult = scorer.score(unknownItem);

    expect(knownResult.score).toBeGreaterThan(unknownResult.score);
  });

  it('should penalize content with urgency language', () => {
    const cleanItem = makeItem({
      senderReputation: 60,
      subject: 'Team meeting notes',
      body: 'Here are the notes from today.',
    });

    const urgentItem = makeItem({
      senderReputation: 60,
      subject: 'urgent act now limited time',
      body: 'Your account will be suspended immediately. Verify your password now or it will expire.',
    });

    const cleanResult = scorer.score(cleanItem);
    const urgentResult = scorer.score(urgentItem);

    expect(cleanResult.score).toBeGreaterThan(urgentResult.score);
  });

  it('should update signal weights via feedback', () => {
    const item = makeItem({ senderReputation: 70 });

    const before = scorer.score(item);

    // Penalize sender_reputation signal (simulate false negative)
    scorer.updateWeights('sender_reputation', false);
    scorer.updateWeights('sender_reputation', false);
    scorer.updateWeights('sender_reputation', false);

    const after = scorer.score(item);

    // Score should change because the weight of sender_reputation changed
    expect(before.score).not.toBe(after.score);
  });

  it('should handle private IPs with neutral score in ip_reputation', () => {
    const privateIpItem = makeItem(
      { senderReputation: 50 },
      { sourceIp: '192.168.1.1' },
    );

    const result = scorer.score(privateIpItem);
    const ipSignal = result.signals.find((s) => s.signal === 'ip_reputation');
    expect(ipSignal).toBeDefined();
    expect(ipSignal!.score).toBe(70); // Private IP gets 70
  });

  it('should penalize missing headers (Message-ID, Date)', () => {
    const goodHeaders = makeItem({
      senderReputation: 60,
      headers: { 'message-id': '<id@test>', 'date': 'now' },
    });

    const badHeaders = makeItem({
      senderReputation: 60,
      headers: {},
    });

    const goodResult = scorer.score(goodHeaders);
    const badResult = scorer.score(badHeaders);

    expect(goodResult.score).toBeGreaterThan(badResult.score);
  });
});
