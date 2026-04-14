import { describe, it, expect } from 'bun:test';
import {
  validateCustomHeaders,
  HEADER_INJECTION_REJECTED,
} from '../src/smtp/header-validator.js';

// ---------------------------------------------------------------------------
// Happy path — allowed headers
// ---------------------------------------------------------------------------

describe('validateCustomHeaders — allowed headers', () => {
  it('accepts an empty / null / undefined map', () => {
    expect(validateCustomHeaders(null).ok).toBe(true);
    expect(validateCustomHeaders(undefined).ok).toBe(true);
    expect(validateCustomHeaders({}).ok).toBe(true);
  });

  it('accepts X-Entity-Ref-ID', () => {
    const r = validateCustomHeaders({ 'X-Entity-Ref-ID': 'abc-123' });
    expect(r.ok).toBe(true);
  });

  it('accepts X-Campaign-ID', () => {
    const r = validateCustomHeaders({ 'X-Campaign-ID': 'q4-launch' });
    expect(r.ok).toBe(true);
  });

  it('accepts X-Mailer', () => {
    const r = validateCustomHeaders({ 'X-Mailer': 'MyApp 1.0' });
    expect(r.ok).toBe(true);
  });

  it('accepts List-Unsubscribe and List-Unsubscribe-Post', () => {
    const r = validateCustomHeaders({
      'List-Unsubscribe': '<https://example.com/u>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts References and In-Reply-To', () => {
    const r = validateCustomHeaders({
      'References': '<m1@example.com> <m2@example.com>',
      'In-Reply-To': '<m2@example.com>',
    });
    expect(r.ok).toBe(true);
  });

  it('accepts a properly-formatted Message-ID', () => {
    const r = validateCustomHeaders({ 'Message-ID': '<abc@example.com>' });
    expect(r.ok).toBe(true);
  });

  it('rejects a malformed Message-ID', () => {
    const r = validateCustomHeaders({ 'Message-ID': 'not-an-angle-addr' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Message-ID/);
  });
});

// ---------------------------------------------------------------------------
// X-Custom-* wildcard
// ---------------------------------------------------------------------------

describe('validateCustomHeaders — X-Custom-*', () => {
  it('accepts an X-Custom-* header', () => {
    const r = validateCustomHeaders({ 'X-Custom-Tenant': 'acme' });
    expect(r.ok).toBe(true);
  });

  it('accepts up to 10 X-Custom-* headers', () => {
    const headers: Record<string, string> = {};
    for (let i = 0; i < 10; i++) headers[`X-Custom-H${i}`] = `v${i}`;
    const r = validateCustomHeaders(headers);
    expect(r.ok).toBe(true);
  });

  it('rejects the 11th X-Custom-* header', () => {
    const headers: Record<string, string> = {};
    for (let i = 0; i < 11; i++) headers[`X-Custom-H${i}`] = `v${i}`;
    const r = validateCustomHeaders(headers);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/too many X-Custom/);
  });

  it('rejects an X-Custom-* header whose value exceeds 256 bytes', () => {
    const r = validateCustomHeaders({ 'X-Custom-Big': 'a'.repeat(257) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/256 bytes/);
  });
});

// ---------------------------------------------------------------------------
// Banned headers
// ---------------------------------------------------------------------------

describe('validateCustomHeaders — banned headers', () => {
  const banned = [
    'Bcc',
    'Cc',
    'To',
    'From',
    'Sender',
    'Reply-To',
    'Return-Path',
    'Received',
    'Authentication-Results',
    'DKIM-Signature',
    'Content-Type',
    'Content-Transfer-Encoding',
    'MIME-Version',
  ];

  for (const name of banned) {
    it(`rejects ${name}`, () => {
      const r = validateCustomHeaders({ [name]: 'x' });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.reason).toMatch(/reserved/i);
    });
  }

  it('rejects any Resent-* header', () => {
    const r = validateCustomHeaders({ 'Resent-From': 'a@b' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/Resent|reserved/i);
  });

  it('rejects any ARC-* header', () => {
    const r = validateCustomHeaders({ 'ARC-Seal': 'x' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/ARC|reserved/i);
  });

  it('rejects unknown headers that are not X-Custom-*', () => {
    const r = validateCustomHeaders({ 'X-Some-Random': 'v' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/allow list/);
  });
});

// ---------------------------------------------------------------------------
// CRLF / NUL injection
// ---------------------------------------------------------------------------

describe('validateCustomHeaders — CRLF injection', () => {
  it('rejects \\r in value (smuggled Bcc header)', () => {
    const r = validateCustomHeaders({
      'X-Entity-Ref-ID': 'abc\r\nBcc: evil@example.com',
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/CRLF/);
  });

  it('rejects \\n in value', () => {
    const r = validateCustomHeaders({ 'X-Campaign-ID': 'abc\nfoo' });
    expect(r.ok).toBe(false);
  });

  it('rejects NUL in value', () => {
    const r = validateCustomHeaders({ 'X-Campaign-ID': 'abc\0xyz' });
    expect(r.ok).toBe(false);
  });

  it('rejects \\r in header name', () => {
    const r = validateCustomHeaders({ 'X-Custom-A\r\nBcc': 'x' });
    expect(r.ok).toBe(false);
  });

  it('rejects NUL in header name', () => {
    const r = validateCustomHeaders({ 'X-Custom-A\0B': 'x' });
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Name/value shape
// ---------------------------------------------------------------------------

describe('validateCustomHeaders — name/value shape', () => {
  it('rejects header names containing spaces', () => {
    const r = validateCustomHeaders({ 'X Bad Name': 'v' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/invalid header name/);
  });

  it('rejects header names that do not start with a letter', () => {
    const r = validateCustomHeaders({ '1-Bad': 'v' });
    expect(r.ok).toBe(false);
  });

  it('rejects non-string values', () => {
    const r = validateCustomHeaders({
      'X-Custom-A': 123 as unknown as string,
    });
    expect(r.ok).toBe(false);
  });

  it('rejects a line exceeding RFC 5322 998 bytes', () => {
    const r = validateCustomHeaders({
      'X-Entity-Ref-ID': 'a'.repeat(1000),
    });
    expect(r.ok).toBe(false);
  });

  it('skips null/undefined values gracefully', () => {
    const r = validateCustomHeaders({
      'X-Entity-Ref-ID': 'ok',
      'X-Campaign-ID': null as unknown as string,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sanitized['X-Entity-Ref-ID']).toBe('ok');
    expect(r.sanitized['X-Campaign-ID']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error code constant
// ---------------------------------------------------------------------------

describe('HEADER_INJECTION_REJECTED constant', () => {
  it('is the stable API error code', () => {
    expect(HEADER_INJECTION_REJECTED).toBe('HEADER_INJECTION_REJECTED');
  });
});
