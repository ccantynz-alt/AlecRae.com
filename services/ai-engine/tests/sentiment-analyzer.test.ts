import { describe, it, expect, beforeEach } from 'bun:test';
import { SentimentAnalyzer } from '../src/sentiment/analyzer.js';
import type { EmotionalTone } from '../src/sentiment/analyzer.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides['id'] as string) ?? 'msg-1',
    receivedAt: (overrides['receivedAt'] as Date) ?? new Date(),
    headers: {
      subject: (overrides['subject'] as string) ?? 'Hello',
      from: { address: 'sender@example.com', domain: 'example.com', name: 'Sender' },
      to: [{ address: 'user@emailed.com', domain: 'emailed.com', name: 'User' }],
    },
    content: {
      textBody: (overrides['textBody'] as string) ?? '',
      htmlBody: '',
      attachments: [],
    },
  } as never;
}

// ---------------------------------------------------------------------------
// Single email sentiment analysis
// ---------------------------------------------------------------------------

describe('SentimentAnalyzer - tone detection', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer({ disableAI: true });
  });

  it('should detect positive tone in thankful emails', () => {
    const email = makeEmail({
      subject: 'Great work!',
      textBody: 'Thank you so much for the excellent work. I appreciate everything. This is wonderful and fantastic!',
    });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tone).toBe('positive');
      expect(result.value.positivityScore).toBeGreaterThan(0);
      expect(result.value.overall.overall).toBe('positive');
    }
  });

  it('should detect negative tone in complaint emails', () => {
    const email = makeEmail({
      subject: 'Terrible experience',
      textBody: 'I am very disappointed with your service. This is unacceptable and horrible. The failure is awful.',
    });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tone).toBe('negative');
      expect(result.value.overall.overall).toBe('negative');
    }
  });

  it('should detect urgent tone', () => {
    const email = makeEmail({
      subject: 'URGENT action needed',
      textBody: 'This is critical and urgent. We need this immediately, ASAP. Deadline is today, this is an emergency.',
    });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.urgencyScore).toBeGreaterThan(0);
    }
  });

  it('should detect frustrated tone', () => {
    const email = makeEmail({
      subject: 'Still waiting',
      textBody: 'I have followed up multiple times and still waiting. This is still not resolved. Yet again I am frustrated. This is ridiculous and unacceptable.',
    });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.frustrationScore).toBeGreaterThan(0);
    }
  });

  it('should return neutral sentiment for very short text', () => {
    const email = makeEmail({ subject: 'ok', textBody: '' });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.tone).toBe('neutral');
      expect(result.value.overall.overall).toBe('neutral');
    }
  });

  it('should measure formality level for formal emails', () => {
    const email = makeEmail({
      subject: 'Pursuant to our discussion',
      textBody: 'Dear Sir, I am writing sincerely with regards to the matter. Please be advised, attached herewith.',
    });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.formality).toBeGreaterThan(0.5);
    }
  });

  it('should measure formality level for informal emails', () => {
    const email = makeEmail({
      subject: 'Hey',
      textBody: 'Hey, lol that was awesome! Gonna check it out later. Cheers btw.',
    });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.formality).toBeLessThan(0.5);
    }
  });

  it('should include model version and processing time', () => {
    const email = makeEmail({ textBody: 'Thanks for the great update.' });
    const result = analyzer.analyze(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.modelVersion).toBe('1.0.0');
      expect(result.value.processingTimeMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Thread sentiment tracking
// ---------------------------------------------------------------------------

describe('SentimentAnalyzer - thread analysis', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer({ disableAI: true });
  });

  it('should analyze sentiment across a thread of messages', () => {
    const messages = [
      makeEmail({ id: 'm1', textBody: 'Thank you, this is wonderful and great work!' }),
      makeEmail({ id: 'm2', textBody: 'I appreciate the update, excellent job.' }),
      makeEmail({ id: 'm3', textBody: 'Good job, looks perfect.' }),
    ];
    const result = analyzer.analyzeThread('thread-1', messages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.messages.length).toBe(3);
      expect(result.value.averageSentiment).toBeGreaterThan(0);
      expect(result.value.toneProgression.length).toBe(3);
    }
  });

  it('should detect declining thread (escalation)', () => {
    const messages = [
      makeEmail({ id: 'm1', textBody: 'Thanks, appreciate the help. Great.' }),
      makeEmail({ id: 'm2', textBody: 'Unfortunately the problem is still there. Disappointed.' }),
      makeEmail({ id: 'm3', textBody: 'This is terrible and unacceptable. Failure after failure. Awful.' }),
      makeEmail({ id: 'm4', textBody: 'I am furious. Still broken. This is the worst. Horrible mistake.' }),
    ];
    const result = analyzer.analyzeThread('thread-2', messages);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.overallTrend).toBe('declining');
      expect(result.value.hasEscalation).toBe(true);
    }
  });

  it('should return error for empty thread', () => {
    const result = analyzer.analyzeThread('thread-empty', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EMPTY_THREAD');
    }
  });
});

// ---------------------------------------------------------------------------
// Urgency scoring
// ---------------------------------------------------------------------------

describe('SentimentAnalyzer - urgency scoring', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer();
  });

  it('should give high urgency for subject with urgent keywords and caps', () => {
    const email = makeEmail({
      subject: 'URGENT: DEADLINE TODAY',
      textBody: 'Respond immediately, this is critical.',
    });
    const score = analyzer.scoreUrgency(email);
    expect(score).toBeGreaterThan(0.3);
  });

  it('should give low urgency for a casual email', () => {
    const email = makeEmail({
      subject: 'Lunch plans',
      textBody: 'Want to grab lunch tomorrow?',
    });
    const score = analyzer.scoreUrgency(email);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it('should boost urgency for deep Re: chains', () => {
    const email = makeEmail({
      subject: 'Re: Re: Re: Issue with server',
      textBody: 'Still having the problem.',
    });
    const score = analyzer.scoreUrgency(email);
    expect(score).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Relationship sentiment & tone shift alerts
// ---------------------------------------------------------------------------

describe('SentimentAnalyzer - relationship tracking and tone shift alerts', () => {
  let analyzer: SentimentAnalyzer;

  beforeEach(() => {
    analyzer = new SentimentAnalyzer({ toneShiftThreshold: 0.4 });
  });

  it('should record and retrieve relationship sentiment history', () => {
    analyzer.recordSentiment('contact-1', 0.8, 'positive');
    analyzer.recordSentiment('contact-1', 0.7, 'positive');
    const result = analyzer.getRelationshipSentiment('contact-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.entries.length).toBe(2);
      expect(result.value.averageSentiment).toBe(0.75);
    }
  });

  it('should return error for unknown contact', () => {
    const result = analyzer.getRelationshipSentiment('unknown');
    expect(result.ok).toBe(false);
  });

  it('should detect tone shift alerts', () => {
    analyzer.recordSentiment('contact-2', 0.8, 'positive');
    analyzer.recordSentiment('contact-2', 0.2, 'negative');
    const alerts = analyzer.detectToneShifts('contact-2');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.sentimentDelta).toBeLessThan(0);
    expect(alerts[0]!.severity).toBe('warning');
  });

  it('should generate critical severity alert for large tone shifts', () => {
    analyzer.recordSentiment('contact-3', 0.9, 'positive');
    analyzer.recordSentiment('contact-3', 0.1, 'frustrated');
    const alerts = analyzer.detectToneShifts('contact-3');
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0]!.severity).toBe('critical');
  });
});
