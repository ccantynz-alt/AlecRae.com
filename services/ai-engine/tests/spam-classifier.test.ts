import { describe, it, expect, beforeEach } from 'bun:test';
import { SpamClassifier, BayesianClassifier, tokenize } from '../src/spam/classifier.js';
import type { ClaudeClient } from '../src/spam/classifier.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    receivedAt: new Date(),
    headers: {
      subject: (overrides['subject'] as string) ?? 'Hello',
      from: { address: 'sender@example.com', domain: 'example.com', name: 'Sender' },
      to: [{ address: 'user@alecrae.com', domain: 'alecrae.com', name: 'User' }],
      cc: [],
      replyTo: overrides['replyTo'] as { address: string; domain: string } | undefined,
      receivedChain: (overrides['receivedChain'] as unknown[]) ?? [
        { from: '10.0.0.1', by: '10.0.0.2', timestamp: new Date(), tlsVersion: 'TLSv1.3' },
      ],
      authenticationResults: overrides['auth'] ?? { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
      raw: overrides['rawHeaders'] ?? new Map(),
    },
    content: {
      textBody: (overrides['textBody'] as string) ?? 'This is a normal email body.',
      htmlBody: (overrides['htmlBody'] as string) ?? '',
      attachments: [],
    },
    ...overrides,
  } as never;
}

// ---------------------------------------------------------------------------
// tokenize()
// ---------------------------------------------------------------------------

describe('tokenize', () => {
  it('should lowercase and split text into tokens', () => {
    const tokens = tokenize('Hello World FOO');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('foo');
  });

  it('should filter out tokens shorter than 2 characters', () => {
    const tokens = tokenize('I am a big dog');
    expect(tokens).not.toContain('i');
    expect(tokens).not.toContain('a');
    expect(tokens).toContain('am');
    expect(tokens).toContain('big');
    expect(tokens).toContain('dog');
  });
});

// ---------------------------------------------------------------------------
// BayesianClassifier
// ---------------------------------------------------------------------------

describe('BayesianClassifier', () => {
  let classifier: BayesianClassifier;

  beforeEach(() => {
    classifier = new BayesianClassifier();
  });

  it('should return 0.5 when untrained', () => {
    const result = classifier.classify(['hello', 'world']);
    expect(result.spamProbability).toBe(0.5);
  });

  it('should classify spam-heavy tokens toward spam after training', () => {
    classifier.train([
      { tokens: ['buy', 'now', 'discount', 'free'], label: 'spam' },
      { tokens: ['buy', 'now', 'discount', 'free'], label: 'spam' },
      { tokens: ['meeting', 'agenda', 'review'], label: 'ham' },
      { tokens: ['meeting', 'agenda', 'review'], label: 'ham' },
    ]);
    const result = classifier.classify(['buy', 'now', 'free']);
    expect(result.spamProbability).toBeGreaterThan(0.5);
  });

  it('should classify ham-heavy tokens toward ham after training', () => {
    classifier.train([
      { tokens: ['buy', 'now', 'discount', 'free'], label: 'spam' },
      { tokens: ['meeting', 'quarterly', 'review', 'agenda'], label: 'ham' },
      { tokens: ['meeting', 'quarterly', 'review', 'agenda'], label: 'ham' },
    ]);
    const result = classifier.classify(['meeting', 'quarterly', 'agenda']);
    expect(result.spamProbability).toBeLessThan(0.5);
  });

  it('should expose top spam and ham tokens', () => {
    classifier.train([
      { tokens: ['viagra', 'cheap', 'pharmacy'], label: 'spam' },
      { tokens: ['project', 'update', 'team'], label: 'ham' },
    ]);
    const result = classifier.classify(['viagra', 'cheap', 'project']);
    expect(result.topSpamTokens.length).toBeGreaterThan(0);
    expect(result.topHamTokens.length).toBeGreaterThan(0);
  });

  it('should support incremental training via trainSingle', () => {
    classifier.trainSingle(['cheap', 'pills'], 'spam');
    classifier.trainSingle(['hello', 'friend'], 'ham');
    const result = classifier.classify(['cheap', 'pills']);
    expect(result.spamProbability).toBeGreaterThan(0.5);
  });

  it('should export and restore state', () => {
    classifier.train([
      { tokens: ['discount', 'offer'], label: 'spam' },
      { tokens: ['invoice', 'attached'], label: 'ham' },
    ]);
    const state = classifier.exportState();
    expect(state.totalSpamDocuments).toBe(1);
    expect(state.totalHamDocuments).toBe(1);

    const restored = new BayesianClassifier(state);
    const result = restored.classify(['discount', 'offer']);
    expect(result.spamProbability).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// SpamClassifier (full pipeline)
// ---------------------------------------------------------------------------

describe('SpamClassifier', () => {
  let classifier: SpamClassifier;

  beforeEach(() => {
    classifier = new SpamClassifier(undefined, { disableClaude: true });
  });

  it('should classify a normal email as not spam', async () => {
    const email = makeEmail({
      subject: 'Quarterly review meeting',
      textBody: 'Hi team, please find the agenda for our quarterly review attached.',
    });
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict).not.toBe('spam');
    }
  });

  it('should flag spam-phrase-heavy emails with higher scores', async () => {
    const email = makeEmail({
      subject: 'ACT NOW! Limited Time Free Gift',
      textBody: 'Click here to claim your free gift! Buy now and get a special promotion. No obligation, risk free!',
    });
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.score).toBeGreaterThan(0.2);
      expect(result.value.reasons.some((r) => r.code === 'SPAM_PHRASES')).toBe(true);
    }
  });

  it('should detect authentication failures in headers', async () => {
    const email = makeEmail({
      subject: 'Important notice',
      textBody: 'Please verify your account.',
      auth: { spf: 'fail', dkim: 'fail', dmarc: 'fail' },
    });
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reasons.some((r) => r.code === 'AUTH_FAIL')).toBe(true);
    }
  });

  it('should detect suspicious URLs', async () => {
    const email = makeEmail({
      subject: 'Verify your account',
      textBody: 'Please click http://192.168.1.1:8080/login to verify.',
    });
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.layers.contentAnalysis.suspiciousUrls.length).toBeGreaterThan(0);
    }
  });

  it('should detect reply-to domain mismatch', async () => {
    const email = makeEmail({
      subject: 'Your account',
      textBody: 'Please verify.',
      replyTo: { address: 'hacker@evil.com', domain: 'evil.com' },
    });
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reasons.some((r) => r.code === 'ENVELOPE_MISMATCH')).toBe(true);
    }
  });

  it('should include processing time and model version', async () => {
    const email = makeEmail();
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.value.modelVersion).toBe('1.0.0');
    }
  });

  it('should provide confidence scores', async () => {
    const email = makeEmail({
      subject: 'WINNER! You have been selected for a million dollars!!!',
      textBody: 'Congratulations! Wire transfer your fee now. Nigerian prince needs help.',
    });
    const result = await classifier.classify(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.confidence.level).toBeDefined();
      expect(result.value.confidence.score).toBeGreaterThanOrEqual(0);
      expect(result.value.confidence.score).toBeLessThanOrEqual(1);
    }
  });

  it('should support feedback-based incremental training', async () => {
    const email = makeEmail({
      subject: 'Buy cheap pills',
      textBody: 'Viagra discount pharmacy weight loss.',
    });
    classifier.reportFeedback(email, 'spam');
    // After training, the model should have updated state
    const exported = classifier.exportModel();
    expect(exported.totalSpamDocuments).toBe(1);
  });
});
