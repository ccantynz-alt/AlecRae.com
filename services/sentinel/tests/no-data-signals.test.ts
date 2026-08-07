/**
 * Issue #166 — the confidence scorer substituted hardcoded values for
 * missing data (IP reputation 60, sender reputation 50, behavioral history
 * 65) and fed them into real spam-routing decisions as if measured.
 *
 * Now a signal with no underlying data is reported with `noData: true` and
 * EXCLUDED from the weighted average — no fabricated measurement, while
 * signals with real data still score exactly as before.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ConfidenceScorer } from '../src/scoring/confidence-scorer.js';
import type { SentinelConfig, ValidationItem } from '../src/types.js';

const config: SentinelConfig = {
  thresholds: { trusted: 95, probable: 70, uncertain: 40, suspicious: 10 },
  maxThroughput: 100_000,
  cache: { maxEntries: 1_000, defaultTtlMs: 60_000, cleanupIntervalMs: 600_000 },
  asyncVerification: { enabled: false, delayMs: 5_000, maxRetries: 3 },
  checkTimeouts: { parallel: 50, deep: 500 },
};

function makeItem(
  payload: Record<string, unknown> = {},
  metadata?: Partial<ValidationItem['metadata']>,
): ValidationItem {
  return {
    id: 'test-item',
    type: 'email_inbound',
    timestamp: Date.now(),
    payload,
    metadata: {
      // A public IP, so ip_reputation has no local answer.
      sourceIp: '203.0.113.10',
      previousItemCount: 5,
      ...metadata,
    },
  };
}

describe('no-data signals', () => {
  let scorer: ConfidenceScorer;

  beforeEach(() => {
    scorer = new ConfidenceScorer(config);
  });

  it('flags ip_reputation as noData for a public IP with no cached reputation — not a fake 60', () => {
    const result = scorer.score(makeItem({ senderReputation: 70 }));
    const ip = result.signals.find((s) => s.signal === 'ip_reputation');
    expect(ip).toBeDefined();
    expect(ip!.noData).toBe(true);
    expect(ip!.reason).toContain('not scored');
  });

  it('still scores ip_reputation when cached data exists', () => {
    const result = scorer.score(
      makeItem({ senderReputation: 70, ipReputation: 22 }),
    );
    const ip = result.signals.find((s) => s.signal === 'ip_reputation');
    expect(ip!.noData).toBeUndefined();
    expect(ip!.score).toBe(22);
  });

  it('still gives a private IP its real neutral score — that is data, not a default', () => {
    const result = scorer.score(
      makeItem({ senderReputation: 70 }, { sourceIp: '192.168.1.1' }),
    );
    const ip = result.signals.find((s) => s.signal === 'ip_reputation');
    expect(ip!.noData).toBeUndefined();
    expect(ip!.score).toBe(70);
  });

  it('excludes no-data signals from the weighted average', () => {
    // Two identical items except one carries a cached ipReputation equal to
    // the OLD hardcoded default. Under the old code both scored identically
    // (the default was indistinguishable from a measurement); now only the
    // item with real data lets the signal contribute.
    const withData = scorer.score(
      makeItem({ senderReputation: 30, ipReputation: 60 }),
    );
    const withoutData = scorer.score(makeItem({ senderReputation: 30 }));
    expect(withData.score).not.toBe(withoutData.score);
  });

  it('flags sender_reputation and behavioral_pattern the same way when absent', () => {
    const result = scorer.score(makeItem({}));
    const sender = result.signals.find((s) => s.signal === 'sender_reputation');
    const behavior = result.signals.find(
      (s) => s.signal === 'behavioral_pattern',
    );
    expect(sender!.noData).toBe(true);
    expect(behavior!.noData).toBe(true);
  });

  it('still produces a usable overall score from the signals that DO have data', () => {
    const result = scorer.score(makeItem({}));
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    // Signals with data (authentication, headers, rate, content,
    // relationship) still participate.
    const contributing = result.signals.filter((s) => !s.noData);
    expect(contributing.length).toBeGreaterThanOrEqual(5);
  });
});
