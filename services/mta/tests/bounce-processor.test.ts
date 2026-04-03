import { describe, it, expect } from 'bun:test';
import {
  classifyBounce,
  parseBounceMessage,
  parseDsn,
  processBounce,
  BounceProcessor,
} from '../src/bounce/processor.js';
import type { BounceInfo } from '../src/types.js';

describe('Bounce Processor — classifyBounce', () => {
  it('should classify 550 "user unknown" as hard bounce, invalid-recipient', () => {
    const result = classifyBounce(550, '550 5.1.1 User unknown');
    expect(result.category).toBe('hard');
    expect(result.type).toBe('invalid-recipient');
    expect(result.retryable).toBe(false);
  });

  it('should classify 550 "domain not found" as hard bounce, domain-not-found', () => {
    const result = classifyBounce(550, '550 5.1.2 Host not found');
    expect(result.category).toBe('hard');
    expect(result.type).toBe('domain-not-found');
    expect(result.retryable).toBe(false);
  });

  it('should classify 550 with spam keywords as block bounce, spam-block', () => {
    const result = classifyBounce(550, '550 5.7.1 Message rejected due to spam content, blocked by DNSBL');
    expect(result.category).toBe('block');
    expect(result.type).toBe('spam-block');
    expect(result.retryable).toBe(false);
  });

  it('should classify 552 "message too large" as hard bounce', () => {
    const result = classifyBounce(552, '552 5.3.4 Message too large, exceeds maximum message size');
    expect(result.category).toBe('hard');
    expect(result.type).toBe('message-too-large');
    expect(result.retryable).toBe(false);
  });

  it('should classify 550 with auth failure keywords as block, auth-failure', () => {
    const result = classifyBounce(550, '550 5.7.0 DKIM authentication failed');
    expect(result.category).toBe('block');
    expect(result.type).toBe('auth-failure');
    expect(result.retryable).toBe(false);
  });

  it('should classify 452 "mailbox full" as soft bounce, mailbox-full', () => {
    const result = classifyBounce(452, '452 4.2.2 Mailbox full, quota exceeded');
    expect(result.category).toBe('soft');
    expect(result.type).toBe('mailbox-full');
    expect(result.retryable).toBe(true);
  });

  it('should classify 421 rate limiting as transient, rate-limited', () => {
    const result = classifyBounce(421, '421 4.7.1 Rate limit exceeded, try again later');
    expect(result.category).toBe('transient');
    expect(result.type).toBe('rate-limited');
    expect(result.retryable).toBe(true);
  });

  it('should classify 421 timeout as transient', () => {
    const result = classifyBounce(421, '421 Connection timed out');
    expect(result.category).toBe('transient');
    expect(result.type).toBe('timeout');
    expect(result.retryable).toBe(true);
  });

  it('should classify 451 connection refused as transient', () => {
    const result = classifyBounce(451, '451 Connection refused by remote server');
    expect(result.category).toBe('transient');
    expect(result.type).toBe('connection-refused');
    expect(result.retryable).toBe(true);
  });

  it('should classify unknown 4xx as soft bounce with unknown type', () => {
    const result = classifyBounce(450, '450 Some generic temporary issue');
    expect(result.category).toBe('soft');
    expect(result.type).toBe('unknown');
    expect(result.retryable).toBe(true);
  });

  it('should classify unknown 5xx as hard bounce with unknown type', () => {
    const result = classifyBounce(599, '599 Something went permanently wrong');
    expect(result.category).toBe('hard');
    expect(result.type).toBe('unknown');
    expect(result.retryable).toBe(false);
  });

  it('should classify content-rejected block', () => {
    const result = classifyBounce(550, '550 Content rejected - virus detected in attachment');
    expect(result.category).toBe('block');
    expect(result.type).toBe('content-rejected');
    expect(result.retryable).toBe(false);
  });

  it('should preserve enhanced code and diagnostic text', () => {
    const diagnostic = '550 5.1.1 The email account does not exist';
    const result = classifyBounce(550, diagnostic);
    expect(result.enhancedCode).toBe('5.1.1');
    expect(result.diagnosticCode).toBe(diagnostic);
    expect(result.statusCode).toBe(550);
  });
});

describe('Bounce Processor — parseDsn', () => {
  const dsnMessage = [
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns;mail.example.com',
    'Arrival-Date: Thu, 01 Jan 2026 00:00:00 +0000',
    '',
    'Final-Recipient: rfc822;user@example.com',
    'Action: failed',
    'Status: 5.1.1',
    'Diagnostic-Code: smtp;550 5.1.1 User unknown',
    'Remote-MTA: dns;mx.example.com',
  ].join('\n');

  it('should parse a valid DSN with one recipient', () => {
    const result = parseDsn(dsnMessage);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.reportingMta).toBe('mail.example.com');
    expect(result.value.recipients).toHaveLength(1);
    expect(result.value.recipients[0]!.finalRecipient).toBe('user@example.com');
    expect(result.value.recipients[0]!.action).toBe('failed');
    expect(result.value.recipients[0]!.status).toBe('5.1.1');
  });

  it('should parse a DSN with multiple recipients', () => {
    const multiDsn = [
      'Reporting-MTA: dns;mail.example.com',
      '',
      'Final-Recipient: rfc822;alice@example.com',
      'Action: failed',
      'Status: 5.1.1',
      '',
      'Final-Recipient: rfc822;bob@example.com',
      'Action: delayed',
      'Status: 4.2.2',
    ].join('\n');

    const result = parseDsn(multiDsn);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.recipients).toHaveLength(2);
    expect(result.value.recipients[0]!.finalRecipient).toBe('alice@example.com');
    expect(result.value.recipients[1]!.finalRecipient).toBe('bob@example.com');
    expect(result.value.recipients[1]!.status).toBe('4.2.2');
  });

  it('should fail for a message with no recipient status groups', () => {
    const result = parseDsn('This is not a DSN at all, just plain text.');
    expect(result.ok).toBe(false);
  });
});

describe('Bounce Processor — parseBounceMessage', () => {
  it('should parse a DSN-formatted bounce and classify bounces', () => {
    const raw = [
      'Reporting-MTA: dns;mail.example.com',
      '',
      'Final-Recipient: rfc822;user@gone.com',
      'Action: failed',
      'Status: 5.1.1',
      'Diagnostic-Code: smtp;550 5.1.1 User unknown',
    ].join('\n');

    const result = parseBounceMessage(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.recipient).toBe('user@gone.com');
    expect(result.value[0]!.category).toBe('hard');
    expect(result.value[0]!.type).toBe('invalid-recipient');
  });

  it('should fall back to heuristic parsing for non-DSN bounces', () => {
    const raw = 'The message to user@bounced.com failed with error 550 mailbox not found.';
    const result = parseBounceMessage(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(1);
    expect(result.value[0]!.recipient).toBe('user@bounced.com');
  });
});

describe('Bounce Processor — processBounce', () => {
  function makeBounceInfo(overrides?: Partial<BounceInfo>): BounceInfo {
    return {
      category: 'hard',
      type: 'invalid-recipient',
      statusCode: 550,
      enhancedCode: '5.1.1',
      diagnosticCode: '550 User unknown',
      retryable: false,
      recipient: 'user@example.com',
      timestamp: new Date(),
      ...overrides,
    };
  }

  it('should suppress immediately for hard bounces', () => {
    const action = processBounce(makeBounceInfo({ category: 'hard' }), 0, 5);
    expect(action.kind).toBe('suppress');
    if (action.kind !== 'suppress') return;
    expect(action.entry.address).toBe('user@example.com');
    expect(action.entry.reason).toBe('invalid-recipient');
  });

  it('should suppress immediately for block bounces', () => {
    const action = processBounce(
      makeBounceInfo({ category: 'block', type: 'spam-block' }),
      0,
      5,
    );
    expect(action.kind).toBe('suppress');
  });

  it('should retry for soft bounces when under max attempts', () => {
    const action = processBounce(
      makeBounceInfo({ category: 'soft', type: 'mailbox-full', retryable: true }),
      0,
      5,
    );
    expect(action.kind).toBe('retry');
    if (action.kind !== 'retry') return;
    expect(action.attempt).toBe(1);
    expect(action.retryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should suppress soft bounces when max attempts exhausted', () => {
    const action = processBounce(
      makeBounceInfo({ category: 'soft', type: 'mailbox-full', retryable: true }),
      5,
      5,
    );
    expect(action.kind).toBe('suppress');
  });

  it('should apply exponential backoff for retry delays', () => {
    const action0 = processBounce(
      makeBounceInfo({ category: 'transient', type: 'rate-limited', retryable: true }),
      0,
      10,
    );
    const action3 = processBounce(
      makeBounceInfo({ category: 'transient', type: 'rate-limited', retryable: true }),
      3,
      10,
    );

    expect(action0.kind).toBe('retry');
    expect(action3.kind).toBe('retry');
    if (action0.kind !== 'retry' || action3.kind !== 'retry') return;

    // Attempt 3 should have a later retry time than attempt 0
    // (accounting for jitter, the base delay is 60s * 2^attempt)
    expect(action3.retryAt.getTime()).toBeGreaterThan(action0.retryAt.getTime());
  });
});

describe('BounceProcessor class', () => {
  it('should track suppressions from processed bounces', () => {
    const processor = new BounceProcessor(5);

    const raw = [
      'Reporting-MTA: dns;mail.example.com',
      '',
      'Final-Recipient: rfc822;dead@example.com',
      'Action: failed',
      'Status: 5.1.1',
      'Diagnostic-Code: smtp;550 User unknown',
    ].join('\n');

    const result = processor.processIncoming(raw);
    expect(result.ok).toBe(true);

    expect(processor.isAddressSuppressed('dead@example.com')).toBe(true);
    expect(processor.isAddressSuppressed('alive@example.com')).toBe(false);
  });

  it('should be case-insensitive for suppression checks', () => {
    const processor = new BounceProcessor(5);
    processor.addSuppression({
      address: 'Test@Example.COM',
      reason: 'invalid-recipient',
      bounceCategory: 'hard',
      addedAt: new Date(),
      lastBounceAt: new Date(),
      bounceCount: 1,
    });

    expect(processor.isAddressSuppressed('test@example.com')).toBe(true);
  });

  it('should remove suppression entries', () => {
    const processor = new BounceProcessor(5);
    processor.addSuppression({
      address: 'user@example.com',
      reason: 'invalid-recipient',
      bounceCategory: 'hard',
      addedAt: new Date(),
      lastBounceAt: new Date(),
      bounceCount: 1,
    });

    expect(processor.removeSuppression('user@example.com')).toBe(true);
    expect(processor.isAddressSuppressed('user@example.com')).toBe(false);
  });
});
