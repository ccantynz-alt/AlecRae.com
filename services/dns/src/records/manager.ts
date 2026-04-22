import { randomUUID } from "crypto";
import {
  RecordType,
  type CreateRecordInput,
  type DkimConfig,
  type DmarcPolicy,
  type DnsRecord,
  type DnsZone,
  type SoaRecord,
  type SpfConfig,
  type UpdateRecordInput,
  type ValidationResult,
} from "../types";

/**
 * DNS Record Manager: CRUD operations for DNS records with automatic
 * generation of email authentication records (SPF, DKIM, DMARC).
 */
export class DnsRecordManager {
  private zones = new Map<string, DnsZone>();

  constructor(initialZones?: Map<string, DnsZone>) {
    if (initialZones) {
      this.zones = initialZones;
    }
  }

  // ─── Zone Management ────────────────────────────────────────────────

  /** Create a new DNS zone for a domain */
  createZone(domain: string, adminEmail?: string): DnsZone {
    const normalized = domain.toLowerCase();
    if (this.zones.has(normalized)) {
      throw new Error(`Zone already exists for domain: ${normalized}`);
    }

    const now = new Date();
    const serial = this.generateSerial();

    const soa: SoaRecord = {
      primaryNs: `ns1.alecrae.dev`,
      adminEmail: adminEmail ?? `admin.${normalized}`,
      serial,
      refresh: 3600,
      retry: 900,
      expire: 604800,
      minimumTtl: 300,
    };

    const zone: DnsZone = {
      domain: normalized,
      records: new Map(),
      soa,
      serial,
      createdAt: now,
      updatedAt: now,
    };

    // Add default NS records
    this.addRecordToZone(zone, {
      domain: normalized,
      name: "@",
      type: RecordType.NS,
      value: "ns1.alecrae.dev",
      ttl: 86400,
    });
    this.addRecordToZone(zone, {
      domain: normalized,
      name: "@",
      type: RecordType.NS,
      value: "ns2.alecrae.dev",
      ttl: 86400,
    });

    this.zones.set(normalized, zone);
    return zone;
  }

  /** Get a zone by domain */
  getZone(domain: string): DnsZone | undefined {
    return this.zones.get(domain.toLowerCase());
  }

  /** Delete a zone */
  deleteZone(domain: string): boolean {
    return this.zones.delete(domain.toLowerCase());
  }

  /** Get all zones */
  getAllZones(): DnsZone[] {
    return Array.from(this.zones.values());
  }

  // ─── Record CRUD ────────────────────────────────────────────────────

  /** Create a new DNS record */
  createRecord(input: CreateRecordInput): DnsRecord {
    const validation = this.validateRecord(input);
    if (!validation.valid) {
      throw new Error(`Invalid record: ${validation.errors.join(", ")}`);
    }

    const normalized = input.domain.toLowerCase();
    const zone = this.zones.get(normalized);
    if (!zone) {
      throw new Error(`Zone not found for domain: ${normalized}`);
    }

    // Check for conflicting CNAME records
    if (input.type === RecordType.CNAME) {
      const existing = zone.records.get(input.name) ?? [];
      if (existing.length > 0) {
        throw new Error(`Cannot add CNAME: other records exist for ${input.name}`);
      }
    } else {
      const existing = zone.records.get(input.name) ?? [];
      if (existing.some((r) => r.type === RecordType.CNAME)) {
        throw new Error(`Cannot add record: CNAME already exists for ${input.name}`);
      }
    }

    const record = this.addRecordToZone(zone, input);
    this.incrementSerial(zone);
    return record;
  }

  /** Get records for a domain, optionally filtered by name and type */
  getRecords(
    domain: string,
    name?: string,
    type?: RecordType
  ): DnsRecord[] {
    const zone = this.zones.get(domain.toLowerCase());
    if (!zone) return [];

    let records: DnsRecord[] = [];
    if (name !== undefined) {
      records = zone.records.get(name) ?? [];
    } else {
      for (const recs of zone.records.values()) {
        records.push(...recs);
      }
    }

    if (type !== undefined) {
      records = records.filter((r) => r.type === type);
    }

    return records;
  }

  /** Update an existing record by ID */
  updateRecord(
    domain: string,
    recordId: string,
    update: UpdateRecordInput
  ): DnsRecord {
    const zone = this.zones.get(domain.toLowerCase());
    if (!zone) {
      throw new Error(`Zone not found: ${domain}`);
    }

    for (const [key, records] of zone.records) {
      const idx = records.findIndex((r) => r.id === recordId);
      if (idx !== -1) {
        const record = records[idx];
        if (!record) continue;
        if (update.value !== undefined) {
          const validation = this.validateRecordValue(record.type, update.value);
          if (!validation.valid) {
            throw new Error(`Invalid value: ${validation.errors.join(", ")}`);
          }
          record.value = update.value;
        }
        if (update.ttl !== undefined) {
          if (update.ttl < 60 || update.ttl > 86400) {
            throw new Error("TTL must be between 60 and 86400 seconds");
          }
          record.ttl = update.ttl;
        }
        if (update.priority !== undefined) {
          record.priority = update.priority;
        }
        record.updatedAt = new Date();
        records[idx] = record;
        zone.records.set(key, records);
        this.incrementSerial(zone);
        return record;
      }
    }

    throw new Error(`Record not found: ${recordId}`);
  }

  /** Delete a record by ID */
  deleteRecord(domain: string, recordId: string): boolean {
    const zone = this.zones.get(domain.toLowerCase());
    if (!zone) return false;

    for (const [key, records] of zone.records) {
      const idx = records.findIndex((r) => r.id === recordId);
      if (idx !== -1) {
        records.splice(idx, 1);
        if (records.length === 0) {
          zone.records.delete(key);
        } else {
          zone.records.set(key, records);
        }
        this.incrementSerial(zone);
        return true;
      }
    }

    return false;
  }

  // ─── Email Authentication Records ──────────────────────────────────

  /** Generate and add SPF record for a domain */
  generateSpfRecord(domain: string, config: SpfConfig): DnsRecord {
    const parts: string[] = ["v=spf1"];

    for (const ip of config.ipv4) {
      parts.push(`ip4:${ip}`);
    }
    for (const ip of config.ipv6) {
      parts.push(`ip6:${ip}`);
    }
    for (const include of config.includes) {
      parts.push(`include:${include}`);
    }
    if (config.redirect) {
      parts.push(`redirect=${config.redirect}`);
    }
    parts.push(config.mechanism);

    const value = parts.join(" ");

    // Validate SPF record length (DNS TXT limit is 255 per string, but
    // multiple strings are concatenated; total should stay under ~512)
    if (value.length > 512) {
      throw new Error(
        `SPF record too long (${value.length} chars). Consider using includes to reduce length.`
      );
    }

    // Remove existing SPF records
    this.removeRecordsByPrefix(domain, "@", RecordType.TXT, "v=spf1");

    return this.createRecord({
      domain,
      name: "@",
      type: RecordType.TXT,
      value,
      ttl: 3600,
    });
  }

  /** Generate and add DKIM record for a domain */
  generateDkimRecord(domain: string, config: DkimConfig): DnsRecord {
    const name = `${config.selector}._domainkey`;
    const keyType = config.algorithm === "ed25519-sha256" ? "ed25519" : "rsa";

    const parts = [
      "v=DKIM1",
      `k=${keyType}`,
      `p=${config.publicKey}`,
    ];

    const value = parts.join("; ");

    // Remove existing DKIM record for this selector
    this.removeRecordsByPrefix(domain, name, RecordType.TXT, "v=DKIM1");

    return this.createRecord({
      domain,
      name,
      type: RecordType.TXT,
      value,
      ttl: 3600,
    });
  }

  /** Generate and add DMARC record for a domain */
  generateDmarcRecord(domain: string, policy: DmarcPolicy): DnsRecord {
    const parts: string[] = [
      "v=DMARC1",
      `p=${policy.policy}`,
    ];

    if (policy.subdomainPolicy) {
      parts.push(`sp=${policy.subdomainPolicy}`);
    }
    if (policy.percentage !== undefined) {
      parts.push(`pct=${policy.percentage}`);
    }
    if (policy.reportUri) {
      parts.push(`rua=mailto:${policy.reportUri}`);
    }
    if (policy.forensicUri) {
      parts.push(`ruf=mailto:${policy.forensicUri}`);
    }
    if (policy.alignmentMode) {
      parts.push(`aspf=${policy.alignmentMode === "strict" ? "s" : "r"}`);
    }
    if (policy.dkimAlignment) {
      parts.push(`adkim=${policy.dkimAlignment === "strict" ? "s" : "r"}`);
    }

    const value = parts.join("; ");

    // Remove existing DMARC record
    this.removeRecordsByPrefix(domain, "_dmarc", RecordType.TXT, "v=DMARC1");

    return this.createRecord({
      domain,
      name: "_dmarc",
      type: RecordType.TXT,
      value,
      ttl: 3600,
    });
  }

  /**
   * Generate all email authentication records for a domain in one call.
   * This is the recommended way to set up a new sending domain.
   */
  generateEmailAuthRecords(
    domain: string,
    options: {
      spf: SpfConfig;
      dkim: DkimConfig;
      dmarc: DmarcPolicy;
      mxRecords?: { value: string; priority: number }[];
    }
  ): { spf: DnsRecord; dkim: DnsRecord; dmarc: DnsRecord; mx: DnsRecord[] } {
    const spf = this.generateSpfRecord(domain, options.spf);
    const dkim = this.generateDkimRecord(domain, options.dkim);
    const dmarc = this.generateDmarcRecord(domain, options.dmarc);

    const mx: DnsRecord[] = [];
    if (options.mxRecords) {
      for (const mxInput of options.mxRecords) {
        mx.push(
          this.createRecord({
            domain,
            name: "@",
            type: RecordType.MX,
            value: mxInput.value,
            priority: mxInput.priority,
            ttl: 3600,
          })
        );
      }
    }

    return { spf, dkim, dmarc, mx };
  }

  // ─── Validation ─────────────────────────────────────────────────────

  /** Validate a record creation input */
  validateRecord(input: CreateRecordInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate domain
    if (!input.domain || input.domain.length === 0) {
      errors.push("Domain is required");
    } else if (input.domain.length > 253) {
      errors.push("Domain name exceeds 253 character limit");
    }

    // Validate name (subdomain)
    if (input.name === undefined || input.name === null) {
      errors.push("Record name is required");
    } else if (input.name !== "@" && input.name.length > 63) {
      errors.push("Record name label exceeds 63 character limit");
    } else if (input.name !== "@" && !/^[a-zA-Z0-9_]([a-zA-Z0-9_.-]*[a-zA-Z0-9])?$/.test(input.name)) {
      errors.push("Record name contains invalid characters");
    }

    // Validate TTL
    if (input.ttl !== undefined) {
      if (input.ttl < 60) {
        errors.push("TTL must be at least 60 seconds");
      } else if (input.ttl > 86400) {
        errors.push("TTL must not exceed 86400 seconds (24 hours)");
      }
    }

    // Validate value based on type
    const valueValidation = this.validateRecordValue(input.type, input.value);
    errors.push(...valueValidation.errors);
    warnings.push(...valueValidation.warnings);

    // Type-specific validations
    if (input.type === RecordType.MX && input.priority === undefined) {
      warnings.push("MX record without explicit priority; defaulting to 10");
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /** Validate a record value for a given type */
  private validateRecordValue(
    type: RecordType,
    value: string
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (type) {
      case RecordType.A: {
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = value.match(ipv4Regex);
        if (!match) {
          errors.push(`Invalid IPv4 address: ${value}`);
        } else {
          const octets = [match[1], match[2], match[3], match[4]].map(Number);
          if (octets.some((o) => o > 255)) {
            errors.push(`IPv4 octet out of range: ${value}`);
          }
          if (octets[0] === 0) {
            warnings.push("IPv4 address starts with 0, which is reserved");
          }
          if (octets[0] === 127) {
            warnings.push("IPv4 address is a loopback address");
          }
        }
        break;
      }

      case RecordType.AAAA: {
        // Basic IPv6 validation
        const expanded = expandIPv6(value);
        if (!expanded) {
          errors.push(`Invalid IPv6 address: ${value}`);
        }
        break;
      }

      case RecordType.MX:
      case RecordType.CNAME:
      case RecordType.NS: {
        if (!isValidHostname(value)) {
          errors.push(`Invalid hostname: ${value}`);
        }
        break;
      }

      case RecordType.TXT: {
        if (value.length > 4096) {
          errors.push("TXT record value exceeds 4096 characters");
        }
        // Warn about common issues
        if (value.startsWith("v=spf1") && value.split(" ").length > 10) {
          warnings.push("SPF record has many mechanisms; consider using includes");
        }
        break;
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  // ─── Internal Helpers ───────────────────────────────────────────────

  private addRecordToZone(zone: DnsZone, input: CreateRecordInput): DnsRecord {
    const now = new Date();
    const record: DnsRecord = {
      id: randomUUID(),
      domain: input.domain.toLowerCase(),
      name: input.name,
      type: input.type,
      value: input.value,
      ttl: input.ttl ?? 3600,
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const existing = zone.records.get(input.name) ?? [];
    existing.push(record);
    zone.records.set(input.name, existing);

    return record;
  }

  private removeRecordsByPrefix(
    domain: string,
    name: string,
    type: RecordType,
    prefix: string
  ): void {
    const zone = this.zones.get(domain.toLowerCase());
    if (!zone) return;

    const records = zone.records.get(name);
    if (!records) return;

    const filtered = records.filter(
      (r) => !(r.type === type && r.value.startsWith(prefix))
    );

    if (filtered.length === 0) {
      zone.records.delete(name);
    } else {
      zone.records.set(name, filtered);
    }
  }

  private incrementSerial(zone: DnsZone): void {
    zone.serial = this.generateSerial();
    zone.soa.serial = zone.serial;
    zone.updatedAt = new Date();
  }

  /** Generate a SOA serial in YYYYMMDDNN format */
  private generateSerial(): number {
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0");
    // Use hours/minutes as the sequence number within a day
    const seq = now.getHours() * 60 + now.getMinutes();
    return parseInt(`${dateStr}${seq.toString().padStart(4, "0")}`, 10);
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

function isValidHostname(hostname: string): boolean {
  const cleaned = hostname.replace(/\.$/, "");
  if (cleaned.length === 0 || cleaned.length > 253) return false;
  const labels = cleaned.split(".");
  return labels.every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)
  );
}

function expandIPv6(address: string): string | null {
  try {
    let expanded = address;
    if (expanded.includes("::")) {
      const sides = expanded.split("::");
      if (sides.length > 2) return null;
      const left = sides[0] ? sides[0].split(":") : [];
      const right = sides[1] ? sides[1].split(":") : [];
      const missing = 8 - left.length - right.length;
      if (missing < 0) return null;
      const middle = Array(missing).fill("0000");
      expanded = [...left, ...middle, ...right].join(":");
    }
    const groups = expanded.split(":");
    if (groups.length !== 8) return null;
    for (const group of groups) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    }
    return groups.map((g) => g.padStart(4, "0")).join(":");
  } catch {
    return null;
  }
}
