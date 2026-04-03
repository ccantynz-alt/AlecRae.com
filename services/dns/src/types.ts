/** DNS record types as per IANA assignments */
export enum RecordType {
  A = 1,
  NS = 2,
  CNAME = 5,
  SOA = 6,
  MX = 15,
  TXT = 16,
  AAAA = 28,
  SRV = 33,
  CAA = 257,
}

/** DNS query/response class */
export enum RecordClass {
  IN = 1,
  CH = 3,
  HS = 4,
  ANY = 255,
}

/** DNS response codes */
export enum ResponseCode {
  NOERROR = 0,
  FORMERR = 1,
  SERVFAIL = 2,
  NXDOMAIN = 3,
  NOTIMP = 4,
  REFUSED = 5,
}

/** DNS header flags */
export interface DnsHeader {
  id: number;
  qr: 0 | 1; // 0 = query, 1 = response
  opcode: number;
  aa: 0 | 1; // authoritative answer
  tc: 0 | 1; // truncation
  rd: 0 | 1; // recursion desired
  ra: 0 | 1; // recursion available
  z: number;
  rcode: ResponseCode;
  qdcount: number;
  ancount: number;
  nscount: number;
  arcount: number;
}

/** A single DNS question */
export interface DnsQuestion {
  name: string;
  type: RecordType;
  class: RecordClass;
}

/** A DNS resource record */
export interface DnsResourceRecord {
  name: string;
  type: RecordType;
  class: RecordClass;
  ttl: number;
  rdlength: number;
  rdata: Buffer;
}

/** Full parsed DNS message */
export interface DnsMessage {
  header: DnsHeader;
  questions: DnsQuestion[];
  answers: DnsResourceRecord[];
  authority: DnsResourceRecord[];
  additional: DnsResourceRecord[];
}

/** A stored DNS record (application-level) */
export interface DnsRecord {
  id: string;
  domain: string;
  name: string; // subdomain or @ for apex
  type: RecordType;
  value: string;
  ttl: number;
  priority?: number; // for MX, SRV
  weight?: number; // for SRV
  port?: number; // for SRV
  createdAt: Date;
  updatedAt: Date;
}

/** Record creation input */
export interface CreateRecordInput {
  domain: string;
  name: string;
  type: RecordType;
  value: string;
  ttl?: number;
  priority?: number;
  weight?: number;
  port?: number;
}

/** Record update input */
export interface UpdateRecordInput {
  value?: string;
  ttl?: number;
  priority?: number;
}

/** DKIM configuration for a domain */
export interface DkimConfig {
  selector: string;
  publicKey: string;
  algorithm: "rsa-sha256" | "ed25519-sha256";
  keySize: 1024 | 2048 | 4096;
}

/** DMARC policy */
export interface DmarcPolicy {
  policy: "none" | "quarantine" | "reject";
  subdomainPolicy?: "none" | "quarantine" | "reject";
  percentage?: number;
  reportUri?: string;
  forensicUri?: string;
  alignmentMode?: "relaxed" | "strict";
  dkimAlignment?: "relaxed" | "strict";
}

/** SPF configuration */
export interface SpfConfig {
  includes: string[];
  ipv4: string[];
  ipv6: string[];
  mechanism: "~all" | "-all" | "?all" | "+all";
  redirect?: string;
}

/** DNS zone for a domain */
export interface DnsZone {
  domain: string;
  records: Map<string, DnsRecord[]>;
  soa: SoaRecord;
  serial: number;
  createdAt: Date;
  updatedAt: Date;
}

/** SOA record data */
export interface SoaRecord {
  primaryNs: string;
  adminEmail: string;
  serial: number;
  refresh: number;
  retry: number;
  expire: number;
  minimumTtl: number;
}

/** DNS health check result */
export interface HealthCheckResult {
  domain: string;
  recordType: RecordType;
  resolver: string;
  resolved: boolean;
  latencyMs: number;
  values: string[];
  timestamp: Date;
  error?: string;
}

/** Propagation status */
export interface PropagationStatus {
  domain: string;
  recordType: RecordType;
  expectedValue: string;
  resolvers: ResolverResult[];
  fullyPropagated: boolean;
  propagationPercentage: number;
  checkedAt: Date;
}

/** Result from a single resolver */
export interface ResolverResult {
  resolver: string;
  name: string;
  resolved: boolean;
  values: string[];
  latencyMs: number;
  matchesExpected: boolean;
  error?: string;
}

/** DNS server configuration */
export interface DnsServerConfig {
  port: number;
  host: string;
  zones: Map<string, DnsZone>;
  defaultTtl: number;
  enableLogging: boolean;
}

/** Record validation result */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
