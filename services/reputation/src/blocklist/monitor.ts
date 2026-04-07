import type {
  Blocklist,
  BlocklistCheckResult,
  BlocklistAlert,
} from '../types';

// ─── Result Pattern ──────────────────────────────────────────────────────────

type Result<T, E = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── DNS Resolver Interface ──────────────────────────────────────────────────

/** Abstraction over DNS lookups so we can inject test doubles */
export interface DnsResolver {
  resolve4(hostname: string): Promise<string[]>;
  resolveTxt(hostname: string): Promise<string[][]>;
}

// ─── Default Major Blocklists ────────────────────────────────────────────────

const MAJOR_BLOCKLISTS: Blocklist[] = [
  {
    id: 'spamhaus-sbl',
    name: 'Spamhaus SBL',
    dnsZone: 'sbl.spamhaus.org',
    type: 'ip',
    severity: 'critical',
    description: 'Spamhaus Block List — verified spam sources and spam services',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/sbl/removal/form/',
  },
  {
    id: 'spamhaus-xbl',
    name: 'Spamhaus XBL',
    dnsZone: 'xbl.spamhaus.org',
    type: 'ip',
    severity: 'critical',
    description: 'Spamhaus Exploits Block List — hijacked PCs and compromised hosts',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/xbl/removal/form/',
  },
  {
    id: 'spamhaus-pbl',
    name: 'Spamhaus PBL',
    dnsZone: 'pbl.spamhaus.org',
    type: 'ip',
    severity: 'high',
    description: 'Spamhaus Policy Block List — dynamic/residential IP ranges',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/pbl/removal/form/',
  },
  {
    id: 'spamhaus-dbl',
    name: 'Spamhaus DBL',
    dnsZone: 'dbl.spamhaus.org',
    type: 'domain',
    severity: 'critical',
    description: 'Spamhaus Domain Block List — domains found in spam',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamhaus.org/dbl/removal/form/',
  },
  {
    id: 'barracuda',
    name: 'Barracuda Reputation Block List',
    dnsZone: 'b.barracudacentral.org',
    type: 'ip',
    severity: 'high',
    description: 'Barracuda Networks IP reputation database',
    lookupMethod: 'dns',
    delistUrl: 'https://www.barracudacentral.org/rbl/removal-request',
  },
  {
    id: 'sorbs-spam',
    name: 'SORBS Spam',
    dnsZone: 'spam.dnsbl.sorbs.net',
    type: 'ip',
    severity: 'medium',
    description: 'SORBS aggregate zone — hosts that have been caught sending spam',
    lookupMethod: 'dns',
    delistUrl: 'http://www.sorbs.net/cgi-bin/support',
  },
  {
    id: 'sorbs-recent',
    name: 'SORBS Recent Spam',
    dnsZone: 'new.spam.dnsbl.sorbs.net',
    type: 'ip',
    severity: 'medium',
    description: 'SORBS list of recent spam senders (last 48 hours)',
    lookupMethod: 'dns',
    delistUrl: 'http://www.sorbs.net/cgi-bin/support',
  },
  {
    id: 'spamcop',
    name: 'SpamCop',
    dnsZone: 'bl.spamcop.net',
    type: 'ip',
    severity: 'high',
    description: 'SpamCop Blocking List — based on user reports',
    lookupMethod: 'dns',
    delistUrl: 'https://www.spamcop.net/bl.shtml',
  },
  {
    id: 'cbl',
    name: 'Composite Blocking List',
    dnsZone: 'cbl.abuseat.org',
    type: 'ip',
    severity: 'high',
    description: 'CBL — detects botnet/compromised host sending patterns',
    lookupMethod: 'dns',
    delistUrl: 'https://www.abuseat.org/lookup.cgi',
  },
  {
    id: 'uribl',
    name: 'URIBL',
    dnsZone: 'multi.uribl.com',
    type: 'domain',
    severity: 'high',
    description: 'URI-based blocklist for domains found in spam messages',
    lookupMethod: 'dns',
    delistUrl: 'https://admin.uribl.com/',
  },
  {
    id: 'surbl',
    name: 'SURBL',
    dnsZone: 'multi.surbl.org',
    type: 'domain',
    severity: 'high',
    description: 'SURBL — detects domains appearing in unsolicited messages',
    lookupMethod: 'dns',
    delistUrl: 'https://www.surbl.org/surbl-analysis',
  },
  {
    id: 'invaluement',
    name: 'Invaluement',
    dnsZone: 'sip.invaluement.com',
    type: 'ip',
    severity: 'medium',
    description: 'Invaluement anti-spam DNSBL',
    lookupMethod: 'dns',
    delistUrl: 'https://www.invaluement.com/removal/',
  },
];

// ─── Blocklist Monitor ───────────────────────────────────────────────────────

export class BlocklistMonitor {
  private readonly blocklists: Map<string, Blocklist>;
  private readonly alerts: Map<string, BlocklistAlert> = new Map();
  private readonly checkResults: Map<string, BlocklistCheckResult[]> = new Map();
  private readonly resolver: DnsResolver;
  private readonly checkIntervalMs: number;
  private readonly maxResultsPerValue: number;
  private nextAlertId = 1;

  constructor(options: {
    resolver: DnsResolver;
    additionalBlocklists?: Blocklist[];
    excludeBlocklists?: string[];
    checkIntervalMs?: number;
    maxResultsPerValue?: number;
  }) {
    this.resolver = options.resolver;
    this.checkIntervalMs = options.checkIntervalMs ?? 30 * 60 * 1000; // 30 minutes default
    this.maxResultsPerValue = options.maxResultsPerValue ?? 500;

    // Build blocklist registry
    this.blocklists = new Map();
    const excludeSet = new Set(options.excludeBlocklists ?? []);

    for (const bl of MAJOR_BLOCKLISTS) {
      if (!excludeSet.has(bl.id)) {
        this.blocklists.set(bl.id, bl);
      }
    }

    if (options.additionalBlocklists) {
      for (const bl of options.additionalBlocklists) {
        this.blocklists.set(bl.id, bl);
      }
    }
  }

  /** Get all configured blocklists */
  getBlocklists(): Blocklist[] {
    return Array.from(this.blocklists.values());
  }

  /** Get a specific blocklist by ID */
  getBlocklist(id: string): Blocklist | undefined {
    return this.blocklists.get(id);
  }

  /** Check a single IP against all configured IP blocklists */
  async checkIp(ipAddress: string): Promise<Result<BlocklistCheckResult[]>> {
    const validation = this.validateIpAddress(ipAddress);
    if (!validation.ok) return validation;

    const ipBlocklists = Array.from(this.blocklists.values()).filter(
      bl => bl.type === 'ip' || bl.type === 'both',
    );

    const results = await this.checkValueAgainstBlocklists(ipAddress, ipBlocklists, 'ip');
    this.storeResults(ipAddress, results);
    this.evaluateAlerts(ipAddress, results);

    return ok(results);
  }

  /** Check a domain against all configured domain blocklists */
  async checkDomain(domain: string): Promise<Result<BlocklistCheckResult[]>> {
    if (!domain || domain.trim().length === 0) {
      return err('Domain is required');
    }

    const domainBlocklists = Array.from(this.blocklists.values()).filter(
      bl => bl.type === 'domain' || bl.type === 'both',
    );

    const results = await this.checkValueAgainstBlocklists(domain, domainBlocklists, 'domain');
    this.storeResults(domain, results);
    this.evaluateAlerts(domain, results);

    return ok(results);
  }

  /** Check a single IP against a specific blocklist */
  async checkIpAgainstBlocklist(
    ipAddress: string,
    blocklistId: string,
  ): Promise<Result<BlocklistCheckResult>> {
    const bl = this.blocklists.get(blocklistId);
    if (!bl) {
      return err(`Blocklist '${blocklistId}' not found`);
    }

    const validation = this.validateIpAddress(ipAddress);
    if (!validation.ok) {
      return err(validation.error);
    }

    const result = await this.performDnsLookup(ipAddress, bl, 'ip');
    return ok(result);
  }

  /** Check multiple IPs and domains in a batch */
  async checkBatch(
    ips: string[],
    domains: string[],
  ): Promise<Result<{
    ipResults: Map<string, BlocklistCheckResult[]>;
    domainResults: Map<string, BlocklistCheckResult[]>;
    newAlerts: BlocklistAlert[];
  }>> {
    const ipResults = new Map<string, BlocklistCheckResult[]>();
    const domainResults = new Map<string, BlocklistCheckResult[]>();
    const alertsBefore = new Set(this.alerts.keys());

    // Run all checks in parallel
    const ipPromises = ips.map(async ip => {
      const result = await this.checkIp(ip);
      if (result.ok) {
        ipResults.set(ip, result.value);
      }
    });

    const domainPromises = domains.map(async domain => {
      const result = await this.checkDomain(domain);
      if (result.ok) {
        domainResults.set(domain, result.value);
      }
    });

    await Promise.all([...ipPromises, ...domainPromises]);

    // Find new alerts
    const newAlerts: BlocklistAlert[] = [];
    for (const [id, alert] of this.alerts) {
      if (!alertsBefore.has(id)) {
        newAlerts.push(alert);
      }
    }

    return ok({ ipResults, domainResults, newAlerts });
  }

  // ─── Alert Management ──────────────────────────────────────────────────────

  /** Get all active alerts */
  getActiveAlerts(): BlocklistAlert[] {
    const results: BlocklistAlert[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.status === 'active' || alert.status === 'resolving') {
        results.push(alert);
      }
    }
    return results;
  }

  /** Get all alerts (including resolved) */
  getAllAlerts(): BlocklistAlert[] {
    return Array.from(this.alerts.values());
  }

  /** Mark an alert as resolving (delisting in progress) */
  markAlertResolving(alertId: string): Result<BlocklistAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return err(`Alert '${alertId}' not found`);
    }

    if (alert.status === 'resolved') {
      return err('Alert is already resolved');
    }

    alert.status = 'resolving';
    return ok(alert);
  }

  /** Mark an alert as resolved */
  resolveAlert(alertId: string): Result<BlocklistAlert> {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return err(`Alert '${alertId}' not found`);
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date();
    return ok(alert);
  }

  /** Get remediation steps for a specific blocklist */
  getRemediationSteps(blocklistId: string): Result<string[]> {
    const bl = this.blocklists.get(blocklistId);
    if (!bl) {
      return err(`Blocklist '${blocklistId}' not found`);
    }

    return ok(this.buildRemediationSteps(bl));
  }

  /** Get the configured check interval in milliseconds */
  getCheckIntervalMs(): number {
    return this.checkIntervalMs;
  }

  /** Get historical check results for a value */
  getCheckHistory(value: string): BlocklistCheckResult[] {
    return this.checkResults.get(value) ?? [];
  }

  /** Get a summary of current listing status across all monitored values */
  getListingSummary(): {
    totalChecked: number;
    totalListed: number;
    listingsByBlocklist: Map<string, string[]>;
    listingsBySeverity: Record<string, number>;
  } {
    const listingsByBlocklist = new Map<string, string[]>();
    const listingsBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const listedValues = new Set<string>();
    const checkedValues = new Set<string>();

    for (const [value, results] of this.checkResults) {
      checkedValues.add(value);
      for (const result of results) {
        if (result.listed) {
          listedValues.add(value);
          const existing = listingsByBlocklist.get(result.blocklist.id) ?? [];
          existing.push(value);
          listingsByBlocklist.set(result.blocklist.id, existing);

          const severity = result.blocklist.severity;
          listingsBySeverity[severity] = (listingsBySeverity[severity] ?? 0) + 1;
        }
      }
    }

    return {
      totalChecked: checkedValues.size,
      totalListed: listedValues.size,
      listingsByBlocklist,
      listingsBySeverity,
    };
  }

  // ─── Private Methods ────────────────────────────────────────────────────────

  private async checkValueAgainstBlocklists(
    value: string,
    blocklists: Blocklist[],
    type: 'ip' | 'domain',
  ): Promise<BlocklistCheckResult[]> {
    const promises = blocklists.map(bl => this.performDnsLookup(value, bl, type));
    return Promise.all(promises);
  }

  private async performDnsLookup(
    value: string,
    blocklist: Blocklist,
    type: 'ip' | 'domain',
  ): Promise<BlocklistCheckResult> {
    const queryName = type === 'ip'
      ? `${this.reverseIp(value)}.${blocklist.dnsZone}`
      : `${value}.${blocklist.dnsZone}`;

    try {
      const addresses = await this.resolver.resolve4(queryName);

      if (addresses.length === 0) {
        return {
          blocklist,
          listed: false,
          listedValue: value,
          checkedAt: new Date(),
        };
      }

      // A result means the value IS listed. The return code indicates the reason.
      const returnCode = addresses[0];
      let reason: string | undefined;

      // Try to get a TXT record for the reason
      try {
        const txtRecords = await this.resolver.resolveTxt(queryName);
        if (txtRecords.length > 0) {
          const firstRecord = txtRecords[0];
          if (firstRecord && firstRecord.length > 0) {
            reason = firstRecord.join(' ');
          }
        }
      } catch {
        // TXT lookup failure is non-critical
      }

      return {
        blocklist,
        listed: true,
        listedValue: value,
        returnCode,
        reason,
        checkedAt: new Date(),
      };
    } catch {
      // NXDOMAIN or lookup failure means NOT listed
      return {
        blocklist,
        listed: false,
        listedValue: value,
        checkedAt: new Date(),
      };
    }
  }

  private reverseIp(ip: string): string {
    // Reverse the octets of an IPv4 address for DNSBL lookup
    return ip.split('.').reverse().join('.');
  }

  private validateIpAddress(ip: string): Result<void> {
    if (!ip || ip.trim().length === 0) {
      return err('IP address is required');
    }

    // Basic IPv4 validation
    const parts = ip.split('.');
    if (parts.length !== 4) {
      return err(`Invalid IPv4 address: ${ip}`);
    }

    for (const part of parts) {
      const num = Number(part);
      if (isNaN(num) || num < 0 || num > 255 || part !== String(num)) {
        return err(`Invalid IPv4 address: ${ip}`);
      }
    }

    return ok(undefined);
  }

  private storeResults(value: string, results: BlocklistCheckResult[]): void {
    const existing = this.checkResults.get(value) ?? [];
    existing.push(...results);

    // Trim to max size
    while (existing.length > this.maxResultsPerValue) {
      existing.shift();
    }

    this.checkResults.set(value, existing);
  }

  private evaluateAlerts(value: string, results: BlocklistCheckResult[]): void {
    for (const result of results) {
      if (!result.listed) {
        // Check if there was an active alert that can now be auto-resolved
        const alertKey = `${value}:${result.blocklist.id}`;
        const existingAlert = this.alerts.get(alertKey);
        if (existingAlert && existingAlert.status !== 'resolved') {
          existingAlert.status = 'resolved';
          existingAlert.resolvedAt = new Date();
        }
        continue;
      }

      // Listed — create or update alert
      const alertKey = `${value}:${result.blocklist.id}`;
      const existingAlert = this.alerts.get(alertKey);

      if (existingAlert && existingAlert.status !== 'resolved') {
        // Alert already exists and is active
        continue;
      }

      const alert: BlocklistAlert = {
        id: `bla-${this.nextAlertId++}`,
        blocklist: result.blocklist,
        listedValue: value,
        detectedAt: new Date(),
        status: 'active',
        remediationSteps: this.buildRemediationSteps(result.blocklist),
      };

      this.alerts.set(alertKey, alert);
    }
  }

  private buildRemediationSteps(blocklist: Blocklist): string[] {
    const steps: string[] = [];

    steps.push(`Identified listing on ${blocklist.name} (${blocklist.dnsZone})`);
    steps.push('Review recent sending logs for suspicious activity or policy violations');
    steps.push('Check for compromised accounts or scripts that may be sending unauthorized email');
    steps.push('Verify SPF, DKIM, and DMARC records are correctly configured');
    steps.push('Review bounce rates and complaint rates for anomalies');

    switch (blocklist.severity) {
      case 'critical':
        steps.push('CRITICAL: Reduce sending volume immediately to minimize further reputation damage');
        steps.push('Audit all sending sources and disable any that are not fully authenticated');
        break;
      case 'high':
        steps.push('Reduce sending volume and prioritize high-engagement recipients');
        break;
      case 'medium':
        steps.push('Monitor sending metrics closely for the next 24-48 hours');
        break;
      case 'low':
        steps.push('Continue monitoring — low-severity listings often auto-expire');
        break;
    }

    if (blocklist.delistUrl) {
      steps.push(`Submit a delisting request at: ${blocklist.delistUrl}`);
    } else {
      steps.push('No automated delisting URL available — this listing may expire automatically');
    }

    steps.push('After remediation, re-check listing status to confirm removal');

    return steps;
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createBlocklistMonitor(options: {
  resolver: DnsResolver;
  additionalBlocklists?: Blocklist[];
  excludeBlocklists?: string[];
  checkIntervalMs?: number;
  maxResultsPerValue?: number;
}): BlocklistMonitor {
  return new BlocklistMonitor(options);
}
