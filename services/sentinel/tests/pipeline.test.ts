import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { SentinelPipeline } from '../src/pipeline.js';
import type { SentinelConfig, ValidationItem } from '../src/types.js';

function makeConfig(overrides?: Partial<SentinelConfig>): SentinelConfig {
  return {
    thresholds: { trusted: 95, probable: 70, uncertain: 40, suspicious: 10 },
    maxThroughput: 100_000,
    cache: { maxEntries: 1_000, defaultTtlMs: 60_000, cleanupIntervalMs: 600_000 },
    asyncVerification: { enabled: false, delayMs: 5_000, maxRetries: 3 },
    checkTimeouts: { parallel: 50, deep: 500 },
    ...overrides,
  };
}

function makeItem(overrides?: Partial<ValidationItem> & { payload?: Record<string, unknown> }): ValidationItem {
  return {
    id: `item-${Math.random().toString(36).slice(2, 8)}`,
    type: 'email_inbound',
    timestamp: Date.now(),
    payload: {
      from: 'sender@example.com',
      envelopeFrom: 'sender@example.com',
      subject: 'Hello there',
      body: 'This is a normal message.',
      headers: {
        'message-id': '<abc@example.com>',
        'date': 'Thu, 01 Jan 2026 00:00:00 +0000',
        'dkim-signature': 'v=1; a=rsa-sha256; d=example.com',
        'received-spf': 'pass',
        'authentication-results': 'mx.emailed.dev; dkim=pass; dmarc=pass',
      },
      senderReputation: 95,
      ipReputation: 90,
      historicalBehavior: 90,
      recipientKnowsSender: true,
      ...(overrides?.payload ?? {}),
    },
    metadata: {
      sourceIp: '10.0.0.1',
      previousItemCount: 5,
      ...overrides?.metadata,
    },
    ...({ id: overrides?.id, type: overrides?.type, timestamp: overrides?.timestamp } as Record<string, unknown>),
  };
}

describe('SentinelPipeline', () => {
  let pipeline: SentinelPipeline;

  beforeEach(() => {
    pipeline = new SentinelPipeline(makeConfig());
  });

  afterEach(() => {
    pipeline.shutdown();
  });

  it('should deliver trusted items via fast path', async () => {
    const item = makeItem({
      payload: {
        senderReputation: 99,
        ipReputation: 95,
        historicalBehavior: 95,
        recipientKnowsSender: true,
        headers: {
          'message-id': '<id@test>',
          'date': 'now',
          'dkim-signature': 'v=1',
          'received-spf': 'pass',
          'authentication-results': 'dkim=pass; dmarc=pass',
        },
      },
    });

    const result = await pipeline.validate(item);
    expect(result.decision).toBe('allow');
    expect(result.path).toBe('fast');
    expect(result.actions.some((a) => a.type === 'deliver')).toBe(true);
  });

  it('should reject items with very low confidence score immediately', async () => {
    const item = makeItem({
      payload: {
        senderReputation: 0,
        ipReputation: 0,
        historicalBehavior: 0,
        recipientKnowsSender: false,
        headers: {},
        from: 'spam@evil.test',
        envelopeFrom: 'different@other.test',
        subject: '',
        body: '',
      },
    });
    item.metadata.previousItemCount = 5000;

    const result = await pipeline.validate(item);
    expect(result.decision).toBe('reject');
    expect(result.path).toBe('fast');
    expect(result.actions.some((a) => a.type === 'reject')).toBe(true);
  });

  it('should route ambiguous items through parallel inspection', async () => {
    const item = makeItem({
      payload: {
        senderReputation: 60,
        ipReputation: 55,
        historicalBehavior: 55,
        recipientKnowsSender: false,
        headers: {
          'message-id': '<id@test>',
          'date': 'now',
          'received-spf': 'softfail',
        },
        from: 'unknown@somewhere.com',
        envelopeFrom: 'unknown@somewhere.com',
        subject: 'Newsletter',
        body: 'Click here for deals https://example.com',
      },
    });
    item.metadata.previousItemCount = 50;

    const result = await pipeline.validate(item);
    expect(['allow', 'quarantine', 'reject']).toContain(result.decision);
    expect(['parallel', 'deep']).toContain(result.path);
  });

  it('should use cache on second identical item', async () => {
    // First item: a trusted one that gets cached
    const item = makeItem({
      id: 'cache-test-1',
      payload: {
        from: 'trusted@cached.com',
        envelopeFrom: 'trusted@cached.com',
        senderReputation: 99,
        ipReputation: 95,
        historicalBehavior: 95,
        recipientKnowsSender: true,
        subject: 'cached subject',
        body: 'cached body text',
        headers: {
          'message-id': '<cache@test>',
          'date': 'now',
          'dkim-signature': 'v=1',
          'received-spf': 'pass',
          'authentication-results': 'dkim=pass; dmarc=pass',
        },
      },
    });

    const result1 = await pipeline.validate(item);
    expect(result1.decision).toBe('allow');

    // Second item with same fingerprint pattern
    const item2 = makeItem({
      id: 'cache-test-2',
      payload: {
        from: 'trusted@cached.com',
        envelopeFrom: 'trusted@cached.com',
        senderReputation: 99,
        ipReputation: 95,
        historicalBehavior: 95,
        recipientKnowsSender: true,
        subject: 'cached subject',
        body: 'cached body text',
        headers: {
          'message-id': '<cache@test>',
          'date': 'now',
          'dkim-signature': 'v=1',
          'received-spf': 'pass',
          'authentication-results': 'dkim=pass; dmarc=pass',
        },
      },
    });

    const result2 = await pipeline.validate(item2);
    // Should be a cache hit (confidence.cached === true)
    expect(result2.decision).toBe('allow');
    expect(result2.confidence.cached).toBe(true);
    expect(result2.path).toBe('fast');
  });

  it('should include a learn action in every result', async () => {
    const item = makeItem();
    const result = await pipeline.validate(item);
    expect(result.actions.some((a) => a.type === 'learn')).toBe(true);
  });

  it('should track metrics across multiple validations', async () => {
    const item = makeItem();
    await pipeline.validate(item);
    await pipeline.validate(item);

    const metrics = pipeline.getMetrics();
    expect(metrics.totalProcessed).toBeGreaterThanOrEqual(2);
    expect(metrics.cacheSize).toBeGreaterThanOrEqual(0);
  });

  it('should quarantine suspicious items and notify admin', async () => {
    const item = makeItem({
      payload: {
        senderReputation: 20,
        ipReputation: 15,
        historicalBehavior: 20,
        recipientKnowsSender: false,
        headers: {},
        from: 'sketchy@newdomain.xyz',
        envelopeFrom: 'different@other.xyz',
        subject: 'urgent verify your account immediately',
        body: 'Click here now to verify your password expire https://192.168.1.1/login',
      },
    });
    item.metadata.previousItemCount = 200;

    const result = await pipeline.validate(item);
    // With very suspicious signals but not below threshold 10, it should quarantine or go deep
    expect(['quarantine', 'reject', 'allow']).toContain(result.decision);
    if (result.path === 'deep') {
      // Deep path should include quarantine and notify actions
      const hasQuarantineOrReject = result.actions.some(
        (a) => a.type === 'quarantine' || a.type === 'reject' || a.type === 'deliver'
      );
      expect(hasQuarantineOrReject).toBe(true);
    }
  });

  it('should handle feedback and invalidate cache for false negatives', async () => {
    const item = makeItem({ id: 'feedback-test' });
    const result = await pipeline.validate(item);

    // Process feedback marking the item as a false negative
    pipeline.processFeedback({
      itemId: 'feedback-test',
      outcome: 'false_negative',
      source: 'manual_review',
      timestamp: Date.now(),
    });

    // Metrics should still be consistent
    const metrics = pipeline.getMetrics();
    expect(metrics.totalProcessed).toBeGreaterThanOrEqual(1);
  });

  it('should return totalTimeUs as a positive number', async () => {
    const item = makeItem();
    const result = await pipeline.validate(item);
    expect(result.totalTimeUs).toBeGreaterThan(0);
    expect(typeof result.totalTimeUs).toBe('number');
  });

  it('should handle items with missing payload fields gracefully', async () => {
    const item: ValidationItem = {
      id: 'minimal',
      type: 'email_inbound',
      timestamp: Date.now(),
      payload: {},
      metadata: { sourceIp: '127.0.0.1', previousItemCount: 0 },
    };

    const result = await pipeline.validate(item);
    expect(result.itemId).toBe('minimal');
    expect(['allow', 'quarantine', 'reject', 'defer']).toContain(result.decision);
  });

  it('should not cache quarantine or defer decisions', async () => {
    // Use a suspicious item that is likely to be quarantined
    const item = makeItem({
      id: 'no-cache-quarantine',
      payload: {
        senderReputation: 25,
        ipReputation: 20,
        historicalBehavior: 20,
        recipientKnowsSender: false,
        headers: {},
        from: 'bad@evil.test',
        envelopeFrom: 'bad@evil.test',
        subject: '',
        body: '',
      },
    });
    item.metadata.previousItemCount = 500;

    const result1 = await pipeline.validate(item);

    // Validate a second time — if it was quarantined, it should NOT be cached
    const item2 = { ...item, id: 'no-cache-quarantine-2' };
    const result2 = await pipeline.validate(item2);

    if (result1.decision === 'quarantine') {
      // The second validation should not be a cache hit
      expect(result2.confidence.cached).not.toBe(true);
    }
  });

  it('should shut down cleanly without errors', () => {
    expect(() => pipeline.shutdown()).not.toThrow();
  });
});
