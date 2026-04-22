// =============================================================================
// @alecrae/ai-engine — Real-Time Threat Intelligence Scanner
// =============================================================================
// Scans emails for threat indicators: malicious URLs, dangerous attachments,
// known malware signatures, and emerging attack patterns. Integrates with
// external threat feeds and maintains a local IOC (Indicator of Compromise)
// database for fast matching.

import type {
  EmailMessage,
  EmailAttachment,
  ThreatSignal,
  ThreatIndicator,
  ThreatFeed,
  Result,
  AIEngineError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_VERSION = '1.0.0';

/** Maximum age (ms) before a threat signal is considered stale */
const SIGNAL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** High-risk attachment extensions */
const DANGEROUS_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.scr', '.bat', '.cmd', '.com', '.pif', '.msi', '.msp',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.ps1xml', '.ps2', '.ps2xml', '.psc1', '.psc2',
  '.reg', '.inf', '.lnk', '.dll', '.cpl', '.hta', '.jar',
  '.iso', '.img', '.vhd', '.vhdx',
]);

/** Suspicious but not always dangerous extensions */
const SUSPICIOUS_EXTENSIONS: ReadonlySet<string> = new Set([
  '.doc', '.docm', '.xls', '.xlsm', '.ppt', '.pptm',
  '.zip', '.rar', '.7z', '.gz', '.tar', '.cab',
  '.pdf', '.rtf', '.html', '.htm', '.svg',
]);

/** Double extension patterns commonly used in malware */
const DOUBLE_EXTENSION_PATTERN = /\.\w{2,4}\.(exe|scr|bat|cmd|com|pif|vbs|js|ps1)$/i;

/** Known malicious URL path patterns */
const MALICIOUS_URL_PATTERNS: readonly RegExp[] = [
  /\/wp-content\/plugins\/.*\.php\?/i,
  /\/admin\/.*login.*\.php/i,
  /\/(signin|verify|secure|update|confirm|account).*\.(php|html)/i,
  /\/\.well-known\/.*\.php/i,
  /\/cgi-bin\/.*\.cgi/i,
  /\/(dropbox|google|microsoft|apple|amazon|paypal|netflix).*\.(tk|ml|ga|cf|gq)/i,
];

/** Domains associated with known phishing infrastructure */
const SUSPICIOUS_TLDS: ReadonlySet<string> = new Set([
  '.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.work',
  '.click', '.link', '.info', '.biz', '.buzz', '.rest',
]);

// ---------------------------------------------------------------------------
// Threat Scan Result Types
// ---------------------------------------------------------------------------

export interface ThreatScanResult {
  readonly emailId: string;
  readonly overallRisk: 'clean' | 'low' | 'medium' | 'high' | 'critical';
  readonly riskScore: number;
  readonly urlAnalysis: readonly UrlThreatResult[];
  readonly attachmentAnalysis: readonly AttachmentThreatResult[];
  readonly iocMatches: readonly IOCMatch[];
  readonly emergingThreatMatches: readonly EmergingThreatMatch[];
  readonly signals: readonly ThreatSignal[];
  readonly processingTimeMs: number;
  readonly modelVersion: string;
}

export interface UrlThreatResult {
  readonly url: string;
  readonly riskScore: number;
  readonly reasons: readonly string[];
  readonly isMalicious: boolean;
  readonly redirectsDetected: boolean;
  readonly domainAge?: number;
  readonly safeBrowsingStatus: 'safe' | 'suspicious' | 'malicious' | 'unknown';
}

export interface AttachmentThreatResult {
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly riskScore: number;
  readonly reasons: readonly string[];
  readonly isDangerous: boolean;
  readonly hasDoubleExtension: boolean;
  readonly matchedSignature?: string;
}

export interface IOCMatch {
  readonly iocType: ThreatIndicator['type'];
  readonly iocValue: string;
  readonly matchedIn: 'url' | 'header' | 'body' | 'attachment' | 'sender';
  readonly threatSignalId: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly confidence: number;
}

export interface EmergingThreatMatch {
  readonly patternId: string;
  readonly description: string;
  readonly confidence: number;
  readonly firstSeenGlobally: number;
  readonly affectedCount: number;
}

// ---------------------------------------------------------------------------
// IOC Database
// ---------------------------------------------------------------------------

interface IOCEntry {
  readonly indicator: ThreatIndicator;
  readonly threatSignalId: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly addedAt: number;
  readonly expiresAt: number;
}

// ---------------------------------------------------------------------------
// Threat Feed Integration
// ---------------------------------------------------------------------------

export interface ThreatFeedProvider {
  /** Fetch latest threat signals from the feed */
  fetch(): Promise<readonly ThreatSignal[]>;
}

interface RegisteredFeed {
  readonly feed: ThreatFeed;
  readonly provider: ThreatFeedProvider;
}

// ---------------------------------------------------------------------------
// URL Reputation Service Interface
// ---------------------------------------------------------------------------

export interface UrlReputationService {
  /** Check a URL against safe browsing databases */
  check(url: string): Promise<{ safe: boolean; category?: string }>;
}

// ---------------------------------------------------------------------------
// Threat Intel Scanner
// ---------------------------------------------------------------------------

export interface ThreatIntelScannerConfig {
  /** Optional URL reputation checking service */
  readonly urlReputationService?: UrlReputationService;
  /** Maximum number of URLs to check per email (to bound latency) */
  readonly maxUrlChecks?: number;
  /** TTL for threat signals in milliseconds */
  readonly signalTtlMs?: number;
  /** Enable or disable safe browsing checks */
  readonly enableSafeBrowsing?: boolean;
}

export class ThreatIntelScanner {
  private readonly iocDatabase = new Map<string, IOCEntry>();
  private readonly threatSignals = new Map<string, ThreatSignal>();
  private readonly registeredFeeds: RegisteredFeed[] = [];
  private readonly config: ThreatIntelScannerConfig;
  private readonly knownMalwareHashes = new Set<string>();

  constructor(config: ThreatIntelScannerConfig = {}) {
    this.config = config;
  }

  // -----------------------------------------------------------------------
  // Public API — Scanning
  // -----------------------------------------------------------------------

  /**
   * Perform a comprehensive threat scan on an email.
   */
  async scan(email: EmailMessage): Promise<Result<ThreatScanResult>> {
    const startTime = performance.now();

    try {
      // Extract all URLs from the email
      const urls = this.extractUrls(email);

      // Run analyses in parallel
      const [urlResults, attachmentResults] = await Promise.all([
        this.analyzeUrls(urls),
        Promise.resolve(this.analyzeAttachments(email.content.attachments)),
      ]);

      // IOC matching
      const iocMatches = this.matchIOCs(email);

      // Emerging threat pattern matching
      const emergingThreatMatches = this.matchEmergingThreats(email);

      // Collect relevant threat signals
      const signals = this.collectRelevantSignals(email);

      // Compute overall risk
      const riskScore = this.computeOverallRisk(
        urlResults,
        attachmentResults,
        iocMatches,
        emergingThreatMatches,
      );

      const overallRisk = this.deriveRiskLevel(riskScore);

      const result: ThreatScanResult = {
        emailId: email.id,
        overallRisk,
        riskScore: Math.round(riskScore * 1000) / 1000,
        urlAnalysis: urlResults,
        attachmentAnalysis: attachmentResults,
        iocMatches,
        emergingThreatMatches,
        signals,
        processingTimeMs: performance.now() - startTime,
        modelVersion: MODEL_VERSION,
      };

      return { ok: true, value: result };
    } catch (err) {
      const error: AIEngineError = {
        code: 'THREAT_SCAN_ERROR',
        message: err instanceof Error ? err.message : 'Unknown threat scan error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  // -----------------------------------------------------------------------
  // Public API — IOC Management
  // -----------------------------------------------------------------------

  /** Add a single IOC to the local database */
  addIOC(
    indicator: ThreatIndicator,
    threatSignalId: string,
    severity: IOCEntry['severity'],
  ): void {
    const key = `${indicator.type}:${indicator.value}`;
    this.iocDatabase.set(key, {
      indicator,
      threatSignalId,
      severity,
      addedAt: Date.now(),
      expiresAt: Date.now() + (this.config.signalTtlMs ?? SIGNAL_TTL_MS),
    });
  }

  /** Bulk-add IOCs from a threat signal */
  ingestThreatSignal(signal: ThreatSignal): void {
    this.threatSignals.set(signal.id, signal);

    for (const indicator of signal.indicators) {
      this.addIOC(indicator, signal.id, signal.severity);
    }
  }

  /** Remove expired IOCs from the database */
  pruneExpiredIOCs(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.iocDatabase) {
      if (entry.expiresAt < now) {
        this.iocDatabase.delete(key);
        removed++;
      }
    }

    return removed;
  }

  /** Get the current IOC database size */
  getIOCCount(): number {
    return this.iocDatabase.size;
  }

  // -----------------------------------------------------------------------
  // Public API — Malware Signatures
  // -----------------------------------------------------------------------

  /** Register known malware file hashes */
  addMalwareHashes(hashes: readonly string[]): void {
    for (const hash of hashes) {
      this.knownMalwareHashes.add(hash.toLowerCase());
    }
  }

  /** Check if a file hash matches a known malware signature */
  isKnownMalware(hash: string): boolean {
    return this.knownMalwareHashes.has(hash.toLowerCase());
  }

  // -----------------------------------------------------------------------
  // Public API — Threat Feed Management
  // -----------------------------------------------------------------------

  /** Register a threat feed for periodic polling */
  registerFeed(feed: ThreatFeed, provider: ThreatFeedProvider): void {
    this.registeredFeeds.push({ feed, provider });
  }

  /** Get all registered threat feeds */
  getRegisteredFeeds(): readonly ThreatFeed[] {
    return this.registeredFeeds.map((rf) => rf.feed);
  }

  /**
   * Poll all registered threat feeds and ingest new signals.
   * Returns the total number of new signals ingested.
   */
  async pollFeeds(): Promise<Result<{ totalSignals: number; feedResults: readonly { feedName: string; signalCount: number }[] }>> {
    try {
      const feedResults: { feedName: string; signalCount: number }[] = [];
      let totalSignals = 0;

      const pollPromises = this.registeredFeeds.map(async (rf) => {
        try {
          const signals = await rf.provider.fetch();
          for (const signal of signals) {
            this.ingestThreatSignal(signal);
          }
          return { feedName: rf.feed.name, signalCount: signals.length };
        } catch {
          return { feedName: rf.feed.name, signalCount: 0 };
        }
      });

      const results = await Promise.allSettled(pollPromises);
      for (const result of results) {
        if (result.status === 'fulfilled') {
          feedResults.push(result.value);
          totalSignals += result.value.signalCount;
        }
      }

      return { ok: true, value: { totalSignals, feedResults } };
    } catch (err) {
      const error: AIEngineError = {
        code: 'FEED_POLL_ERROR',
        message: err instanceof Error ? err.message : 'Unknown feed poll error',
        retryable: true,
      };
      return { ok: false, error };
    }
  }

  // -----------------------------------------------------------------------
  // Private — URL Analysis
  // -----------------------------------------------------------------------

  private async analyzeUrls(urls: readonly string[]): Promise<UrlThreatResult[]> {
    const maxChecks = this.config.maxUrlChecks ?? 20;
    const urlsToCheck = urls.slice(0, maxChecks);
    const results: UrlThreatResult[] = [];

    for (const url of urlsToCheck) {
      const result = await this.analyzeUrl(url);
      results.push(result);
    }

    return results;
  }

  private async analyzeUrl(url: string): Promise<UrlThreatResult> {
    const reasons: string[] = [];
    let riskScore = 0;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // Check against suspicious TLDs
      for (const tld of SUSPICIOUS_TLDS) {
        if (hostname.endsWith(tld)) {
          reasons.push(`Suspicious TLD: ${tld}`);
          riskScore += 0.2;
          break;
        }
      }

      // IP address instead of domain
      if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
        reasons.push('URL uses raw IP address instead of domain');
        riskScore += 0.35;
      }

      // Check malicious URL patterns
      for (const pattern of MALICIOUS_URL_PATTERNS) {
        if (pattern.test(url)) {
          reasons.push('URL matches known malicious pattern');
          riskScore += 0.4;
          break;
        }
      }

      // Excessive subdomain depth
      const subdomainCount = hostname.split('.').length;
      if (subdomainCount > 4) {
        reasons.push(`Excessive subdomain depth (${subdomainCount} levels)`);
        riskScore += 0.15;
      }

      // Non-standard port
      if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
        reasons.push(`Non-standard port: ${parsed.port}`);
        riskScore += 0.15;
      }

      // Data URI or javascript URI (XSS vector)
      if (/^(data|javascript):/i.test(url)) {
        reasons.push('Data or JavaScript URI scheme detected');
        riskScore += 0.6;
      }

      // Encoded characters in hostname (possible IDN attack)
      if (/%[0-9a-f]{2}/i.test(hostname)) {
        reasons.push('Percent-encoded characters in hostname');
        riskScore += 0.25;
      }

      // Check IOC database for this domain/URL
      const domainIOC = this.iocDatabase.get(`domain:${hostname}`);
      const urlIOC = this.iocDatabase.get(`url:${url}`);
      if (domainIOC) {
        reasons.push(`Domain matched IOC: ${domainIOC.threatSignalId}`);
        riskScore += 0.5;
      }
      if (urlIOC) {
        reasons.push(`URL matched IOC: ${urlIOC.threatSignalId}`);
        riskScore += 0.6;
      }

      // Safe browsing check
      let safeBrowsingStatus: UrlThreatResult['safeBrowsingStatus'] = 'unknown';
      if (this.config.enableSafeBrowsing !== false && this.config.urlReputationService) {
        try {
          const reputation = await this.config.urlReputationService.check(url);
          safeBrowsingStatus = reputation.safe ? 'safe' : 'malicious';
          if (!reputation.safe) {
            reasons.push(`Safe browsing flagged: ${reputation.category ?? 'malicious'}`);
            riskScore += 0.5;
          }
        } catch {
          safeBrowsingStatus = 'unknown';
        }
      }

      return {
        url,
        riskScore: Math.min(1, riskScore),
        reasons,
        isMalicious: riskScore >= 0.5,
        redirectsDetected: false, // Would require HTTP client in production
        safeBrowsingStatus,
      };
    } catch {
      return {
        url,
        riskScore: 0.3,
        reasons: ['Malformed URL'],
        isMalicious: false,
        redirectsDetected: false,
        safeBrowsingStatus: 'unknown',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Private — Attachment Analysis
  // -----------------------------------------------------------------------

  private analyzeAttachments(
    attachments: readonly EmailAttachment[],
  ): AttachmentThreatResult[] {
    return attachments.map((attachment) => this.analyzeAttachment(attachment));
  }

  private analyzeAttachment(attachment: EmailAttachment): AttachmentThreatResult {
    const reasons: string[] = [];
    let riskScore = 0;
    const filename = attachment.filename.toLowerCase();
    const ext = this.getExtension(filename);

    // Dangerous extension check
    if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
      reasons.push(`Dangerous file extension: ${ext}`);
      riskScore += 0.7;
    } else if (ext && SUSPICIOUS_EXTENSIONS.has(ext)) {
      reasons.push(`Suspicious file extension: ${ext}`);
      riskScore += 0.2;
    }

    // Double extension check
    const hasDoubleExtension = DOUBLE_EXTENSION_PATTERN.test(filename);
    if (hasDoubleExtension) {
      reasons.push('Double extension detected — common malware technique');
      riskScore += 0.6;
    }

    // Content-type / extension mismatch
    if (ext && this.hasContentTypeMismatch(ext, attachment.contentType)) {
      reasons.push('File extension does not match content type');
      riskScore += 0.35;
    }

    // Known malware hash check
    const matchedSignature = this.knownMalwareHashes.has(attachment.hash.toLowerCase())
      ? attachment.hash
      : undefined;

    if (matchedSignature) {
      reasons.push('File hash matches known malware signature');
      riskScore += 0.9;
    }

    // IOC hash check
    const hashIOC = this.iocDatabase.get(`hash:${attachment.hash.toLowerCase()}`);
    if (hashIOC) {
      reasons.push(`Hash matched IOC: ${hashIOC.threatSignalId}`);
      riskScore += 0.7;
    }

    // Unusually large attachments
    if (attachment.size > 25 * 1024 * 1024) {
      reasons.push('Unusually large attachment (>25MB)');
      riskScore += 0.1;
    }

    return {
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      riskScore: Math.min(1, riskScore),
      reasons,
      isDangerous: riskScore >= 0.5,
      hasDoubleExtension,
      ...(matchedSignature !== undefined ? { matchedSignature } : {}),
    };
  }

  // -----------------------------------------------------------------------
  // Private — IOC Matching
  // -----------------------------------------------------------------------

  private matchIOCs(email: EmailMessage): IOCMatch[] {
    const matches: IOCMatch[] = [];
    const now = Date.now();

    // Check sender
    const senderAddress = email.headers.from.address.toLowerCase();
    const senderDomain = email.headers.from.domain.toLowerCase();

    this.checkIOC('email', senderAddress, 'sender', matches, now);
    this.checkIOC('domain', senderDomain, 'sender', matches, now);

    // Check sender IP (from received chain)
    const firstReceived = email.headers.receivedChain[0];
    if (firstReceived) {
      this.checkIOC('ip', firstReceived.from, 'header', matches, now);
    }

    // Check URLs in body
    const urls = this.extractUrls(email);
    for (const url of urls) {
      this.checkIOC('url', url, 'url', matches, now);
      try {
        const hostname = new URL(url).hostname.toLowerCase();
        this.checkIOC('domain', hostname, 'url', matches, now);
      } catch {
        // Malformed URL — skip domain check
      }
    }

    // Check attachment hashes
    for (const attachment of email.content.attachments) {
      this.checkIOC('hash', attachment.hash.toLowerCase(), 'attachment', matches, now);
    }

    return matches;
  }

  private checkIOC(
    type: ThreatIndicator['type'],
    value: string,
    matchedIn: IOCMatch['matchedIn'],
    matches: IOCMatch[],
    now: number,
  ): void {
    const key = `${type}:${value}`;
    const entry = this.iocDatabase.get(key);

    if (entry && entry.expiresAt > now) {
      matches.push({
        iocType: type,
        iocValue: value,
        matchedIn,
        threatSignalId: entry.threatSignalId,
        severity: entry.severity,
        confidence: entry.indicator.confidence,
      });
    }
  }

  // -----------------------------------------------------------------------
  // Private — Emerging Threat Detection
  // -----------------------------------------------------------------------

  private matchEmergingThreats(email: EmailMessage): EmergingThreatMatch[] {
    const matches: EmergingThreatMatch[] = [];
    const now = Date.now();
    const recentThreshold = 72 * 60 * 60 * 1000; // 72 hours

    for (const signal of this.threatSignals.values()) {
      // Only consider recent, active signals
      if (signal.status !== 'active') continue;
      if (now - signal.lastSeen > recentThreshold) continue;

      // Check if any indicators match this email
      let matched = false;
      for (const indicator of signal.indicators) {
        if (this.indicatorMatchesEmail(indicator, email)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        matches.push({
          patternId: signal.id,
          description: `${signal.type}: ${signal.source}`,
          confidence: signal.indicators.reduce((max, i) => Math.max(max, i.confidence), 0),
          firstSeenGlobally: signal.firstSeen,
          affectedCount: signal.affectedCount,
        });
      }
    }

    return matches;
  }

  private indicatorMatchesEmail(
    indicator: ThreatIndicator,
    email: EmailMessage,
  ): boolean {
    const value = indicator.value.toLowerCase();

    switch (indicator.type) {
      case 'email':
        return email.headers.from.address.toLowerCase() === value;
      case 'domain':
        return email.headers.from.domain.toLowerCase() === value;
      case 'ip':
        return email.headers.receivedChain.some(
          (h) => h.from.toLowerCase().includes(value),
        );
      case 'url': {
        const urls = this.extractUrls(email);
        return urls.some((u) => u.toLowerCase().includes(value));
      }
      case 'hash':
        return email.content.attachments.some(
          (a) => a.hash.toLowerCase() === value,
        );
      case 'pattern': {
        const text = `${email.headers.subject} ${email.content.textBody ?? ''}`.toLowerCase();
        return text.includes(value);
      }
      default:
        return false;
    }
  }

  // -----------------------------------------------------------------------
  // Private — Risk Computation
  // -----------------------------------------------------------------------

  private computeOverallRisk(
    urlResults: readonly UrlThreatResult[],
    attachmentResults: readonly AttachmentThreatResult[],
    iocMatches: readonly IOCMatch[],
    emergingThreats: readonly EmergingThreatMatch[],
  ): number {
    let maxUrlRisk = 0;
    for (const r of urlResults) {
      maxUrlRisk = Math.max(maxUrlRisk, r.riskScore);
    }

    let maxAttachmentRisk = 0;
    for (const r of attachmentResults) {
      maxAttachmentRisk = Math.max(maxAttachmentRisk, r.riskScore);
    }

    let iocRisk = 0;
    for (const m of iocMatches) {
      const severityScore =
        m.severity === 'critical' ? 1.0 :
        m.severity === 'high' ? 0.8 :
        m.severity === 'medium' ? 0.5 : 0.3;
      iocRisk = Math.max(iocRisk, severityScore * m.confidence);
    }

    let emergingRisk = 0;
    for (const t of emergingThreats) {
      emergingRisk = Math.max(emergingRisk, t.confidence * 0.7);
    }

    // Take the maximum across all categories — a single critical finding
    // should dominate the overall score
    const overall = Math.max(maxUrlRisk, maxAttachmentRisk, iocRisk, emergingRisk);
    return Math.max(0, Math.min(1, overall));
  }

  private deriveRiskLevel(score: number): ThreatScanResult['overallRisk'] {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.35) return 'medium';
    if (score >= 0.15) return 'low';
    return 'clean';
  }

  // -----------------------------------------------------------------------
  // Private — Utility Helpers
  // -----------------------------------------------------------------------

  private extractUrls(email: EmailMessage): string[] {
    const text = `${email.content.textBody ?? ''} ${email.content.htmlBody ?? ''}`;
    const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
    return [...text.matchAll(urlRegex)].map((m) => m[0]);
  }

  private getExtension(filename: string): string | undefined {
    const match = filename.match(/(\.[a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase();
  }

  private hasContentTypeMismatch(ext: string, contentType: string): boolean {
    const expectedTypes: ReadonlyMap<string, readonly string[]> = new Map([
      ['.pdf', ['application/pdf']],
      ['.doc', ['application/msword']],
      ['.docx', ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']],
      ['.xls', ['application/vnd.ms-excel']],
      ['.xlsx', ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']],
      ['.zip', ['application/zip', 'application/x-zip-compressed']],
      ['.jpg', ['image/jpeg']],
      ['.png', ['image/png']],
      ['.gif', ['image/gif']],
    ]);

    const expected = expectedTypes.get(ext);
    if (!expected) return false;

    return !expected.some((ct) => contentType.toLowerCase().includes(ct));
  }

  private collectRelevantSignals(email: EmailMessage): ThreatSignal[] {
    const relevant: ThreatSignal[] = [];

    for (const signal of this.threatSignals.values()) {
      if (signal.status !== 'active') continue;

      for (const indicator of signal.indicators) {
        if (this.indicatorMatchesEmail(indicator, email)) {
          relevant.push(signal);
          break;
        }
      }
    }

    return relevant;
  }
}
