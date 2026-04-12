// =============================================================================
// @emailed/ai-engine — Deep Internet Scanner
// =============================================================================
// Checks blocklists (Spamhaus, Barracuda, etc.), WHOIS data, domain age,
// web presence, and social signals. Aggregates results into a risk score.

import type {
  InternetScanResult,
  BlocklistResult,
  WhoisData,
  WebPresenceResult,
  SocialSignalResult,
  Result,
} from '../types.js';

// ---------------------------------------------------------------------------
// Blocklist Configuration
// ---------------------------------------------------------------------------

export interface BlocklistProvider {
  readonly name: string;
  readonly dnsZone: string;
  readonly type: 'ip' | 'domain';
  readonly weight: number;
}

const DEFAULT_BLOCKLISTS: readonly BlocklistProvider[] = [
  // IP-based blocklists
  { name: 'Spamhaus ZEN', dnsZone: 'zen.spamhaus.org', type: 'ip', weight: 1.0 },
  { name: 'Spamhaus SBL', dnsZone: 'sbl.spamhaus.org', type: 'ip', weight: 0.9 },
  { name: 'Spamhaus XBL', dnsZone: 'xbl.spamhaus.org', type: 'ip', weight: 0.8 },
  { name: 'Spamhaus PBL', dnsZone: 'pbl.spamhaus.org', type: 'ip', weight: 0.5 },
  { name: 'Barracuda', dnsZone: 'b.barracudacentral.org', type: 'ip', weight: 0.8 },
  { name: 'SpamCop', dnsZone: 'bl.spamcop.net', type: 'ip', weight: 0.7 },
  { name: 'SORBS', dnsZone: 'dnsbl.sorbs.net', type: 'ip', weight: 0.6 },
  { name: 'CBL', dnsZone: 'cbl.abuseat.org', type: 'ip', weight: 0.7 },
  // Domain-based blocklists
  { name: 'Spamhaus DBL', dnsZone: 'dbl.spamhaus.org', type: 'domain', weight: 0.9 },
  { name: 'URIBL', dnsZone: 'multi.uribl.com', type: 'domain', weight: 0.7 },
  { name: 'SURBL', dnsZone: 'multi.surbl.org', type: 'domain', weight: 0.7 },
] as const;

// ---------------------------------------------------------------------------
// DNS Resolution Interface (injectable for testing)
// ---------------------------------------------------------------------------

export interface DnsResolver {
  /** Resolves A records. Returns IP addresses or empty array if NXDOMAIN. */
  resolve4(hostname: string): Promise<string[]>;
  /** Resolves TXT records. */
  resolveTxt(hostname: string): Promise<string[][]>;
  /** Resolves MX records. */
  resolveMx(hostname: string): Promise<{ priority: number; exchange: string }[]>;
}

// ---------------------------------------------------------------------------
// HTTP Client Interface (injectable for testing)
// ---------------------------------------------------------------------------

export interface HttpClient {
  get(url: string, options?: { timeout?: number }): Promise<{
    status: number;
    text(): Promise<string>;
    json(): Promise<unknown>;
  }>;
}

// ---------------------------------------------------------------------------
// Internet Scanner
// ---------------------------------------------------------------------------

export interface InternetScannerConfig {
  dnsResolver: DnsResolver;
  httpClient?: HttpClient;
  blocklists?: readonly BlocklistProvider[];
  /** Per-check timeout in milliseconds */
  timeoutMs?: number;
}

export class InternetScanner {
  private readonly dns: DnsResolver;
  private readonly http: HttpClient | undefined;
  private readonly blocklists: readonly BlocklistProvider[];
  private readonly timeoutMs: number;

  constructor(config: InternetScannerConfig) {
    this.dns = config.dnsResolver;
    this.http = config.httpClient;
    this.blocklists = config.blocklists ?? DEFAULT_BLOCKLISTS;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  /**
   * Run a full scan on a domain or IP address.
   */
  async scan(identifier: string): Promise<Result<InternetScanResult>> {
    const startTime = performance.now();

    try {
      const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(identifier);
      const domain = isIp ? undefined : identifier;

      // Run checks in parallel
      const [
        blocklistResults,
        whoisData,
        webPresence,
        socialSignals,
      ] = await Promise.all([
        this.checkBlocklists(identifier, isIp),
        domain ? this.lookupWhois(domain) : Promise.resolve(undefined),
        domain ? this.checkWebPresence(domain) : Promise.resolve(this.defaultWebPresence()),
        domain ? this.checkSocialSignals(domain) : Promise.resolve(this.defaultSocialSignals()),
      ]);

      // Domain age from WHOIS
      const domainAge = whoisData
        ? Math.floor((Date.now() - whoisData.registrationDate.getTime()) / (1000 * 60 * 60 * 24))
        : undefined;

      // Composite risk score
      const overallRisk = this.computeRiskScore(
        blocklistResults,
        domainAge,
        webPresence,
        socialSignals,
        whoisData,
      );

      return {
        ok: true,
        value: {
          identifier,
          scanTimestamp: Date.now(),
          blocklistResults,
          ...(whoisData !== undefined ? { whoisData } : {}),
          ...(domainAge !== undefined ? { domainAge } : {}),
          webPresence,
          socialSignals,
          overallRisk,
          scanDurationMs: performance.now() - startTime,
        },
      };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'INTERNET_SCAN_ERROR',
          message: err instanceof Error ? err.message : 'Unknown scan error',
          retryable: true,
        },
      };
    }
  }

  // -----------------------------------------------------------------------
  // Blocklist Checking
  // -----------------------------------------------------------------------

  private async checkBlocklists(
    identifier: string,
    isIp: boolean,
  ): Promise<BlocklistResult[]> {
    const applicableLists = this.blocklists.filter(
      (bl) => (isIp && bl.type === 'ip') || (!isIp && bl.type === 'domain'),
    );

    const queryIdentifier = isIp ? this.reverseIp(identifier) : identifier;

    const results = await Promise.allSettled(
      applicableLists.map(async (bl): Promise<BlocklistResult> => {
        const queryDomain = `${queryIdentifier}.${bl.dnsZone}`;
        try {
          const records = await this.withTimeout(
            this.dns.resolve4(queryDomain),
            this.timeoutMs,
          );
          // If we get A records back, the identifier is listed
          if (records.length > 0) {
            return {
              listName: bl.name,
              listed: true,
              reason: `Listed with response: ${records.join(', ')}`,
            };
          }
          return { listName: bl.name, listed: false };
        } catch {
          // NXDOMAIN or timeout means not listed
          return { listName: bl.name, listed: false };
        }
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<BlocklistResult> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  /**
   * Reverse an IPv4 address for DNSBL lookups.
   * e.g., 1.2.3.4 -> 4.3.2.1
   */
  private reverseIp(ip: string): string {
    return ip.split('.').reverse().join('.');
  }

  // -----------------------------------------------------------------------
  // WHOIS Lookup
  // -----------------------------------------------------------------------

  private async lookupWhois(domain: string): Promise<WhoisData | undefined> {
    if (!this.http) return undefined;

    try {
      // Use a WHOIS API endpoint. In production this would be an actual WHOIS
      // service or raw TCP WHOIS query. Here we use an HTTP-based lookup.
      const response = await this.withTimeout(
        this.http.get(`https://whois.emailed.internal/api/v1/lookup?domain=${encodeURIComponent(domain)}`, {
          timeout: this.timeoutMs,
        }),
        this.timeoutMs,
      );

      if (response.status !== 200) return undefined;

      const data = await response.json() as Record<string, unknown>;

      const country = data['country'] as string | undefined;
      return {
        registrar: (data['registrar'] as string) ?? 'Unknown',
        registrationDate: new Date((data['registrationDate'] as string) ?? 0),
        expirationDate: new Date((data['expirationDate'] as string) ?? 0),
        nameservers: (data['nameservers'] as string[]) ?? [],
        privacyProtected: (data['privacyProtected'] as boolean) ?? false,
        ...(country !== undefined ? { country } : {}),
      };
    } catch {
      return undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Web Presence
  // -----------------------------------------------------------------------

  private async checkWebPresence(domain: string): Promise<WebPresenceResult> {
    const results = await Promise.allSettled([
      this.checkWebsite(domain),
      this.checkMxRecords(domain),
      this.checkSsl(domain),
    ]);

    const websiteResult = results[0]?.status === 'fulfilled' ? results[0].value : false;
    const mxResult = results[1]?.status === 'fulfilled' ? results[1].value : false;
    const sslResult = results[2]?.status === 'fulfilled' ? results[2].value : undefined;

    return {
      hasWebsite: websiteResult,
      hasMxRecords: mxResult,
      hasSslCertificate: sslResult !== undefined,
      ...(sslResult !== undefined ? { sslGrade: sslResult } : {}),
    };
  }

  private async checkWebsite(domain: string): Promise<boolean> {
    if (!this.http) return false;
    try {
      const response = await this.withTimeout(
        this.http.get(`https://${domain}`, { timeout: this.timeoutMs }),
        this.timeoutMs,
      );
      return response.status >= 200 && response.status < 500;
    } catch {
      return false;
    }
  }

  private async checkMxRecords(domain: string): Promise<boolean> {
    try {
      const records = await this.withTimeout(
        this.dns.resolveMx(domain),
        this.timeoutMs,
      );
      return records.length > 0;
    } catch {
      return false;
    }
  }

  private async checkSsl(domain: string): Promise<string | undefined> {
    if (!this.http) return undefined;
    try {
      const response = await this.withTimeout(
        this.http.get(`https://${domain}`, { timeout: this.timeoutMs }),
        this.timeoutMs,
      );
      // If we successfully connected via HTTPS, SSL is valid
      return response.status >= 200 && response.status < 500 ? 'A' : undefined;
    } catch {
      return undefined;
    }
  }

  // -----------------------------------------------------------------------
  // Social Signals
  // -----------------------------------------------------------------------

  private async checkSocialSignals(domain: string): Promise<SocialSignalResult> {
    if (!this.http) return this.defaultSocialSignals();

    // Check for social media presence by probing well-known patterns
    const checks = await Promise.allSettled([
      this.probeUrl(`https://www.linkedin.com/company/${domain.split('.')[0]}`),
      this.probeUrl(`https://twitter.com/${domain.split('.')[0]}`),
      this.probeUrl(`https://www.facebook.com/${domain.split('.')[0]}`),
    ]);

    const hasLinkedIn = checks[0]?.status === 'fulfilled' && checks[0].value;
    const hasTwitter = checks[1]?.status === 'fulfilled' && checks[1].value;
    const hasFacebook = checks[2]?.status === 'fulfilled' && checks[2].value;

    const presenceCount = [hasLinkedIn, hasTwitter, hasFacebook].filter(Boolean).length;
    const presenceScore = presenceCount / 3 * 100;

    return {
      hasLinkedIn,
      hasTwitter,
      hasFacebook,
      domainMentions: 0, // Would require a search API
      presenceScore,
    };
  }

  private async probeUrl(url: string): Promise<boolean> {
    if (!this.http) return false;
    try {
      const response = await this.withTimeout(
        this.http.get(url, { timeout: this.timeoutMs }),
        this.timeoutMs,
      );
      return response.status >= 200 && response.status < 400;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Risk Score Computation
  // -----------------------------------------------------------------------

  private computeRiskScore(
    blocklistResults: readonly BlocklistResult[],
    domainAge: number | undefined,
    webPresence: WebPresenceResult,
    socialSignals: SocialSignalResult,
    whoisData: WhoisData | undefined,
  ): number {
    let risk = 0;

    // Blocklist listings (heaviest weight)
    const listedCount = blocklistResults.filter((r) => r.listed).length;
    const totalLists = blocklistResults.length;
    if (totalLists > 0) {
      risk += (listedCount / totalLists) * 0.50;
    }

    // Domain age: new domains are riskier
    if (domainAge !== undefined) {
      if (domainAge < 7) risk += 0.20;
      else if (domainAge < 30) risk += 0.15;
      else if (domainAge < 90) risk += 0.08;
      else if (domainAge < 180) risk += 0.03;
      // 180+ days: no additional risk
    } else {
      risk += 0.10; // Unknown age
    }

    // Web presence: lack of infrastructure is suspicious
    if (!webPresence.hasWebsite) risk += 0.05;
    if (!webPresence.hasMxRecords) risk += 0.05;
    if (!webPresence.hasSslCertificate) risk += 0.05;

    // Social signals: absence isn't conclusive but adds minor risk
    if (socialSignals.presenceScore < 33) risk += 0.03;

    // WHOIS privacy with new domain is riskier
    if (whoisData?.privacyProtected && domainAge !== undefined && domainAge < 30) {
      risk += 0.07;
    }

    return Math.min(1, Math.max(0, risk));
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private defaultWebPresence(): WebPresenceResult {
    return { hasWebsite: false, hasMxRecords: false, hasSslCertificate: false };
  }

  private defaultSocialSignals(): SocialSignalResult {
    return {
      hasLinkedIn: false,
      hasTwitter: false,
      hasFacebook: false,
      domainMentions: 0,
      presenceScore: 0,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
      ),
    ]);
  }
}
