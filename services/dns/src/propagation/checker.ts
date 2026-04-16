import { createSocket } from "dgram";
import { encodeName } from "../authoritative/server";
import {
  RecordClass,
  RecordType,
  type PropagationStatus,
  type ResolverResult,
} from "../types";

/** Global DNS resolvers to check propagation against */
const GLOBAL_RESOLVERS: { address: string; name: string; region: string }[] = [
  // North America
  { address: "8.8.8.8", name: "Google Public DNS", region: "us" },
  { address: "8.8.4.4", name: "Google Public DNS Secondary", region: "us" },
  { address: "1.1.1.1", name: "Cloudflare", region: "us" },
  { address: "1.0.0.1", name: "Cloudflare Secondary", region: "us" },
  { address: "9.9.9.9", name: "Quad9", region: "us" },
  { address: "208.67.222.222", name: "OpenDNS", region: "us" },
  { address: "208.67.220.220", name: "OpenDNS Secondary", region: "us" },
  { address: "64.6.64.6", name: "Verisign", region: "us" },
  { address: "64.6.65.6", name: "Verisign Secondary", region: "us" },
  // Europe
  { address: "77.88.8.8", name: "Yandex DNS", region: "eu" },
  { address: "77.88.8.1", name: "Yandex DNS Secondary", region: "eu" },
  { address: "195.46.39.39", name: "SafeDNS", region: "eu" },
  { address: "195.46.39.40", name: "SafeDNS Secondary", region: "eu" },
  // Asia Pacific
  { address: "119.29.29.29", name: "DNSPod", region: "ap" },
  { address: "223.5.5.5", name: "AliDNS", region: "ap" },
  { address: "223.6.6.6", name: "AliDNS Secondary", region: "ap" },
  // Additional global
  { address: "76.76.19.19", name: "Alternate DNS", region: "us" },
  { address: "94.140.14.14", name: "AdGuard DNS", region: "eu" },
  { address: "94.140.15.15", name: "AdGuard DNS Secondary", region: "eu" },
  { address: "185.228.168.9", name: "CleanBrowsing", region: "eu" },
];

export interface PropagationCheckerConfig {
  /** Timeout per resolver query in milliseconds */
  queryTimeoutMs: number;
  /** Number of concurrent resolver queries */
  concurrency: number;
  /** Custom resolvers to use (overrides defaults) */
  resolvers?: { address: string; name: string; region: string }[];
}

export interface PropagationCheckOptions {
  /** Only check resolvers in specific regions */
  regions?: string[];
  /** Maximum number of resolvers to query */
  maxResolvers?: number;
  /** Whether to match the value exactly or just check resolution */
  exactMatch?: boolean;
}

/**
 * DNS Propagation Checker: verifies that DNS changes have propagated
 * to resolvers across the globe.
 */
export class DnsPropagationChecker {
  private readonly config: PropagationCheckerConfig;
  private readonly resolvers: { address: string; name: string; region: string }[];

  constructor(config: PropagationCheckerConfig) {
    this.config = config;
    this.resolvers = config.resolvers ?? GLOBAL_RESOLVERS;
  }

  /**
   * Check propagation status for a DNS record across global resolvers.
   */
  async checkPropagation(
    domain: string,
    recordType: RecordType,
    expectedValue: string,
    options?: PropagationCheckOptions
  ): Promise<PropagationStatus> {
    let resolvers = [...this.resolvers];

    // Filter by region if specified
    const regions = options?.regions;
    if (regions) {
      resolvers = resolvers.filter((r) => regions.includes(r.region));
    }

    // Limit number of resolvers
    if (options?.maxResolvers && resolvers.length > options.maxResolvers) {
      resolvers = resolvers.slice(0, options.maxResolvers);
    }

    const exactMatch = options?.exactMatch ?? true;

    // Query resolvers with concurrency control
    const results = await this.queryWithConcurrency(
      resolvers,
      domain,
      recordType,
      expectedValue,
      exactMatch
    );

    const propagatedCount = results.filter((r) => r.matchesExpected).length;

    return {
      domain,
      recordType,
      expectedValue,
      resolvers: results,
      fullyPropagated: propagatedCount === results.length,
      propagationPercentage:
        results.length > 0 ? (propagatedCount / results.length) * 100 : 0,
      checkedAt: new Date(),
    };
  }

  /**
   * Wait for propagation to reach a threshold, polling at intervals.
   * Returns the final status when either the threshold is met or max attempts exhausted.
   */
  async waitForPropagation(
    domain: string,
    recordType: RecordType,
    expectedValue: string,
    options: {
      targetPercentage?: number;
      maxAttempts?: number;
      pollIntervalMs?: number;
      onProgress?: (status: PropagationStatus, attempt: number) => void;
    } = {}
  ): Promise<PropagationStatus> {
    const targetPercentage = options.targetPercentage ?? 100;
    const maxAttempts = options.maxAttempts ?? 30;
    const pollIntervalMs = options.pollIntervalMs ?? 10_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.checkPropagation(domain, recordType, expectedValue);

      if (options.onProgress) {
        options.onProgress(status, attempt);
      }

      if (status.propagationPercentage >= targetPercentage) {
        return status;
      }

      if (attempt < maxAttempts) {
        await sleep(pollIntervalMs);
      }
    }

    // Return final status even if not fully propagated
    return this.checkPropagation(domain, recordType, expectedValue);
  }

  /**
   * Check propagation for multiple records at once.
   */
  async checkMultipleRecords(
    checks: {
      domain: string;
      recordType: RecordType;
      expectedValue: string;
    }[]
  ): Promise<PropagationStatus[]> {
    return Promise.all(
      checks.map((check) =>
        this.checkPropagation(check.domain, check.recordType, check.expectedValue)
      )
    );
  }

  /**
   * Get a summary of regional propagation status.
   */
  async checkRegionalPropagation(
    domain: string,
    recordType: RecordType,
    expectedValue: string
  ): Promise<Map<string, { total: number; propagated: number; percentage: number }>> {
    const status = await this.checkPropagation(domain, recordType, expectedValue);
    const regionMap = new Map<
      string,
      { total: number; propagated: number; percentage: number }
    >();

    for (const result of status.resolvers) {
      const resolver = this.resolvers.find((r) => r.address === result.resolver);
      const region = resolver?.region ?? "unknown";

      let stats = regionMap.get(region);
      if (!stats) {
        stats = { total: 0, propagated: 0, percentage: 0 };
        regionMap.set(region, stats);
      }

      stats.total++;
      if (result.matchesExpected) {
        stats.propagated++;
      }
      stats.percentage = (stats.propagated / stats.total) * 100;
    }

    return regionMap;
  }

  // ─── Internal ───────────────────────────────────────────────────────

  /** Query resolvers with a concurrency limit */
  private async queryWithConcurrency(
    resolvers: { address: string; name: string; region: string }[],
    domain: string,
    recordType: RecordType,
    expectedValue: string,
    exactMatch: boolean
  ): Promise<ResolverResult[]> {
    const results: ResolverResult[] = [];
    const concurrency = this.config.concurrency;

    for (let i = 0; i < resolvers.length; i += concurrency) {
      const batch = resolvers.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((resolver) =>
          this.querySingleResolver(resolver, domain, recordType, expectedValue, exactMatch)
        )
      );
      results.push(...batchResults);
    }

    return results;
  }

  /** Query a single resolver */
  private async querySingleResolver(
    resolver: { address: string; name: string },
    domain: string,
    recordType: RecordType,
    expectedValue: string,
    exactMatch: boolean
  ): Promise<ResolverResult> {
    const startTime = performance.now();

    try {
      const values = await this.sendQuery(domain, recordType, resolver.address);
      const latencyMs = performance.now() - startTime;

      const matchesExpected = exactMatch
        ? values.some((v) => normalizeValue(v, recordType) === normalizeValue(expectedValue, recordType))
        : values.length > 0;

      return {
        resolver: resolver.address,
        name: resolver.name,
        resolved: values.length > 0,
        values,
        latencyMs,
        matchesExpected,
      };
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      return {
        resolver: resolver.address,
        name: resolver.name,
        resolved: false,
        values: [],
        latencyMs,
        matchesExpected: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Send a DNS query and return parsed answer values */
  private sendQuery(
    domain: string,
    recordType: RecordType,
    resolverAddress: string
  ): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const socket = createSocket("udp4");
      const queryId = Math.floor(Math.random() * 0xffff);

      // Build query packet
      const nameBuf = encodeName(domain);
      const query = Buffer.alloc(12 + nameBuf.length + 4);
      query.writeUInt16BE(queryId, 0);
      query.writeUInt16BE(0x0100, 2); // RD=1
      query.writeUInt16BE(1, 4); // QDCOUNT=1
      nameBuf.copy(query, 12);
      query.writeUInt16BE(recordType, 12 + nameBuf.length);
      query.writeUInt16BE(RecordClass.IN, 12 + nameBuf.length + 2);

      const timer = setTimeout(() => {
        socket.close();
        reject(new Error(`Query timeout after ${this.config.queryTimeoutMs}ms`));
      }, this.config.queryTimeoutMs);

      socket.on("message", (msg) => {
        clearTimeout(timer);
        socket.close();

        try {
          const values = parseResponseValues(msg, recordType);
          resolve(values);
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse answer values from a DNS response buffer */
function parseResponseValues(msg: Buffer, expectedType: RecordType): string[] {
  if (msg.length < 12) throw new Error("Response too short");

  const rcode = msg.readUInt16BE(2) & 0x0f;
  if (rcode !== 0 && rcode !== 3) {
    throw new Error(`DNS error: RCODE=${rcode}`);
  }

  const qdcount = msg.readUInt16BE(4);
  const ancount = msg.readUInt16BE(6);

  // Skip question section
  let offset = 12;
  for (let i = 0; i < qdcount; i++) {
    offset = skipDnsName(msg, offset);
    offset += 4;
  }

  // Parse answers
  const values: string[] = [];
  for (let i = 0; i < ancount; i++) {
    offset = skipDnsName(msg, offset);
    const type = msg.readUInt16BE(offset);
    offset += 8; // TYPE(2) + CLASS(2) + TTL(4)
    const rdlength = msg.readUInt16BE(offset);
    offset += 2;

    if (type === expectedType) {
      const rdata = msg.subarray(offset, offset + rdlength);
      const value = decodeRdata(expectedType, rdata);
      if (value) values.push(value);
    }

    offset += rdlength;
  }

  return values;
}

/** Skip over a DNS name in wire format */
function skipDnsName(buffer: Buffer, offset: number): number {
  let pos = offset;
  while (pos < buffer.length) {
    const len = buffer[pos];
    if (len === undefined) throw new Error("Malformed DNS name");
    if ((len & 0xc0) === 0xc0) return pos + 2;
    if (len === 0) return pos + 1;
    pos += 1 + len;
  }
  throw new Error("Malformed DNS name");
}

/** Decode RDATA to a human-readable string */
function decodeRdata(type: RecordType, rdata: Buffer): string | null {
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

    case RecordType.MX: {
      if (rdata.length < 3) return null;
      const priority = rdata.readUInt16BE(0);
      // The rest is the exchange name, simplified extraction
      let name = "";
      let pos = 2;
      while (pos < rdata.length) {
        const len = rdata[pos];
        if (len === undefined || len === 0) break;
        if ((len & 0xc0) === 0xc0) break; // compression pointer
        pos++;
        name += (name ? "." : "") + rdata.subarray(pos, pos + len).toString("ascii");
        pos += len;
      }
      return `${priority} ${name}`;
    }

    default:
      return rdata.toString("hex");
  }
}

/** Normalize a value for comparison based on record type */
function normalizeValue(value: string, type: RecordType): string {
  const trimmed = value.trim().toLowerCase();
  switch (type) {
    case RecordType.A:
    case RecordType.AAAA:
      return trimmed;
    case RecordType.CNAME:
    case RecordType.NS:
    case RecordType.MX:
      return trimmed.replace(/\.$/, "");
    case RecordType.TXT:
      // Remove surrounding quotes if present
      return trimmed.replace(/^"(.*)"$/, "$1");
    default:
      return trimmed;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
