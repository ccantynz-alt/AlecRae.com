/**
 * @alecrae/reputation — Blocklist Monitor
 *
 * Continuously monitors IP addresses and domains against major DNS-based
 * blocklists (DNSBLs). When a listing is detected, the monitor:
 *
 *  1. Creates an alert with severity and remediation steps
 *  2. Generates an automated delisting request (where supported)
 *  3. Tracks listing/delisting state over time
 *  4. Notifies the reputation engine so scores can be adjusted
 *
 * Supported blocklists include Spamhaus (SBL, XBL, PBL), Barracuda,
 * SpamCop, SORBS, UCEProtect, and many others.
 */

import type {
  Blocklist,
  BlocklistCheckResult,
  BlocklistAlert,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default check interval in milliseconds (every 15 minutes) */
const DEFAULT_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Timeout for a single DNS lookup in milliseconds */
const DNS_LOOKUP_TIMEOUT_MS = 5_000;

/** Maximum concurrent DNSBL checks */
const MAX_CONCURRENT_CHECKS = 10;

// ---------------------------------------------------------------------------
// Well-Known Blocklists
// ---------------------------------------------------------------------------

const WELL_KNOWN_BLOCKLISTS: readonly Blocklist[] = [
  {
    id: 'spamhaus-sbl',
    name: 'Spamhaus SBL',
    dnsZone: 'sbl.spamhaus.org',
    type: 'ip',
    severity: 'critical',
    description: 'Spamhaus Block List — verified spam sources',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/sbl/removal/',
  },
  {
    id: 'spamhaus-xbl',
    name: 'Spamhaus XBL',
    dnsZone: 'xbl.spamhaus.org',
    type: 'ip',
    severity: 'critical',
    description: 'Spamhaus Exploits Block List — compromised hosts',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/xbl/removal/',
  },
  {
    id: 'spamhaus-pbl',
    name: 'Spamhaus PBL',
    dnsZone: 'pbl.spamhaus.org',
    type: 'ip',
    severity: 'medium',
    description: 'Spamhaus Policy Block List — dynamic/residential IPs',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/pbl/removal/',
  },
  {
    id: 'spamhaus-dbl',
    name: 'Spamhaus DBL',
    dnsZone: 'dbl.spamhaus.org',
    type: 'domain',
    severity: 'critical',
    description: 'Spamhaus Domain Block List — spam domains',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/dbl/removal/',
  },
  {
    id: 'barracuda',
    name: 'Barracuda BRBL',
    dnsZone: 'b.barracudacentral.org',
    type: 'ip',
    severity: 'high',
    description: 'Barracuda Reputation Block List',
    lookupMethod: 'dns',
    delistUrl: 'https://www.barracudacentral.org/rbl/removal-request',
  },
  {
    id: 'spamcop',
    name: 'SpamCop',
    dnsZone: 'bl.spamcop.net',
    type: 'ip',
    severity: 'high',
    description: 'SpamCop Blocking List — user-reported spam sources',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamcop.net/bl.shtml',
  },
  {
    id: 'sorbs-spam',
    name: 'SORBS Spam',
    dnsZone: 'spam.dnsbl.sorbs.net',
    type: 'ip',
    severity: 'medium',
    description: 'SORBS — hosts that have sent spam',
    lookupMethod: 'dns',
    delistUrl: 'http://www.sorbs.net/delisting/',
  },
  {
    id: 'uceprotect-1',
    name: 'UCEProtect Level 1',
    dnsZone: 'dnsbl-1.uceprotect.net',
    type: 'ip',
    severity: 'medium',
    description: 'UCEProtect Level 1 — single IP listings',
    lookupMethod: 'dns',
    delistUrl: 'https://www.uceprotect.net/en/index.php?m=7&s=0',
  },
  {
    id: 'cbl',
    name: 'Composite Blocking List',
    dnsZone: 'cbl.abuseat.org',
    type: 'ip',
    severity: 'high',
    description: 'CBL — detected sending spam or virus-infected traffic',
    lookupMethod: 'dns',
    delistUrl: 'https://www.abuseat.org/lookup.cgi',
  },
  {
    id: 'surbl',
    name: 'SURBL',
    dnsZone: 'multi.surbl.org',
    type: 'domain',
    severity: 'high',
    description: 'SURBL — domains found in spam message bodies',
    lookupMethod: 'dns',
    delistUrl: 'https://www.surbl.org/surbl-analysis',
  },
] as const;

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ---------------------------------------------------------------------------
// DNS Resolver Interface
// ---------------------------------------------------------------------------

/**
 * Abstraction over DNS resolution for testability.
 * In production, wraps Node's dns.promises.resolve4.
 */
export interface DnsResolver {
  resolve4(hostname: string): Promise<string[]>;
}

// ---------------------------------------------------------------------------
// Delisting Request
// ---------------------------------------------------------------------------

export interface DelistingRequest {
  blocklist: Blocklist;
  listedValue: string;
  requestUrl: string;
  generatedAt: Date;
  instructions: string[];
}

// ---------------------------------------------------------------------------
// Monitor Configuration
// ---------------------------------------------------------------------------

export interface BlocklistMonitorConfig {
  /** DNS resolver implementation */
  resolver: DnsResolver;
  /** Check interval in milliseconds */
  checkIntervalMs?: number;
  /** Additional blocklists beyond the well-known defaults */
  additionalBlocklists?: Blocklist[];
  /** Blocklist IDs to exclude from monitoring */
  excludeBlocklists?: string[];
  /** Maximum concurrent DNS lookups */
  maxConcurrent?: number;
}

// ---------------------------------------------------------------------------
// Blocklist Monitor
// ---------------------------------------------------------------------------

/**
 * Monitors IP addresses and domains against DNS-based blocklists.
 *
 * Maintains a registry of blocklists to check, runs periodic checks,
 * and manages alert state for listings and delistings.
 */
export class BlocklistMonitor {
  private readonly resolver: DnsResolver;
  private readonly checkIntervalMs: number;
  private readonly maxConcurrent: number;
  private readonly blocklists: Blocklist[];

  /** IPs and domains being monitored */
  private readonly monitoredIps = new Set<string>();
  private readonly monitoredDomains = new Set<string>();

  /** Active alerts keyed by "blocklistId::listedValue" */
  private readonly activeAlerts = new Map<string, BlocklistAlert>();

  /** Full check result history */
  private readonly checkHistory: BlocklistCheckResult[] = [];

  /** Timer for periodic checks */
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  /** Monotonic alert counter */
  private alertCounter = 0;

  constructor(config: BlocklistMonitorConfig) {
    this.resolver = config.resolver;
    this.checkIntervalMs = config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.maxConcurrent = config.maxConcurrent ?? MAX_CONCURRENT_CHECKS;

    // Build effective blocklist set
    const excludeSet = new Set(config.excludeBlocklists ?? []);
    this.blocklists = [
      ...WELL_KNOWN_BLOCKLISTS.filter((bl) => !excludeSet.has(bl.id)),
      ...(config.additionalBlocklists ?? []),
    ];
  }

  /**
   * Add an IP address to the monitoring set.
   */
  addIp(ipAddress: string): void {
    this.monitoredIps.add(ipAddress);
  }

  /**
   * Remove an IP address from monitoring.
   */
  removeIp(ipAddress: string): void {
    this.monitoredIps.delete(ipAddress);
  }

  /**
   * Add a domain to the monitoring set.
   */
  addDomain(domain: string): void {
    this.monitoredDomains.add(domain.toLowerCase());
  }

  /**
   * Remove a domain from monitoring.
   */
  removeDomain(domain: string): void {
    this.monitoredDomains.delete(domain.toLowerCase());
  }

  /**
   * Check a single IP address against all relevant blocklists.
   * Returns results for each blocklist checked.
   */
  async checkIp(ipAddress: string): Promise<Result<BlocklistCheckResult[]>> {
    const ipBlocklists = this.blocklists.filter((bl) => bl.type === 'ip' || bl.type === 'both');
    return this.runChecks(ipAddress, 'ip', ipBlocklists);
  }

  /**
   * Check a single domain against all relevant blocklists.
   */
  async checkDomain(domain: string): Promise<Result<BlocklistCheckResult[]>> {
    const domainBlocklists = this.blocklists.filter((bl) => bl.type === 'domain' || bl.type === 'both');
    return this.runChecks(domain.toLowerCase(), 'domain', domainBlocklists);
  }

  /**
   * Run a full check across all monitored IPs and domains.
   * Updates alert state and returns all results.
   */
  async checkAll(): Promise<Result<BlocklistCheckResult[]>> {
    const allResults: BlocklistCheckResult[] = [];

    // Check all IPs
    for (const ip of this.monitoredIps) {
      const result = await this.checkIp(ip);
      if (result.ok) {
        allResults.push(...result.value);
      }
    }

    // Check all domains
    for (const domain of this.monitoredDomains) {
      const result = await this.checkDomain(domain);
      if (result.ok) {
        allResults.push(...result.value);
      }
    }

    return ok(allResults);
  }

  /**
   * Start continuous monitoring at the configured interval.
   */
  startMonitoring(): void {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(async () => {
      await this.checkAll();
    }, this.checkIntervalMs);
  }

  /**
   * Stop continuous monitoring.
   */
  stopMonitoring(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Generate a delisting request for a specific blocklist listing.
   */
  generateDelistingRequest(
    blocklistId: string,
    listedValue: string,
  ): Result<DelistingRequest> {
    const blocklist = this.blocklists.find((bl) => bl.id === blocklistId);
    if (!blocklist) {
      return err(new Error(`Blocklist "${blocklistId}" not found`));
    }

    if (!blocklist.delistUrl) {
      return err(new Error(`Blocklist "${blocklist.name}" does not have a delisting URL`));
    }

    const instructions = this.buildDelistingInstructions(blocklist, listedValue);

    return ok({
      blocklist,
      listedValue,
      requestUrl: blocklist.delistUrl,
      generatedAt: new Date(),
      instructions,
    });
  }

  /**
   * Get all active alerts (current listings).
   */
  getActiveAlerts(): BlocklistAlert[] {
    return [...this.activeAlerts.values()].filter((a) => a.status === 'active');
  }

  /**
   * Get all alerts for a specific IP or domain.
   */
  getAlertsFor(value: string): BlocklistAlert[] {
    return [...this.activeAlerts.values()].filter((a) => a.listedValue === value);
  }

  /**
   * Mark an alert as being resolved (delisting in progress).
   */
  markResolving(alertId: string): Result<BlocklistAlert> {
    for (const alert of this.activeAlerts.values()) {
      if (alert.id === alertId) {
        alert.status = 'resolving';
        return ok(alert);
      }
    }
    return err(new Error(`Alert "${alertId}" not found`));
  }

  /**
   * Get the full check history.
   */
  getCheckHistory(): readonly BlocklistCheckResult[] {
    return this.checkHistory;
  }

  /**
   * Get the list of configured blocklists.
   */
  getBlocklists(): readonly Blocklist[] {
    return this.blocklists;
  }

  /**
   * Get the count of currently listed IPs/domains (active alerts).
   */
  getListingCount(): number {
    return [...this.activeAlerts.values()].filter((a) => a.status === 'active').length;
  }

  // ─── Internal ───

  /**
   * Run blocklist checks for a value against a set of blocklists.
   * Uses concurrency limiting to avoid overwhelming DNS.
   */
  private async runChecks(
    value: string,
    type: 'ip' | 'domain',
    blocklists: Blocklist[],
  ): Promise<Result<BlocklistCheckResult[]>> {
    const results: BlocklistCheckResult[] = [];

    // Process in batches to limit concurrency
    for (let i = 0; i < blocklists.length; i += this.maxConcurrent) {
      const batch = blocklists.slice(i, i + this.maxConcurrent);

      const batchResults = await Promise.allSettled(
        batch.map((bl) => this.checkSingleBlocklist(value, type, bl)),
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const checkResult = settled.value;
          results.push(checkResult);
          this.checkHistory.push(checkResult);

          // Update alert state
          this.updateAlertState(checkResult);
        }
        // DNS timeouts/failures are silently skipped — will retry next cycle
      }
    }

    return ok(results);
  }

  /**
   * Check a single value against a single blocklist via DNS lookup.
   *
   * For IP-based DNSBLs, the IP octets are reversed and appended to the
   * blocklist zone (e.g., 1.2.3.4 becomes 4.3.2.1.bl.spamhaus.org).
   *
   * For domain-based DNSBLs, the domain is prepended to the zone
   * (e.g., example.com becomes example.com.dbl.spamhaus.org).
   */
  private async checkSingleBlocklist(
    value: string,
    type: 'ip' | 'domain',
    blocklist: Blocklist,
  ): Promise<BlocklistCheckResult> {
    let lookupHost: string;

    if (type === 'ip') {
      const reversed = value.split('.').reverse().join('.');
      lookupHost = `${reversed}.${blocklist.dnsZone}`;
    } else {
      lookupHost = `${value}.${blocklist.dnsZone}`;
    }

    try {
      const addresses = await this.resolveWithTimeout(lookupHost, DNS_LOOKUP_TIMEOUT_MS);

      // A response means the value is listed
      const returnCode = addresses[0];
      const reason = this.interpretReturnCode(blocklist, returnCode);

      return {
        blocklist,
        listed: true,
        listedValue: value,
        ...(returnCode !== undefined ? { returnCode } : {}),
        reason,
        checkedAt: new Date(),
      };
    } catch {
      // NXDOMAIN or timeout means NOT listed
      return {
        blocklist,
        listed: false,
        listedValue: value,
        checkedAt: new Date(),
      };
    }
  }

  /**
   * Resolve a DNS hostname with a timeout.
   */
  private async resolveWithTimeout(hostname: string, timeoutMs: number): Promise<string[]> {
    return Promise.race([
      this.resolver.resolve4(hostname),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs),
      ),
    ]);
  }

  /**
   * Update alert state based on a check result.
   */
  private updateAlertState(result: BlocklistCheckResult): void {
    const alertKey = `${result.blocklist.id}::${result.listedValue}`;

    if (result.listed) {
      // New listing or still listed
      if (!this.activeAlerts.has(alertKey)) {
        this.alertCounter++;
        const alert: BlocklistAlert = {
          id: `bl-alert-${this.alertCounter}-${Date.now()}`,
          blocklist: result.blocklist,
          listedValue: result.listedValue,
          detectedAt: new Date(),
          status: 'active',
          remediationSteps: this.buildRemediationSteps(result.blocklist, result.listedValue),
        };
        this.activeAlerts.set(alertKey, alert);
      }
    } else {
      // No longer listed — resolve the alert
      const existing = this.activeAlerts.get(alertKey);
      if (existing && existing.status !== 'resolved') {
        existing.status = 'resolved';
        existing.resolvedAt = new Date();
      }
    }
  }

  /**
   * Interpret DNSBL return codes into human-readable reasons.
   * Common return codes: 127.0.0.2 = listed, 127.0.0.10 = PBL, etc.
   */
  private interpretReturnCode(blocklist: Blocklist, returnCode: string | undefined): string {
    if (!returnCode) return 'Listed (no return code)';

    const codeMap: Record<string, Record<string, string>> = {
      'spamhaus-sbl': {
        '127.0.0.2': 'Direct UBE sources',
        '127.0.0.3': 'Spam support services',
        '127.0.0.9': 'DROP (Do Not Route or Peer)',
      },
      'spamhaus-xbl': {
        '127.0.0.4': 'CBL (exploited host)',
        '127.0.0.5': 'CBL (exploited host)',
        '127.0.0.6': 'CBL (exploited host)',
        '127.0.0.7': 'CBL (exploited host)',
      },
      'spamhaus-pbl': {
        '127.0.0.10': 'ISP maintained (dynamic IP)',
        '127.0.0.11': 'Spamhaus maintained',
      },
    };

    const blocklistCodes = codeMap[blocklist.id];
    if (blocklistCodes) {
      const reason = blocklistCodes[returnCode];
      if (reason) return reason;
    }

    return `Listed on ${blocklist.name} (code: ${returnCode})`;
  }

  /**
   * Build remediation steps for a blocklist listing.
   */
  private buildRemediationSteps(blocklist: Blocklist, value: string): string[] {
    const steps: string[] = [];

    steps.push(`IP/Domain ${value} is listed on ${blocklist.name}`);
    steps.push(`Severity: ${blocklist.severity.toUpperCase()}`);

    switch (blocklist.severity) {
      case 'critical':
        steps.push('IMMEDIATE ACTION REQUIRED — this listing will severely impact deliverability');
        steps.push('Investigate the root cause (compromised account, spam complaints, open relay)');
        steps.push('Fix the underlying issue before requesting delisting');
        break;
      case 'high':
        steps.push('ACTION REQUIRED — this listing impacts deliverability to major ISPs');
        steps.push('Review recent sending patterns and complaint rates');
        break;
      case 'medium':
        steps.push('Review recommended — this listing may affect deliverability');
        break;
      case 'low':
        steps.push('Monitor — this listing has minimal deliverability impact');
        break;
    }

    if (blocklist.delistUrl) {
      steps.push(`Submit delisting request at: ${blocklist.delistUrl}`);
    } else {
      steps.push('No automated delisting available — listing expires automatically after root cause is fixed');
    }

    steps.push('After delisting, monitor for re-listing over the next 48 hours');

    return steps;
  }

  /**
   * Build detailed delisting instructions for a specific blocklist.
   */
  private buildDelistingInstructions(blocklist: Blocklist, value: string): string[] {
    const instructions: string[] = [];

    instructions.push(`Request delisting of ${value} from ${blocklist.name}`);
    instructions.push(`Visit: ${blocklist.delistUrl ?? 'N/A'}`);

    switch (blocklist.id) {
      case 'spamhaus-sbl':
      case 'spamhaus-xbl':
      case 'spamhaus-pbl':
      case 'spamhaus-dbl':
        instructions.push('Enter the IP/domain in the Spamhaus lookup tool');
        instructions.push('Follow the removal instructions provided');
        instructions.push('Spamhaus typically processes requests within 24 hours');
        break;
      case 'barracuda':
        instructions.push('Submit removal request with your IP address');
        instructions.push('Provide contact information and reason for delisting');
        instructions.push('Barracuda typically processes within 12 hours');
        break;
      case 'spamcop':
        instructions.push('SpamCop listings are temporary (24-48 hours)');
        instructions.push('Fix the spam source and listings will expire automatically');
        break;
      default:
        instructions.push('Follow the instructions on the blocklist removal page');
        instructions.push('Ensure the root cause has been resolved before requesting removal');
        break;
    }

    instructions.push('IMPORTANT: Ensure the root cause has been fixed before requesting removal');
    instructions.push('Repeated listings may result in longer delisting times');

    return instructions;
  }
}
