/**
 * DKIM Signature Verification (RFC 6376)
 *
 * Verifies DKIM-Signature headers on inbound email by:
 *   1. Parsing DKIM-Signature tag=value pairs
 *   2. Fetching the public key from DNS ({selector}._domainkey.{domain})
 *   3. Canonicalizing headers and body per the declared algorithm
 *   4. Verifying the body hash (bh=) and RSA/Ed25519 signature (b=)
 *
 * Uses only Node.js built-in `crypto` and `dns` modules.
 */

import * as crypto from "node:crypto";
import * as dns from "node:dns/promises";

// ─── Types ──────────────────────────────────────────────────────────────────

export type DkimResultStatus = "pass" | "fail" | "neutral" | "temperror" | "permerror" | "none";

export interface DkimVerifyResult {
  status: DkimResultStatus;
  domain: string;
  selector: string;
  details: string;
}

interface DkimSignatureFields {
  /** Version — must be "1" */
  v: string;
  /** Algorithm — "rsa-sha256" or "ed25519-sha256" */
  a: string;
  /** Signature data (base64) */
  b: string;
  /** Body hash (base64) */
  bh: string;
  /** Canonicalization — "header/body", e.g. "relaxed/relaxed" */
  c: string;
  /** Signing domain */
  d: string;
  /** Signed header fields (colon-separated) */
  h: string;
  /** Selector */
  s: string;
  /** Body length limit (optional) */
  l?: string;
  /** Timestamp (optional) */
  t?: string;
  /** Signature expiration (optional) */
  x?: string;
}

interface DkimPublicKeyRecord {
  /** Key type: "rsa" (default) or "ed25519" */
  k: string;
  /** Base64-encoded public key */
  p: string;
  /** Flags: "y" = testing, "s" = exact domain match */
  t: string;
}

// ─── Main entry point ───────────────────────────────────────────────────────

/**
 * Verify all DKIM signatures on a message.
 *
 * @param rawHeaders  The raw header block of the message (before the blank-line separator)
 * @param rawBody     The raw body of the message (after the blank-line separator)
 * @returns Array of results, one per DKIM-Signature header, best result first.
 */
export async function verifyDkim(
  rawHeaders: string,
  rawBody: Uint8Array,
): Promise<DkimVerifyResult[]> {
  const dkimHeaders = extractDkimSignatureHeaders(rawHeaders);

  if (dkimHeaders.length === 0) {
    return [{
      status: "none",
      domain: "",
      selector: "",
      details: "No DKIM-Signature header found",
    }];
  }

  const results: DkimVerifyResult[] = [];

  for (const dkimHeader of dkimHeaders) {
    const result = await verifySingleSignature(rawHeaders, rawBody, dkimHeader);
    results.push(result);
  }

  // Sort: pass first, then neutral, then fail, then errors
  const order: Record<DkimResultStatus, number> = {
    pass: 0,
    neutral: 1,
    fail: 2,
    temperror: 3,
    permerror: 4,
    none: 5,
  };
  results.sort((a, b) => order[a.status] - order[b.status]);

  return results;
}

// ─── Single signature verification ─────────────────────────────────────────

async function verifySingleSignature(
  rawHeaders: string,
  rawBody: Uint8Array,
  dkimHeaderRaw: string,
): Promise<DkimVerifyResult> {
  // 1. Parse the DKIM-Signature header tags
  let fields: DkimSignatureFields;
  try {
    fields = parseDkimSignature(dkimHeaderRaw);
  } catch (e) {
    return {
      status: "permerror",
      domain: "",
      selector: "",
      details: `Failed to parse DKIM-Signature: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  const { a: algorithm, d: domain, s: selector } = fields;

  // 2. Validate version
  if (fields.v !== "1") {
    return {
      status: "permerror",
      domain,
      selector,
      details: `Unsupported DKIM version: ${fields.v}`,
    };
  }

  // 3. Validate algorithm
  if (algorithm !== "rsa-sha256" && algorithm !== "ed25519-sha256") {
    return {
      status: "permerror",
      domain,
      selector,
      details: `Unsupported algorithm: ${algorithm}`,
    };
  }

  // 4. Check expiration
  if (fields.x) {
    const expiration = parseInt(fields.x, 10);
    const now = Math.floor(Date.now() / 1000);
    if (now > expiration) {
      return {
        status: "fail",
        domain,
        selector,
        details: `Signature expired at ${new Date(expiration * 1000).toISOString()}`,
      };
    }
  }

  // 5. Fetch the public key from DNS
  let publicKeyRecord: DkimPublicKeyRecord;
  try {
    publicKeyRecord = await fetchDkimPublicKey(selector, domain);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // DNS temporary failures -> temperror; parse/not-found -> permerror
    const isTemp = msg.includes("SERVFAIL") || msg.includes("ETIMEOUT") || msg.includes("timeout");
    return {
      status: isTemp ? "temperror" : "permerror",
      domain,
      selector,
      details: `DNS key lookup failed for ${selector}._domainkey.${domain}: ${msg}`,
    };
  }

  // 6. Revoked key (empty p= tag)
  if (!publicKeyRecord.p) {
    return {
      status: "fail",
      domain,
      selector,
      details: "DKIM key has been revoked (empty p= tag)",
    };
  }

  // 7. Check key type matches algorithm
  const expectedKeyType = algorithm === "ed25519-sha256" ? "ed25519" : "rsa";
  if (publicKeyRecord.k !== expectedKeyType) {
    return {
      status: "permerror",
      domain,
      selector,
      details: `Key type mismatch: algorithm=${algorithm} but key type=${publicKeyRecord.k}`,
    };
  }

  // 8. Parse canonicalization method
  const [headerCanon, bodyCanon] = parseCanonicalization(fields.c);

  // 9. Verify body hash
  const bodyString = new TextDecoder().decode(rawBody);
  const canonicalBody = canonicalizeBody(bodyString, bodyCanon);
  const bodyToHash = fields.l !== undefined
    ? canonicalBody.substring(0, parseInt(fields.l, 10))
    : canonicalBody;
  const computedBodyHash = crypto.createHash("sha256").update(bodyToHash).digest("base64");

  if (computedBodyHash !== fields.bh) {
    return {
      status: "fail",
      domain,
      selector,
      details: `Body hash mismatch: computed=${computedBodyHash}, expected=${fields.bh}`,
    };
  }

  // 10. Reconstruct the header block that was signed
  const parsedHeaders = parseHeaders(rawHeaders);
  const signedHeaderNames = fields.h.split(":").map((h) => h.trim().toLowerCase());
  const canonicalHeaders = canonicalizeSignedHeaders(parsedHeaders, signedHeaderNames, headerCanon);

  // The DKIM-Signature header itself is included with b= emptied
  const dkimHeaderWithEmptyB = emptyBTag(dkimHeaderRaw);
  const canonicalDkimHeader = canonicalizeHeaderLine(dkimHeaderWithEmptyB, headerCanon);
  const dataToVerify = canonicalHeaders + canonicalDkimHeader;

  // 11. Verify the cryptographic signature
  try {
    const verified = verifySignature(
      algorithm,
      publicKeyRecord.p,
      publicKeyRecord.k,
      dataToVerify,
      fields.b,
    );

    if (verified) {
      return {
        status: "pass",
        domain,
        selector,
        details: `DKIM ${algorithm} signature verified for ${domain} (selector: ${selector})`,
      };
    } else {
      return {
        status: "fail",
        domain,
        selector,
        details: `Signature verification failed for ${domain} (selector: ${selector})`,
      };
    }
  } catch (e) {
    return {
      status: "permerror",
      domain,
      selector,
      details: `Signature verification error: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ─── DKIM-Signature parsing ─────────────────────────────────────────────────

/**
 * Extract all DKIM-Signature header lines from the raw header block.
 * Returns each one as its full raw text (including folded continuation lines).
 */
function extractDkimSignatureHeaders(rawHeaders: string): string[] {
  const results: string[] = [];
  const lines = rawHeaders.split(/\r?\n/);

  let current: string | null = null;
  let isDkim = false;

  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      // Continuation line
      if (current !== null) {
        current += "\r\n" + line;
      }
    } else {
      // New header — flush previous if it was a DKIM-Signature
      if (isDkim && current !== null) {
        results.push(current);
      }
      current = line;
      isDkim = /^dkim-signature\s*:/i.test(line);
    }
  }

  // Flush the last header
  if (isDkim && current !== null) {
    results.push(current);
  }

  return results;
}

/**
 * Parse tag=value pairs from a DKIM-Signature header value.
 */
function parseDkimSignature(rawHeader: string): DkimSignatureFields {
  // Extract the value part (everything after "DKIM-Signature:")
  const colonIdx = rawHeader.indexOf(":");
  if (colonIdx === -1) {
    throw new Error("Invalid DKIM-Signature header: no colon separator");
  }

  let value = rawHeader.substring(colonIdx + 1);
  // Unfold continuation lines
  value = value.replace(/\r?\n[ \t]/g, " ");

  const tags = new Map<string, string>();
  // Split on semicolons, trimming whitespace from each tag=value pair
  for (const part of value.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const tagName = trimmed.substring(0, eqIdx).trim();
    const tagValue = trimmed.substring(eqIdx + 1).trim();
    tags.set(tagName, tagValue);
  }

  // Validate required tags
  const required = ["v", "a", "b", "bh", "d", "h", "s"] as const;
  for (const tag of required) {
    if (!tags.has(tag)) {
      throw new Error(`Missing required DKIM tag: ${tag}`);
    }
  }

  // Strip whitespace from base64 values (they may be folded)
  const b = (tags.get("b") ?? "").replace(/\s+/g, "");
  const bh = (tags.get("bh") ?? "").replace(/\s+/g, "");

  const result: DkimSignatureFields = {
    v: tags.get("v") ?? "",
    a: tags.get("a") ?? "",
    b,
    bh,
    c: tags.get("c") ?? "simple/simple",
    d: tags.get("d") ?? "",
    h: tags.get("h") ?? "",
    s: tags.get("s") ?? "",
  };

  const l = tags.get("l");
  if (l !== undefined) result.l = l;
  const t = tags.get("t");
  if (t !== undefined) result.t = t;
  const x = tags.get("x");
  if (x !== undefined) result.x = x;

  return result;
}

/**
 * Return the DKIM-Signature header with the b= value emptied (for signature verification).
 * Per RFC 6376 Section 3.5: the value of b= is replaced with an empty string.
 */
function emptyBTag(rawHeader: string): string {
  // Unfold first so we can find the b= tag reliably
  const unfolded = rawHeader.replace(/\r?\n[ \t]/g, " ");
  // Replace b=<base64> with b= (keep everything else)
  // The b= value continues until the next semicolon or end of string
  return unfolded.replace(/b=[^;]*/, "b=");
}

// ─── DNS key lookup ─────────────────────────────────────────────────────────

/**
 * Fetch and parse a DKIM public key record from DNS.
 */
async function fetchDkimPublicKey(selector: string, domain: string): Promise<DkimPublicKeyRecord> {
  const name = `${selector}._domainkey.${domain}`;

  let records: string[][];
  try {
    records = await dns.resolveTxt(name);
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      throw new Error(`No DKIM key found at ${name}`, { cause: e });
    }
    throw e;
  }

  if (records.length === 0) {
    throw new Error(`No DKIM TXT record found at ${name}`);
  }

  // TXT records may be split into multiple strings; concatenate them
  const firstRecord = records[0];
  if (!firstRecord) {
    throw new Error(`No DKIM TXT record found at ${name}`);
  }
  const txtValue = firstRecord.join("");

  return parseDkimDnsRecord(txtValue);
}

/**
 * Parse a DKIM DNS TXT record into its component tags.
 *
 * Example: "v=DKIM1; k=rsa; p=MIGfMA0GCSq..."
 */
function parseDkimDnsRecord(txt: string): DkimPublicKeyRecord {
  const tags = new Map<string, string>();

  for (const part of txt.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const tagName = trimmed.substring(0, eqIdx).trim();
    const tagValue = trimmed.substring(eqIdx + 1).trim();
    tags.set(tagName, tagValue);
  }

  // Validate version if present
  const version = tags.get("v");
  if (version && version !== "DKIM1") {
    throw new Error(`Unsupported DKIM key version: ${version}`);
  }

  const p = (tags.get("p") ?? "").replace(/\s+/g, "");

  return {
    k: tags.get("k") ?? "rsa",
    p,
    t: tags.get("t") ?? "",
  };
}

// ─── Canonicalization ───────────────────────────────────────────────────────

function parseCanonicalization(c: string): ["simple" | "relaxed", "simple" | "relaxed"] {
  const parts = c.split("/");
  const header = parts[0] === "relaxed" ? "relaxed" : "simple";
  const body = (parts[1] ?? parts[0]) === "relaxed" ? "relaxed" : "simple";
  return [header, body];
}

/**
 * Parse the raw header block into individual header entries, respecting folding.
 */
function parseHeaders(headerBlock: string): { key: string; raw: string }[] {
  const headers: { key: string; raw: string }[] = [];
  const lines = headerBlock.split(/\r?\n/);

  let currentHeader = "";

  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      // Continuation (folded header)
      currentHeader += "\r\n" + line;
    } else {
      if (currentHeader) {
        const colonIndex = currentHeader.indexOf(":");
        if (colonIndex > 0) {
          headers.push({
            key: currentHeader.substring(0, colonIndex).toLowerCase(),
            raw: currentHeader,
          });
        }
      }
      currentHeader = line;
    }
  }

  // Flush last header
  if (currentHeader) {
    const colonIndex = currentHeader.indexOf(":");
    if (colonIndex > 0) {
      headers.push({
        key: currentHeader.substring(0, colonIndex).toLowerCase(),
        raw: currentHeader,
      });
    }
  }

  return headers;
}

/**
 * Canonicalize the signed headers (listed in h= tag) and join them.
 *
 * Per RFC 6376 Section 5.4.2: headers in the h= list are matched from the
 * bottom of the header block upward, consuming each occurrence once.
 */
function canonicalizeSignedHeaders(
  headers: { key: string; raw: string }[],
  signedHeaderNames: string[],
  mode: "simple" | "relaxed",
): string {
  const result: string[] = [];

  // Build a map of header occurrences (in order from top to bottom).
  // For each header name we track an index of the next occurrence to use,
  // scanning from bottom to top (RFC 6376 5.4.2).
  const headersByKey = new Map<string, { key: string; raw: string }[]>();
  for (const h of headers) {
    const existing = headersByKey.get(h.key) ?? [];
    existing.push(h);
    headersByKey.set(h.key, existing);
  }

  // Track consumption index per key (start from last occurrence)
  const consumeIndex = new Map<string, number>();
  for (const [key, arr] of headersByKey) {
    consumeIndex.set(key, arr.length - 1);
  }

  for (const name of signedHeaderNames) {
    const key = name.toLowerCase();
    const arr = headersByKey.get(key);
    const idx = consumeIndex.get(key) ?? -1;

    if (arr && idx >= 0) {
      const header = arr[idx];
      if (header) {
        result.push(canonicalizeHeaderLine(header.raw, mode) + "\r\n");
        consumeIndex.set(key, idx - 1);
      }
    }
    // If the header is not present, it is simply omitted (RFC 6376 5.4)
  }

  return result.join("");
}

/**
 * Canonicalize a single header line.
 */
function canonicalizeHeaderLine(line: string, mode: "simple" | "relaxed"): string {
  if (mode === "simple") {
    return line;
  }

  // Relaxed canonicalization (RFC 6376 Section 3.4.2):
  // 1. Header name to lowercase
  // 2. Unfold headers (remove CRLF before whitespace)
  // 3. Collapse whitespace runs to single space
  // 4. Remove leading/trailing whitespace in value
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) return line;

  const name = line.substring(0, colonIndex).toLowerCase().trim();
  let value = line.substring(colonIndex + 1);

  // Unfold
  value = value.replace(/\r?\n[ \t]/g, " ");
  // Collapse whitespace
  value = value.replace(/[ \t]+/g, " ");
  // Trim
  value = value.trim();

  return `${name}:${value}`;
}

/**
 * Canonicalize the email body.
 */
function canonicalizeBody(body: string, mode: "simple" | "relaxed"): string {
  if (mode === "simple") {
    // Simple body canonicalization (RFC 6376 Section 3.4.3):
    // - Normalize line endings to CRLF
    // - Remove trailing empty lines
    // - Ensure single trailing CRLF
    let result = body.replace(/\r?\n/g, "\r\n");
    result = result.replace(/(\r\n)+$/, "");
    return result + "\r\n";
  }

  // Relaxed body canonicalization (RFC 6376 Section 3.4.4):
  // 1. Reduce whitespace runs to single space
  // 2. Remove trailing whitespace per line
  // 3. Remove trailing empty lines
  // 4. Ensure single trailing CRLF
  const lines = body.split(/\r?\n/);
  const canonLines = lines.map((line) => {
    let canonLine = line.replace(/[ \t]+/g, " ");
    canonLine = canonLine.replace(/[ \t]+$/, "");
    return canonLine;
  });

  // Remove trailing empty lines
  while (canonLines.length > 0 && canonLines[canonLines.length - 1] === "") {
    canonLines.pop();
  }

  if (canonLines.length === 0) {
    return "\r\n";
  }

  return canonLines.join("\r\n") + "\r\n";
}

// ─── Signature verification ─────────────────────────────────────────────────

/**
 * Verify a DKIM signature using Node.js crypto.
 */
function verifySignature(
  algorithm: string,
  publicKeyBase64: string,
  keyType: string,
  data: string,
  signatureBase64: string,
): boolean {
  const signatureBuffer = Buffer.from(signatureBase64, "base64");

  if (keyType === "ed25519") {
    // Ed25519: construct a DER-encoded public key from the raw key bytes
    const rawKey = Buffer.from(publicKeyBase64, "base64");
    const keyObject = crypto.createPublicKey({
      key: buildEd25519SpkiDer(rawKey),
      format: "der",
      type: "spki",
    });

    return crypto.verify(
      null, // Ed25519 doesn't use a separate hash algorithm
      Buffer.from(data),
      keyObject,
      signatureBuffer,
    );
  }

  // RSA-SHA256: wrap the base64 key in PEM format (SPKI)
  const pem = wrapPem(publicKeyBase64, "PUBLIC KEY");
  const keyObject = crypto.createPublicKey({ key: pem, format: "pem" });

  return crypto.verify(
    "sha256",
    Buffer.from(data),
    {
      key: keyObject,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    signatureBuffer,
  );
}

/**
 * Wrap a base64 string in PEM armor.
 */
function wrapPem(base64: string, label: string): string {
  const lines: string[] = [];
  lines.push(`-----BEGIN ${label}-----`);
  for (let i = 0; i < base64.length; i += 64) {
    lines.push(base64.substring(i, i + 64));
  }
  lines.push(`-----END ${label}-----`);
  return lines.join("\n");
}

/**
 * Build a DER-encoded SPKI structure for an Ed25519 public key.
 *
 * The SPKI for Ed25519 is:
 *   SEQUENCE {
 *     SEQUENCE { OID 1.3.101.112 }
 *     BIT STRING (0 unused bits, then the 32-byte key)
 *   }
 */
function buildEd25519SpkiDer(rawKey: Buffer): Buffer {
  // OID 1.3.101.112 = 06 03 2b 65 70
  const oid = Buffer.from([0x06, 0x03, 0x2b, 0x65, 0x70]);
  // Inner SEQUENCE wrapping the OID
  const algorithmIdentifier = Buffer.concat([
    Buffer.from([0x30, oid.length]),
    oid,
  ]);
  // BIT STRING: 1 byte for "unused bits" count (0), then the raw key
  const bitString = Buffer.concat([
    Buffer.from([0x03, rawKey.length + 1, 0x00]),
    rawKey,
  ]);
  // Outer SEQUENCE
  const total = algorithmIdentifier.length + bitString.length;
  return Buffer.concat([
    Buffer.from([0x30, total]),
    algorithmIdentifier,
    bitString,
  ]);
}
