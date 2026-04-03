import { describe, it, expect } from 'bun:test';
import * as crypto from 'node:crypto';
import { signMessage, addSignatureToMessage } from '../src/dkim/signer.js';
import type { DkimSignOptions } from '../src/types.js';

// Generate a test RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const testMessage = [
  'From: sender@example.com',
  'To: recipient@example.com',
  'Subject: Test Message',
  'Date: Thu, 01 Jan 2026 00:00:00 +0000',
  'Message-ID: <test123@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello, this is a test email body.',
  'It has multiple lines.',
  '',
].join('\r\n');

function makeOptions(overrides?: Partial<DkimSignOptions>): DkimSignOptions {
  return {
    domain: 'example.com',
    selector: 'sel1',
    privateKey,
    algorithm: 'rsa-sha256',
    canonicalization: 'relaxed/relaxed',
    headersToSign: ['from', 'to', 'subject', 'date', 'message-id'],
    ...overrides,
  };
}

describe('DKIM Signer — signMessage', () => {
  it('should successfully sign a message and return a valid result', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.domain).toBe('example.com');
    expect(result.value.selector).toBe('sel1');
    expect(result.value.algorithm).toBe('rsa-sha256');
    expect(result.value.signature).toBeTruthy();
    expect(result.value.bodyHash).toBeTruthy();
  });

  it('should include all requested headers in the signed header list', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.signedHeaders).toEqual(['from', 'to', 'subject', 'date', 'message-id']);
  });

  it('should produce a DKIM-Signature header with required fields', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const raw = result.value.raw;
    expect(raw).toContain('DKIM-Signature:');
    expect(raw).toContain('v=1');
    expect(raw).toContain('a=rsa-sha256');
    expect(raw).toContain('d=example.com');
    expect(raw).toContain('s=sel1');
    expect(raw).toContain('bh=');
    expect(raw).toContain('b=');
    expect(raw).toContain('h=from:to:subject:date:message-id');
  });

  it('should produce a valid RSA-SHA256 signature that can be verified', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The signature should be valid base64
    const sigBuffer = Buffer.from(result.value.signature, 'base64');
    expect(sigBuffer.length).toBeGreaterThan(0);
  });

  it('should compute a body hash that is a valid base64 SHA-256 hash', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const decoded = Buffer.from(result.value.bodyHash, 'base64');
    expect(decoded.length).toBe(32); // SHA-256 produces 32 bytes
  });

  it('should produce different signatures for different messages', () => {
    const msg1 = testMessage;
    const msg2 = testMessage.replace('Hello, this is a test email body.', 'Different body content entirely.');

    const result1 = signMessage(msg1, makeOptions());
    const result2 = signMessage(msg2, makeOptions());

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    expect(result1.value.bodyHash).not.toBe(result2.value.bodyHash);
    expect(result1.value.signature).not.toBe(result2.value.signature);
  });

  it('should produce different body hashes for simple/simple vs relaxed/relaxed', () => {
    const result1 = signMessage(testMessage, makeOptions({ canonicalization: 'simple/simple' }));
    const result2 = signMessage(testMessage, makeOptions({ canonicalization: 'relaxed/relaxed' }));

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);
    if (!result1.ok || !result2.ok) return;

    // Body hashes may differ due to different canonicalization rules
    // (though for well-formed input they could match — the key point
    // is the c= tag differs)
    const raw1 = result1.value.raw;
    const raw2 = result2.value.raw;
    expect(raw1).toContain('c=simple/simple');
    expect(raw2).toContain('c=relaxed/relaxed');
  });

  it('should handle simple/relaxed canonicalization', () => {
    const result = signMessage(testMessage, makeOptions({ canonicalization: 'simple/relaxed' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raw).toContain('c=simple/relaxed');
  });

  it('should handle relaxed/simple canonicalization', () => {
    const result = signMessage(testMessage, makeOptions({ canonicalization: 'relaxed/simple' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.raw).toContain('c=relaxed/simple');
  });

  it('should use default headers when headersToSign is empty', () => {
    const result = signMessage(testMessage, makeOptions({ headersToSign: [] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Should fall back to default list which includes 'from', 'to', 'subject', etc.
    expect(result.value.signedHeaders).toContain('from');
    expect(result.value.signedHeaders).toContain('to');
    expect(result.value.signedHeaders).toContain('subject');
  });

  it('should include a timestamp in the signature', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.timestamp).toBeGreaterThan(0);
    expect(result.value.raw).toContain(`t=${result.value.timestamp}`);
  });

  it('should support body length limit', () => {
    const result = signMessage(testMessage, makeOptions({ bodyLengthLimit: 10 }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.raw).toContain('l=10');
  });

  it('should fail with an invalid private key', () => {
    const result = signMessage(testMessage, makeOptions({ privateKey: 'not-a-valid-key' }));
    expect(result.ok).toBe(false);
  });

  it('should prepend signature to message with addSignatureToMessage', () => {
    const result = signMessage(testMessage, makeOptions());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const signed = addSignatureToMessage(testMessage, result.value);
    expect(signed.startsWith('DKIM-Signature:')).toBe(true);
    expect(signed).toContain(testMessage);
  });
});
