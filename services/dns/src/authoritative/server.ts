import { createSocket, type Socket, type RemoteInfo } from "dgram";
import type {
  DnsHeader,
  DnsMessage,
  DnsQuestion,
  DnsResourceRecord,
  DnsServerConfig,
  DnsZone,
} from "../types";
import { RecordClass, RecordType, ResponseCode } from "../types";

/**
 * Authoritative DNS server that handles DNS queries over UDP.
 * Parses DNS wire format per RFC 1035 and serves zone data.
 */
export class AuthoritativeDnsServer {
  private socket: Socket | null = null;
  private readonly config: DnsServerConfig;
  private readonly zones: Map<string, DnsZone>;
  private requestCount = 0;
  private errorCount = 0;

  constructor(config: DnsServerConfig) {
    this.config = config;
    this.zones = config.zones;
  }

  /** Start the DNS server */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket("udp4");

      this.socket.on("message", (msg, rinfo) => {
        this.handleQuery(msg, rinfo).catch((err) => {
          this.errorCount++;
          console.error(`[dns] Error handling query from ${rinfo.address}:${rinfo.port}:`, err);
        });
      });

      this.socket.on("error", (err) => {
        console.error("[dns] Server error:", err);
        reject(err);
      });

      this.socket.bind(this.config.port, this.config.host, () => {
        console.log(`[dns] Authoritative server listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
    });
  }

  /** Stop the DNS server */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        this.socket.close(() => {
          this.socket = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /** Update or add a zone */
  setZone(domain: string, zone: DnsZone): void {
    this.zones.set(domain, zone);
  }

  /** Remove a zone */
  removeZone(domain: string): boolean {
    return this.zones.delete(domain);
  }

  /** Get server statistics */
  getStats(): { requestCount: number; errorCount: number; zoneCount: number } {
    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      zoneCount: this.zones.size,
    };
  }

  /** Handle an incoming DNS query */
  private async handleQuery(msg: Buffer, rinfo: RemoteInfo): Promise<void> {
    this.requestCount++;

    let query: DnsMessage;
    try {
      query = parseDnsMessage(msg);
    } catch {
      // Send FORMERR response with the ID from the first two bytes if available
      const id = msg.length >= 2 ? msg.readUInt16BE(0) : 0;
      const response = this.buildErrorResponse(id, ResponseCode.FORMERR);
      await this.sendResponse(response, rinfo);
      return;
    }

    const response = this.resolveQuery(query);
    const responseBuffer = serializeDnsMessage(response);

    // Check for truncation (UDP max 512 bytes per RFC 1035, though EDNS allows more)
    if (responseBuffer.length > 512) {
      const truncated = this.buildTruncatedResponse(query);
      await this.sendResponse(serializeDnsMessage(truncated), rinfo);
      return;
    }

    await this.sendResponse(responseBuffer, rinfo);
  }

  /** Resolve a query against local zones */
  private resolveQuery(query: DnsMessage): DnsMessage {
    const answers: DnsResourceRecord[] = [];
    const authority: DnsResourceRecord[] = [];
    let rcode = ResponseCode.NOERROR;
    let isAuthoritative = false;

    for (const question of query.questions) {
      const zone = this.findZone(question.name);
      if (!zone) {
        rcode = ResponseCode.REFUSED;
        continue;
      }

      isAuthoritative = true;
      const records = this.lookupRecords(zone, question.name, question.type);

      if (records.length === 0) {
        // Check if the name exists at all (NXDOMAIN vs NODATA)
        const anyRecords = this.lookupRecords(zone, question.name, RecordType.A);
        const anyOther = this.lookupAllTypes(zone, question.name);
        if (anyRecords.length === 0 && anyOther.length === 0) {
          rcode = ResponseCode.NXDOMAIN;
        }
        // else NODATA: rcode stays NOERROR, just no answers
      } else {
        answers.push(...records);
      }

      // If we got a CNAME and the question wasn't for CNAME, follow it
      if (question.type !== RecordType.CNAME) {
        const cnameRecords = this.lookupRecords(zone, question.name, RecordType.CNAME);
        if (cnameRecords.length > 0 && answers.length === 0) {
          answers.push(...cnameRecords);
          // Try to resolve the CNAME target within our zones
          for (const cname of cnameRecords) {
            const target = decodeName(cname.rdata, 0).name;
            const targetRecords = this.lookupRecords(zone, target, question.type);
            answers.push(...targetRecords);
          }
        }
      }
    }

    return {
      header: {
        id: query.header.id,
        qr: 1,
        opcode: query.header.opcode,
        aa: isAuthoritative ? 1 : 0,
        tc: 0,
        rd: query.header.rd,
        ra: 0,
        z: 0,
        rcode,
        qdcount: query.questions.length,
        ancount: answers.length,
        nscount: authority.length,
        arcount: 0,
      },
      questions: query.questions,
      answers,
      authority,
      additional: [],
    };
  }

  /** Find the zone that is authoritative for a given name */
  private findZone(name: string): DnsZone | undefined {
    const normalized = name.toLowerCase().replace(/\.$/, "");
    // Walk up the name to find the longest matching zone
    const labels = normalized.split(".");
    for (let i = 0; i < labels.length; i++) {
      const candidate = labels.slice(i).join(".");
      const zone = this.zones.get(candidate);
      if (zone) return zone;
    }
    return undefined;
  }

  /** Look up records for a specific name and type in a zone */
  private lookupRecords(
    zone: DnsZone,
    qname: string,
    qtype: RecordType
  ): DnsResourceRecord[] {
    const normalized = qname.toLowerCase().replace(/\.$/, "");
    const results: DnsResourceRecord[] = [];

    // Determine the record key: either a relative name or @ for apex
    const zoneDomain = zone.domain.toLowerCase();
    let recordKey: string;
    if (normalized === zoneDomain) {
      recordKey = "@";
    } else if (normalized.endsWith(`.${zoneDomain}`)) {
      recordKey = normalized.slice(0, -(zoneDomain.length + 1));
    } else {
      return results;
    }

    const records = zone.records.get(recordKey) ?? [];
    for (const record of records) {
      if (record.type === qtype) {
        results.push({
          name: qname,
          type: record.type,
          class: RecordClass.IN,
          ttl: record.ttl,
          rdlength: 0, // Set during serialization
          rdata: encodeRdata(record.type, record.value, record.priority),
        });
      }
    }

    return results;
  }

  /** Check if any records exist for a name regardless of type */
  private lookupAllTypes(zone: DnsZone, qname: string): DnsResourceRecord[] {
    const normalized = qname.toLowerCase().replace(/\.$/, "");
    const zoneDomain = zone.domain.toLowerCase();
    let recordKey: string;
    if (normalized === zoneDomain) {
      recordKey = "@";
    } else if (normalized.endsWith(`.${zoneDomain}`)) {
      recordKey = normalized.slice(0, -(zoneDomain.length + 1));
    } else {
      return [];
    }
    const records = zone.records.get(recordKey) ?? [];
    return records.map((r) => ({
      name: qname,
      type: r.type,
      class: RecordClass.IN,
      ttl: r.ttl,
      rdlength: 0,
      rdata: encodeRdata(r.type, r.value, r.priority),
    }));
  }

  /** Build a minimal error response */
  private buildErrorResponse(id: number, rcode: ResponseCode): Buffer {
    return serializeDnsMessage({
      header: {
        id,
        qr: 1,
        opcode: 0,
        aa: 0,
        tc: 0,
        rd: 0,
        ra: 0,
        z: 0,
        rcode,
        qdcount: 0,
        ancount: 0,
        nscount: 0,
        arcount: 0,
      },
      questions: [],
      answers: [],
      authority: [],
      additional: [],
    });
  }

  /** Build a truncated response indicating the client should retry over TCP */
  private buildTruncatedResponse(query: DnsMessage): DnsMessage {
    return {
      header: {
        ...query.header,
        qr: 1,
        aa: 1,
        tc: 1,
        ra: 0,
        rcode: ResponseCode.NOERROR,
        ancount: 0,
        nscount: 0,
        arcount: 0,
      },
      questions: query.questions,
      answers: [],
      authority: [],
      additional: [],
    };
  }

  /** Send a UDP response */
  private async sendResponse(data: Buffer, rinfo: RemoteInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error("Socket not initialized"));
        return;
      }
      this.socket.send(data, 0, data.length, rinfo.port, rinfo.address, (err) => {
        if (err) {
          this.errorCount++;
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

// ─── DNS Wire Format Parser ─────────────────────────────────────────────────

/**
 * Parse a raw DNS message from wire format (RFC 1035 Section 4).
 */
export function parseDnsMessage(buffer: Buffer): DnsMessage {
  if (buffer.length < 12) {
    throw new Error("DNS message too short: must be at least 12 bytes");
  }

  // Parse header (12 bytes)
  const header = parseDnsHeader(buffer);
  let offset = 12;

  // Parse questions
  const questions: DnsQuestion[] = [];
  for (let i = 0; i < header.qdcount; i++) {
    const { question, newOffset } = parseDnsQuestion(buffer, offset);
    questions.push(question);
    offset = newOffset;
  }

  // Parse answer RRs
  const answers: DnsResourceRecord[] = [];
  for (let i = 0; i < header.ancount; i++) {
    const { rr, newOffset } = parseDnsResourceRecord(buffer, offset);
    answers.push(rr);
    offset = newOffset;
  }

  // Parse authority RRs
  const authority: DnsResourceRecord[] = [];
  for (let i = 0; i < header.nscount; i++) {
    const { rr, newOffset } = parseDnsResourceRecord(buffer, offset);
    authority.push(rr);
    offset = newOffset;
  }

  // Parse additional RRs
  const additional: DnsResourceRecord[] = [];
  for (let i = 0; i < header.arcount; i++) {
    const { rr, newOffset } = parseDnsResourceRecord(buffer, offset);
    additional.push(rr);
    offset = newOffset;
  }

  return { header, questions, answers, authority, additional };
}

/** Parse the 12-byte DNS header */
function parseDnsHeader(buffer: Buffer): DnsHeader {
  const flags = buffer.readUInt16BE(2);
  return {
    id: buffer.readUInt16BE(0),
    qr: ((flags >> 15) & 0x1) as 0 | 1,
    opcode: (flags >> 11) & 0xf,
    aa: ((flags >> 10) & 0x1) as 0 | 1,
    tc: ((flags >> 9) & 0x1) as 0 | 1,
    rd: ((flags >> 8) & 0x1) as 0 | 1,
    ra: ((flags >> 7) & 0x1) as 0 | 1,
    z: (flags >> 4) & 0x7,
    rcode: (flags & 0xf) as ResponseCode,
    qdcount: buffer.readUInt16BE(4),
    ancount: buffer.readUInt16BE(6),
    nscount: buffer.readUInt16BE(8),
    arcount: buffer.readUInt16BE(10),
  };
}

/** Parse a question section entry */
function parseDnsQuestion(
  buffer: Buffer,
  offset: number
): { question: DnsQuestion; newOffset: number } {
  const { name, newOffset } = decodeName(buffer, offset);
  const type = buffer.readUInt16BE(newOffset) as RecordType;
  const cls = buffer.readUInt16BE(newOffset + 2) as RecordClass;
  return {
    question: { name, type, class: cls },
    newOffset: newOffset + 4,
  };
}

/** Parse a resource record */
function parseDnsResourceRecord(
  buffer: Buffer,
  offset: number
): { rr: DnsResourceRecord; newOffset: number } {
  const { name, newOffset: nameEnd } = decodeName(buffer, offset);
  const type = buffer.readUInt16BE(nameEnd) as RecordType;
  const cls = buffer.readUInt16BE(nameEnd + 2) as RecordClass;
  const ttl = buffer.readUInt32BE(nameEnd + 4);
  const rdlength = buffer.readUInt16BE(nameEnd + 8);
  const rdata = Buffer.from(buffer.subarray(nameEnd + 10, nameEnd + 10 + rdlength));

  return {
    rr: { name, type, class: cls, ttl, rdlength, rdata },
    newOffset: nameEnd + 10 + rdlength,
  };
}

/**
 * Decode a domain name from DNS wire format, handling label compression
 * pointers per RFC 1035 Section 4.1.4.
 */
export function decodeName(
  buffer: Buffer,
  offset: number,
  maxJumps = 64
): { name: string; newOffset: number } {
  const labels: string[] = [];
  let currentOffset = offset;
  let jumped = false;
  let returnOffset = offset;
  let jumps = 0;

  while (true) {
    if (currentOffset >= buffer.length) {
      throw new Error("DNS name extends beyond message");
    }

    const length = buffer[currentOffset];
    if (length === undefined) {
      throw new Error("DNS name read past buffer end");
    }

    // Check for compression pointer (top 2 bits set)
    if ((length & 0xc0) === 0xc0) {
      if (!jumped) {
        returnOffset = currentOffset + 2;
      }
      // Pointer: lower 14 bits are the offset
      const pointer = buffer.readUInt16BE(currentOffset) & 0x3fff;
      currentOffset = pointer;
      jumped = true;
      jumps++;
      if (jumps > maxJumps) {
        throw new Error("DNS name compression loop detected");
      }
      continue;
    }

    // Zero length = root label (end of name)
    if (length === 0) {
      if (!jumped) {
        returnOffset = currentOffset + 1;
      }
      break;
    }

    // Regular label
    currentOffset++;
    if (currentOffset + length > buffer.length) {
      throw new Error("DNS label extends beyond message");
    }
    labels.push(buffer.subarray(currentOffset, currentOffset + length).toString("ascii"));
    currentOffset += length;
  }

  return {
    name: labels.join("."),
    newOffset: returnOffset,
  };
}

// ─── DNS Wire Format Serializer ─────────────────────────────────────────────

/** Serialize a DNS message to wire format */
export function serializeDnsMessage(message: DnsMessage): Buffer {
  const parts: Buffer[] = [];

  // Header
  parts.push(serializeHeader(message.header));

  // Questions
  for (const q of message.questions) {
    parts.push(serializeQuestion(q));
  }

  // Answer RRs
  for (const rr of message.answers) {
    parts.push(serializeResourceRecord(rr));
  }

  // Authority RRs
  for (const rr of message.authority) {
    parts.push(serializeResourceRecord(rr));
  }

  // Additional RRs
  for (const rr of message.additional) {
    parts.push(serializeResourceRecord(rr));
  }

  return Buffer.concat(parts);
}

/** Serialize the DNS header */
function serializeHeader(header: DnsHeader): Buffer {
  const buf = Buffer.alloc(12);
  buf.writeUInt16BE(header.id, 0);

  let flags = 0;
  flags |= (header.qr & 0x1) << 15;
  flags |= (header.opcode & 0xf) << 11;
  flags |= (header.aa & 0x1) << 10;
  flags |= (header.tc & 0x1) << 9;
  flags |= (header.rd & 0x1) << 8;
  flags |= (header.ra & 0x1) << 7;
  flags |= (header.z & 0x7) << 4;
  flags |= header.rcode & 0xf;
  buf.writeUInt16BE(flags, 2);

  buf.writeUInt16BE(header.qdcount, 4);
  buf.writeUInt16BE(header.ancount, 6);
  buf.writeUInt16BE(header.nscount, 8);
  buf.writeUInt16BE(header.arcount, 10);

  return buf;
}

/** Serialize a question */
function serializeQuestion(question: DnsQuestion): Buffer {
  const nameBuf = encodeName(question.name);
  const buf = Buffer.alloc(nameBuf.length + 4);
  nameBuf.copy(buf, 0);
  buf.writeUInt16BE(question.type, nameBuf.length);
  buf.writeUInt16BE(question.class, nameBuf.length + 2);
  return buf;
}

/** Serialize a resource record */
function serializeResourceRecord(rr: DnsResourceRecord): Buffer {
  const nameBuf = encodeName(rr.name);
  const buf = Buffer.alloc(nameBuf.length + 10 + rr.rdata.length);
  nameBuf.copy(buf, 0);
  const offset = nameBuf.length;
  buf.writeUInt16BE(rr.type, offset);
  buf.writeUInt16BE(rr.class, offset + 2);
  buf.writeUInt32BE(rr.ttl, offset + 4);
  buf.writeUInt16BE(rr.rdata.length, offset + 8);
  rr.rdata.copy(buf, offset + 10);
  return buf;
}

/** Encode a domain name into DNS wire format labels */
export function encodeName(name: string): Buffer {
  const normalized = name.replace(/\.$/, "");
  if (normalized.length === 0) {
    return Buffer.from([0]);
  }

  const labels = normalized.split(".");
  const parts: Buffer[] = [];
  for (const label of labels) {
    if (label.length > 63) {
      throw new Error(`DNS label too long: "${label}" (max 63 characters)`);
    }
    const labelBuf = Buffer.alloc(1 + label.length);
    labelBuf[0] = label.length;
    Buffer.from(label, "ascii").copy(labelBuf, 1);
    parts.push(labelBuf);
  }
  parts.push(Buffer.from([0])); // Root label
  return Buffer.concat(parts);
}

/**
 * Encode RDATA for a given record type.
 * Converts human-readable values to DNS wire format.
 */
export function encodeRdata(
  type: RecordType,
  value: string,
  priority?: number
): Buffer {
  switch (type) {
    case RecordType.A: {
      const parts = value.split(".").map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
        throw new Error(`Invalid IPv4 address: ${value}`);
      }
      return Buffer.from(parts);
    }

    case RecordType.AAAA: {
      return encodeIPv6(value);
    }

    case RecordType.MX: {
      const pref = priority ?? 10;
      const nameBuf = encodeName(value);
      const buf = Buffer.alloc(2 + nameBuf.length);
      buf.writeUInt16BE(pref, 0);
      nameBuf.copy(buf, 2);
      return buf;
    }

    case RecordType.CNAME:
    case RecordType.NS: {
      return encodeName(value);
    }

    case RecordType.TXT: {
      // TXT records: split into 255-byte character strings
      const data = Buffer.from(value, "utf-8");
      const parts: Buffer[] = [];
      let offset = 0;
      while (offset < data.length) {
        const chunkLen = Math.min(255, data.length - offset);
        const chunk = Buffer.alloc(1 + chunkLen);
        chunk[0] = chunkLen;
        data.copy(chunk, 1, offset, offset + chunkLen);
        parts.push(chunk);
        offset += chunkLen;
      }
      return Buffer.concat(parts);
    }

    case RecordType.SRV: {
      // SRV RDATA: priority (2) + weight (2) + port (2) + target
      const srvParts = value.split(" ");
      if (srvParts.length < 4 || srvParts[0] === undefined || srvParts[1] === undefined || srvParts[2] === undefined || srvParts[3] === undefined) {
        throw new Error("SRV value must be: priority weight port target");
      }
      const srvPriority = parseInt(srvParts[0], 10);
      const weight = parseInt(srvParts[1], 10);
      const port = parseInt(srvParts[2], 10);
      const target = srvParts[3];
      const targetBuf = encodeName(target);
      const buf = Buffer.alloc(6 + targetBuf.length);
      buf.writeUInt16BE(srvPriority, 0);
      buf.writeUInt16BE(weight, 2);
      buf.writeUInt16BE(port, 4);
      targetBuf.copy(buf, 6);
      return buf;
    }

    default:
      return Buffer.from(value, "utf-8");
  }
}

/** Encode an IPv6 address to 16 bytes */
function encodeIPv6(address: string): Buffer {
  // Expand :: notation
  let expanded = address;
  if (expanded.includes("::")) {
    const sides = expanded.split("::");
    const left = sides[0] ? sides[0].split(":") : [];
    const right = sides[1] ? sides[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const middle = Array(missing).fill("0");
    expanded = [...left, ...middle, ...right].join(":");
  }

  const groups = expanded.split(":");
  if (groups.length !== 8) {
    throw new Error(`Invalid IPv6 address: ${address}`);
  }

  const buf = Buffer.alloc(16);
  for (let i = 0; i < 8; i++) {
    const group = groups[i] ?? "0";
    buf.writeUInt16BE(parseInt(group, 16), i * 2);
  }
  return buf;
}
