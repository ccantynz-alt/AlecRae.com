import { describe, it, expect, beforeEach } from 'bun:test';
import { ThreatIntelScanner } from '../src/threat-intel/scanner.js';
import type { UrlReputationService, ThreatFeedProvider } from '../src/threat-intel/scanner.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeEmail(overrides: Record<string, unknown> = {}) {
  return {
    id: (overrides['id'] as string) ?? 'msg-1',
    receivedAt: new Date(),
    headers: {
      subject: (overrides['subject'] as string) ?? 'Hello',
      from: (overrides['from'] as Record<string, string>) ?? {
        address: 'sender@example.com',
        domain: 'example.com',
        name: 'Sender',
      },
      to: [{ address: 'user@alecrae.com', domain: 'alecrae.com', name: 'User' }],
      receivedChain: (overrides['receivedChain'] as unknown[]) ?? [
        { from: '10.0.0.1', by: '10.0.0.2', timestamp: new Date(), tlsVersion: 'TLSv1.3' },
      ],
    },
    content: {
      textBody: (overrides['textBody'] as string) ?? '',
      htmlBody: (overrides['htmlBody'] as string) ?? '',
      attachments: (overrides['attachments'] as unknown[]) ?? [],
    },
  } as never;
}

function makeMockUrlService(safe = true): UrlReputationService {
  return {
    check: async (_url: string) => ({ safe, category: safe ? undefined : 'phishing' }),
  };
}

// ---------------------------------------------------------------------------
// URL analysis
// ---------------------------------------------------------------------------

describe('ThreatIntelScanner - URL reputation', () => {
  let scanner: ThreatIntelScanner;

  beforeEach(() => {
    scanner = new ThreatIntelScanner({ enableSafeBrowsing: false });
  });

  it('should flag URLs with suspicious TLDs', async () => {
    const email = makeEmail({ textBody: 'Click here: http://evil-site.tk/login' });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.urlAnalysis.length).toBeGreaterThan(0);
      expect(result.value.urlAnalysis[0]!.reasons.some((r) => r.includes('Suspicious TLD'))).toBe(true);
    }
  });

  it('should flag URLs using raw IP addresses', async () => {
    const email = makeEmail({ textBody: 'Visit http://192.168.1.100/admin' });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const urlResult = result.value.urlAnalysis.find((u) => u.url.includes('192.168.1.100'));
      expect(urlResult).toBeDefined();
      expect(urlResult!.riskScore).toBeGreaterThan(0.2);
    }
  });

  it('should flag URLs matching malicious patterns', async () => {
    const email = makeEmail({ textBody: 'Verify: http://example.com/signin/verify.php?token=abc' });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.urlAnalysis.some((u) => u.reasons.some((r) => r.includes('malicious pattern')))).toBe(true);
    }
  });

  it('should use URL reputation service when enabled', async () => {
    const unsafeService = makeMockUrlService(false);
    const scannerWithService = new ThreatIntelScanner({
      urlReputationService: unsafeService,
      enableSafeBrowsing: true,
    });
    const email = makeEmail({ textBody: 'Click http://phishing.com/steal' });
    const result = await scannerWithService.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.urlAnalysis[0]!.safeBrowsingStatus).toBe('malicious');
    }
  });

  it('should return clean result for email with no URLs', async () => {
    const email = makeEmail({ textBody: 'Just a plain text email with no links.' });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.urlAnalysis.length).toBe(0);
      expect(result.value.overallRisk).toBe('clean');
    }
  });
});

// ---------------------------------------------------------------------------
// Attachment risk assessment
// ---------------------------------------------------------------------------

describe('ThreatIntelScanner - attachment risk', () => {
  let scanner: ThreatIntelScanner;

  beforeEach(() => {
    scanner = new ThreatIntelScanner({ enableSafeBrowsing: false });
  });

  it('should flag dangerous file extensions', async () => {
    const email = makeEmail({
      attachments: [
        { filename: 'malware.exe', contentType: 'application/octet-stream', size: 1024, hash: 'abc123' },
      ],
    });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attachmentAnalysis[0]!.isDangerous).toBe(true);
      expect(result.value.attachmentAnalysis[0]!.riskScore).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('should detect double extensions', async () => {
    const email = makeEmail({
      attachments: [
        { filename: 'invoice.pdf.exe', contentType: 'application/octet-stream', size: 2048, hash: 'def456' },
      ],
    });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attachmentAnalysis[0]!.hasDoubleExtension).toBe(true);
    }
  });

  it('should flag content type mismatch', async () => {
    const email = makeEmail({
      attachments: [
        { filename: 'report.pdf', contentType: 'application/octet-stream', size: 500, hash: 'ghi789' },
      ],
    });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attachmentAnalysis[0]!.reasons.some((r) => r.includes('content type'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// IOC matching
// ---------------------------------------------------------------------------

describe('ThreatIntelScanner - IOC matching', () => {
  let scanner: ThreatIntelScanner;

  beforeEach(() => {
    scanner = new ThreatIntelScanner({ enableSafeBrowsing: false });
  });

  it('should match sender domain against IOC database', async () => {
    scanner.addIOC(
      { type: 'domain', value: 'evil.com', confidence: 0.95 },
      'signal-1',
      'critical',
    );
    const email = makeEmail({
      from: { address: 'hacker@evil.com', domain: 'evil.com', name: 'Hacker' },
    });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.iocMatches.some((m) => m.iocValue === 'evil.com')).toBe(true);
    }
  });

  it('should match attachment hash against IOC database', async () => {
    scanner.addIOC(
      { type: 'hash', value: 'deadbeef', confidence: 0.9 },
      'signal-2',
      'high',
    );
    const email = makeEmail({
      attachments: [
        { filename: 'doc.pdf', contentType: 'application/pdf', size: 100, hash: 'deadbeef' },
      ],
    });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.iocMatches.some((m) => m.matchedIn === 'attachment')).toBe(true);
    }
  });

  it('should prune expired IOCs', () => {
    scanner.addIOC(
      { type: 'domain', value: 'old.com', confidence: 0.5 },
      'signal-old',
      'low',
    );
    // IOC was just added so shouldn't expire yet
    const removed = scanner.pruneExpiredIOCs();
    expect(removed).toBe(0);
    expect(scanner.getIOCCount()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Malware signature detection
// ---------------------------------------------------------------------------

describe('ThreatIntelScanner - malware signatures', () => {
  let scanner: ThreatIntelScanner;

  beforeEach(() => {
    scanner = new ThreatIntelScanner({ enableSafeBrowsing: false });
  });

  it('should detect known malware hash', () => {
    scanner.addMalwareHashes(['ABCDEF123456', 'deadbeef7890']);
    expect(scanner.isKnownMalware('abcdef123456')).toBe(true);
    expect(scanner.isKnownMalware('DEADBEEF7890')).toBe(true);
    expect(scanner.isKnownMalware('unknown')).toBe(false);
  });

  it('should flag attachment matching malware signature in scan', async () => {
    scanner.addMalwareHashes(['malwarehash123']);
    const email = makeEmail({
      attachments: [
        { filename: 'update.exe', contentType: 'application/octet-stream', size: 4096, hash: 'malwarehash123' },
      ],
    });
    const result = await scanner.scan(email);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.attachmentAnalysis[0]!.matchedSignature).toBe('malwarehash123');
      expect(result.value.overallRisk).not.toBe('clean');
    }
  });
});

// ---------------------------------------------------------------------------
// Threat feed management
// ---------------------------------------------------------------------------

describe('ThreatIntelScanner - threat feeds', () => {
  it('should register and poll threat feeds', async () => {
    const scanner = new ThreatIntelScanner({ enableSafeBrowsing: false });
    const mockProvider: ThreatFeedProvider = {
      fetch: async () => [
        {
          id: 'ts-1',
          type: 'phishing',
          source: 'test-feed',
          severity: 'high' as const,
          status: 'active' as const,
          firstSeen: Date.now(),
          lastSeen: Date.now(),
          affectedCount: 10,
          indicators: [{ type: 'domain' as const, value: 'phish.com', confidence: 0.9 }],
        },
      ],
    };
    scanner.registerFeed(
      { id: 'feed-1', name: 'Test Feed', url: 'http://test', type: 'commercial', updateFrequency: 3600 },
      mockProvider,
    );
    expect(scanner.getRegisteredFeeds().length).toBe(1);

    const result = await scanner.pollFeeds();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totalSignals).toBe(1);
      expect(result.value.feedResults[0]!.feedName).toBe('Test Feed');
    }
    // IOC should now be ingested
    expect(scanner.getIOCCount()).toBeGreaterThan(0);
  });
});
