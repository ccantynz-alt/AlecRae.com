import { createSocket } from "dgram";
import { encodeName } from "../authoritative/server";
import { RecordClass, RecordType, type HealthCheckResult } from "../types";

/** Well-known public DNS resolvers for health checks */
const DEFAULT_RESOLVERS = [
  { address: "8.8.8.8", name: "Google Primary" },
  { address: "8.8.4.4", name: "Google Secondary" },
  { address: "1.1.1.1", name: "Cloudflare Primary" },
  { address: "1.0.0.1", name: "Cloudflare Secondary" },
  { address: "9.9.9.9", name: "Quad9 Primary" },
  { address: "208.67.222.222", name: "OpenDNS Primary" },
];

/** Configuration for health monitoring */
export interface HealthMonitorConfig {
  /** Interval between health checks in milliseconds */
  checkIntervalMs: number;
  /** Timeout for individual DNS queries in milliseconds */
  queryTimeoutMs: number;
  /** Number of consecutive failures before alerting */
  failureThreshold: number;
  /** Custom resolvers to check against */
  resolvers?: { address: string; name: string }[];
  /** Callback when a health check fails threshold */
  onAlert?: (alert: HealthAlert) => void;
}

export interface HealthAlert {
  domain: string;
  recordType: RecordType;
  resolver: string;
  consecutiveFailures: number;
  lastError: string;
  timestamp: Date;
}

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  samples: number;
}

interface MonitoredRecord {
  domain: string;
  type: RecordType;
  expectedValues: string[];
}

/**
 * DNS Health Monitor: continuously checks DNS resolution health,
 * tracks latency metrics, and alerts on failures.
 */
export class DnsHealthMonitor {
  private readonly config: HealthMonitorConfig;
  private readonly resolvers: { address: string; name: string }[];
  private monitoredRecords: MonitoredRecord[] = [];
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private failureCounts = new Map<string, number>();
  private latencyHistory = new Map<string, number[]>();
  private results: HealthCheckResult[] = [];
  private readonly maxHistorySize = 1000;

  constructor(config: HealthMonitorConfig) {
    this.config = config;
    this.resolvers = config.resolvers ?? DEFAULT_RESOLVERS;
  }

  /** Add a record to monitor */
  addRecord(domain: string, type: RecordType, expectedValues: string[]): void {
    const existing = this.monitoredRecords.find(
      (r) => r.domain === domain && r.type === type
    );
    if (existing) {
      existing.expectedValues = expectedValues;
    } else {
      this.monitoredRecords.push({ domain, type, expectedValues });
    }
  }

  /** Remove a record from monitoring */
  removeRecord(domain: string, type: RecordType): boolean {
    const idx = this.monitoredRecords.findIndex(
      (r) => r.domain === domain && r.type === type
    );
    if (idx === -1) return false;
    this.monitoredRecords.splice(idx, 1);
    return true;
  }

  /** Start periodic health monitoring */
  start(): void {
    if (this.checkInterval) return;
    this.checkInterval = setInterval(
      () => void this.runAllChecks(),
      this.config.checkIntervalMs
    );
    // Run initial check immediately
    void this.runAllChecks();
  }

  /** Stop periodic health monitoring */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /** Run a single health check for a specific domain and record type */
  async checkHealth(
    domain: string,
    recordType: RecordType,
    resolverAddress?: string
  ): Promise<HealthCheckResult[]> {
    const resolvers = resolverAddress
      ? [{ address: resolverAddress, name: resolverAddress }]
      : this.resolvers;

    const results = await Promise.all(
      resolvers.map((resolver) =>
        this.queryResolver(domain, recordType, resolver)
      )
    );

    return results;
  }

  /** Get latency statistics for a domain/type/resolver combination */
  getLatencyStats(domain: string, type: RecordType, resolver: string): LatencyStats | null {
    const key = `${domain}:${type}:${resolver}`;
    const history = this.latencyHistory.get(key);
    if (!history || history.length === 0) return null;

    const sorted = [...history].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const min = sorted[0] ?? 0;
    const max = sorted[sorted.length - 1] ?? 0;
    return {
      min,
      max,
      avg: sum / sorted.length,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      samples: sorted.length,
    };
  }

  /** Get recent health check results */
  getRecentResults(limit = 50): HealthCheckResult[] {
    return this.results.slice(-limit);
  }

  /** Get current failure counts for all monitored records */
  getFailureCounts(): Map<string, number> {
    return new Map(this.failureCounts);
  }

  /** Run health checks for all monitored records */
  private async runAllChecks(): Promise<void> {
    const checks = this.monitoredRecords.flatMap((record) =>
      this.resolvers.map((resolver) => ({
        record,
        resolver,
      }))
    );

    const results = await Promise.allSettled(
      checks.map(({ record, resolver }) =>
        this.queryResolver(record.domain, record.type, resolver)
      )
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const check = checks[i];
      if (!result || !check) continue;
      const key = `${check.record.domain}:${check.record.type}:${check.resolver.address}`;

      if (result.status === "fulfilled") {
        const checkResult = result.value;
        this.results.push(checkResult);

        // Track latency
        this.trackLatency(key, checkResult.latencyMs);

        // Track failures
        if (!checkResult.resolved) {
          const count = (this.failureCounts.get(key) ?? 0) + 1;
          this.failureCounts.set(key, count);

          if (count >= this.config.failureThreshold && this.config.onAlert) {
            this.config.onAlert({
              domain: check.record.domain,
              recordType: check.record.type,
              resolver: check.resolver.address,
              consecutiveFailures: count,
              lastError: checkResult.error ?? "Resolution failed",
              timestamp: new Date(),
            });
          }
        } else {
          this.failureCounts.set(key, 0);
        }
      } else {
        const count = (this.failureCounts.get(key) ?? 0) + 1;
        this.failureCounts.set(key, count);
      }
    }

    // Trim history
    if (this.results.length > this.maxHistorySize) {
      this.results = this.results.slice(-this.maxHistorySize);
    }
  }

  /** Query a specific resolver for a domain/type */
  private async queryResolver(
    domain: string,
    recordType: RecordType,
    resolver: { address: string; name: string }
  ): Promise<HealthCheckResult> {
    const startTime = performance.now();

    try {
      const response = await this.sendDnsQuery(domain, recordType, resolver.address);
      const latencyMs = performance.now() - startTime;

      return {
        domain,
        recordType,
        resolver: resolver.address,
        resolved: response.values.length > 0,
        latencyMs,
        values: response.values,
        timestamp: new Date(),
      };
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      return {
        domain,
        recordType,
        resolver: resolver.address,
        resolved: false,
        latencyMs,
        values: [],
        timestamp: new Date(),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Send a raw DNS query to a resolver and parse the response */
  private sendDnsQuery(
    domain: string,
    recordType: RecordType,
    resolverAddress: string
  ): Promise<{ values: string[] }> {
    return new Promise((resolve, reject) => {
      const socket = createSocket("udp4");
      const queryId = Math.floor(Math.random() * 0xffff);
      const query = buildDnsQuery(queryId, domain, recordType);

      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`DNS query timed out after ${this.config.queryTimeoutMs}ms`));
      }, this.config.queryTimeoutMs);

      socket.on("message", (msg) => {
        clearTimeout(timer);
        socket.close();
        try {
          const values = parseSimpleDnsResponse(msg, recordType);
          resolve({ values });
        } catch (err) {
          reject(err);
        }
      });

      socket.on("error", (err) => {
        clearTimeout(timer);
        socket.close();
        reject(err);
      });

      socket.send(query, 53, resolverAddress, (err) => {
        if (err) {
          clearTimeout(timer);
          socket.close();
          reject(err);
        }
      });
    });
  }

  private trackLatency(key: string, latencyMs: number): void {
    let history = this.latencyHistory.get(key);
    if (!history) {
      history = [];
      this.latencyHistory.set(key, history);
    }
    history.push(latencyMs);
    // Keep only last 500 samples per key
    if (history.length > 500) {
      this.latencyHistory.set(key, history.slice(-500));
    }
  }
}

// ─── DNS Query Builder (Minimal, for health checks) ──────────────────────────

/** Build a minimal DNS query packet */
function buildDnsQuery(id: number, domain: string, type: RecordType): Buffer {
  const nameBuf = encodeName(domain);
  const buf = Buffer.alloc(12 + nameBuf.length + 4);

  // Header
  buf.writeUInt16BE(id, 0); // ID
  buf.writeUInt16BE(0x0100, 2); // Flags: RD=1 (recursion desired)
  buf.writeUInt16BE(1, 4); // QDCOUNT = 1
  buf.writeUInt16BE(0, 6); // ANCOUNT = 0
  buf.writeUInt16BE(0, 8); // NSCOUNT = 0
  buf.writeUInt16BE(0, 10); // ARCOUNT = 0

  // Question
  nameBuf.copy(buf, 12);
  buf.writeUInt16BE(type, 12 + nameBuf.length);
  buf.writeUInt16BE(RecordClass.IN, 12 + nameBuf.length + 2);

  return buf;
}

/** Parse a DNS response and extract answer values as strings */
function parseSimpleDnsResponse(msg: Buffer, expectedType: RecordType): string[] {
  if (msg.length < 12) throw new Error("Response too short");

  const ancount = msg.readUInt16BE(6);
  const rcode = msg.readUInt16BE(2) & 0x0f;

  if (rcode !== 0) {
    throw new Error(`DNS response error: RCODE=${rcode}`);
  }

  // Skip header (12 bytes) and question section
  let offset = 12;
  const qdcount = msg.readUInt16BE(4);
  for (let i = 0; i < qdcount; i++) {
    offset = skipName(msg, offset);
    offset += 4; // QTYPE + QCLASS
  }

  // Parse answer section
  const values: string[] = [];
  for (let i = 0; i < ancount; i++) {
    offset = skipName(msg, offset);
    const rrType = msg.readUInt16BE(offset);
    offset += 2; // TYPE
    offset += 2; // CLASS
    offset += 4; // TTL
    const rdlength = msg.readUInt16BE(offset);
    offset += 2;

    if (rrType === expectedType) {
      const rdata = msg.subarray(offset, offset + rdlength);
      const value = rdataToString(expectedType, rdata, msg);
      if (value) values.push(value);
    }

    offset += rdlength;
  }

  return values;
}

/** Skip a DNS name in wire format, handling compression */
function skipName(buffer: Buffer, offset: number): number {
  let pos = offset;
  while (pos < buffer.length) {
    const length = buffer[pos];
    if (length === undefined) throw new Error("Malformed DNS name");
    if ((length & 0xc0) === 0xc0) {
      return pos + 2; // Compression pointer: 2 bytes
    }
    if (length === 0) {
      return pos + 1;
    }
    pos += 1 + length;
  }
  throw new Error("Malformed DNS name");
}

/** Convert RDATA bytes to a human-readable string */
function rdataToString(
  type: RecordType,
  rdata: Buffer,
  _fullMessage: Buffer
): string | null {
  switch (type) {
    case RecordType.A:
      if (rdata.length !== 4) return null;
      return `${rdata[0]}.${rdata[1]}.${rdata[2]}.${rdata[3]}`;

    case RecordType.AAAA: {
      if (rdata.length !== 16) return null;
      const groups: string[] = [];
      for (let i = 0; i < 16; i += 2) {
        groups.push(rdata.readUInt16BE(i).toString(16));
      }
      return groups.join(":");
    }

    case RecordType.TXT: {
      let result = "";
      let pos = 0;
      while (pos < rdata.length) {
        const len = rdata[pos];
        if (len === undefined) break;
        pos++;
        result += rdata.subarray(pos, pos + len).toString("utf-8");
        pos += len;
      }
      return result;
    }

    case RecordType.MX:
      if (rdata.length < 3) return null;
      // Skip priority (2 bytes), rest is the name
      return `${rdata.readUInt16BE(0)}`;

    default:
      return rdata.toString("hex");
  }
}

/** Calculate a percentile value from a sorted array */
function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}
