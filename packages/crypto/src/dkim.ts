/**
 * DKIM (DomainKeys Identified Mail) signing and verification.
 *
 * Implements RFC 6376 for email authentication via cryptographic signatures.
 * Supports RSA-SHA256 and Ed25519-SHA256 signing algorithms.
 */

import { createHash, createSign, createVerify, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify, KeyObject, createPrivateKey, createPublicKey } from "node:crypto";
import { type Result, ok, err } from "@emailed/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported DKIM signing algorithms. */
export type DkimAlgorithm = "rsa-sha256" | "ed25519-sha256";

/** Canonicalization method for headers and body. */
export type CanonicalizationMethod = "relaxed" | "simple";

/** Full canonicalization specification (header/body). */
export interface Canonicalization {
  readonly header: CanonicalizationMethod;
  readonly body: CanonicalizationMethod;
}

/** Parameters required to generate a DKIM signature. */
export interface DkimSignOptions {
  /** The signing domain (d= tag). */
  readonly domain: string;
  /** The DKIM selector (s= tag). */
  readonly selector: string;
  /** PEM-encoded private key. */
  readonly privateKey: string;
  /** Signing algorithm. Defaults to "rsa-sha256". */
  readonly algorithm?: DkimAlgorithm;
  /** Canonicalization method. Defaults to relaxed/relaxed. */
  readonly canonicalization?: Canonicalization;
  /** Headers to sign. Defaults to recommended set. */
  readonly headersToSign?: readonly string[];
  /** Signature expiration in seconds from now. */
  readonly expiresIn?: number;
  /** Maximum body length to hash (l= tag). Omit for full body. */
  readonly bodyLength?: number;
}

/** A parsed DKIM-Signature header. */
export interface DkimSignature {
  readonly version: 1;
  readonly algorithm: DkimAlgorithm;
  readonly domain: string;
  readonly selector: string;
  readonly canonicalization: Canonicalization;
  readonly signedHeaders: readonly string[];
  readonly bodyHash: string;
  readonly signature: string;
  readonly timestamp: number;
  readonly expiration?: number;
  readonly bodyLength?: number;
  readonly identity?: string;
}

/** Result of a DKIM verification. */
export interface DkimVerifyResult {
  readonly valid: boolean;
  readonly domain: string;
  readonly selector: string;
  readonly algorithm: DkimAlgorithm;
  readonly reason?: string;
}

/** A generated DKIM key pair with DNS record value. */
export interface DkimKeyPair {
  readonly privateKeyPem: string;
  readonly publicKeyPem: string;
  /** Base64-encoded public key suitable for DNS TXT record. */
  readonly dnsRecordValue: string;
  readonly selector: string;
  readonly domain: string;
  readonly algorithm: DkimAlgorithm;
}

/** Default headers that should be signed per RFC 6376 recommendations. */
const DEFAULT_HEADERS_TO_SIGN: readonly string[] = [
  "from",
  "to",
  "subject",
  "date",
  "message-id",
  "content-type",
  "mime-version",
  "reply-to",
  "cc",
  "in-reply-to",
  "references",
] as const;

const CRLF = "\r\n";

// ---------------------------------------------------------------------------
// Canonicalization
// ---------------------------------------------------------------------------

/**
 * Apply simple header canonicalization per RFC 6376 section 3.4.1.
 * Headers are used exactly as presented, with no modification.
 */
function canonicalizeHeaderSimple(name: string, value: string): string {
  return `${name}:${value}`;
}

/**
 * Apply relaxed header canonicalization per RFC 6376 section 3.4.2.
 * - Convert header name to lowercase
 * - Unfold header values (remove CRLF before whitespace)
 * - Compress whitespace sequences to single space
 * - Trim trailing whitespace
 */
function canonicalizeHeaderRelaxed(name: string, value: string): string {
  const normalizedName = name.toLowerCase().trim();
  let normalizedValue = value
    .replace(/\r\n(?=[ \t])/g, "") // unfold continuation lines
    .replace(/[ \t]+/g, " ")       // compress whitespace
    .trim();
  return `${normalizedName}:${normalizedValue}`;
}

/**
 * Apply simple body canonicalization per RFC 6376 section 3.4.3.
 * - Ensure body ends with CRLF
 * - Remove trailing empty lines (but keep one final CRLF)
 */
function canonicalizeBodySimple(body: string): string {
  if (body.length === 0) {
    return CRLF;
  }

  // Normalize line endings to CRLF
  let normalized = body.replace(/\r?\n/g, CRLF);

  // Remove trailing empty lines
  while (normalized.endsWith(CRLF + CRLF)) {
    normalized = normalized.slice(0, -CRLF.length);
  }

  // Ensure it ends with exactly one CRLF
  if (!normalized.endsWith(CRLF)) {
    normalized += CRLF;
  }

  return normalized;
}

/**
 * Apply relaxed body canonicalization per RFC 6376 section 3.4.4.
 * - Reduce whitespace sequences to single space
 * - Remove trailing whitespace on each line
 * - Remove trailing empty lines
 * - Ensure body ends with CRLF
 */
function canonicalizeBodyRelaxed(body: string): string {
  if (body.length === 0) {
    return "";
  }

  // Normalize line endings to CRLF
  const normalized = body.replace(/\r?\n/g, CRLF);

  const lines = normalized.split(CRLF);
  const processedLines: string[] = [];

  for (const line of lines) {
    // Replace whitespace runs with single space, then trim trailing whitespace
    const processed = line.replace(/[ \t]+/g, " ").replace(/[ \t]+$/, "");
    processedLines.push(processed);
  }

  // Rejoin and remove trailing empty lines
  let result = processedLines.join(CRLF);

  while (result.endsWith(CRLF + CRLF)) {
    result = result.slice(0, -CRLF.length);
  }

  // Remove final completely empty content
  if (result === CRLF || result === "") {
    return "";
  }

  if (!result.endsWith(CRLF)) {
    result += CRLF;
  }

  return result;
}

/** Canonicalize a header field using the specified method. */
export function canonicalizeHeader(
  name: string,
  value: string,
  method: CanonicalizationMethod,
): string {
  return method === "relaxed"
    ? canonicalizeHeaderRelaxed(name, value)
    : canonicalizeHeaderSimple(name, value);
}

/** Canonicalize a message body using the specified method. */
export function canonicalizeBody(
  body: string,
  method: CanonicalizationMethod,
): string {
  return method === "relaxed"
    ? canonicalizeBodyRelaxed(body)
    : canonicalizeBodySimple(body);
}

// ---------------------------------------------------------------------------
// Header parsing helpers
// ---------------------------------------------------------------------------

/** Parse raw email into headers array and body. */
function parseMessage(rawMessage: string): {
  headers: Array<{ name: string; value: string }>;
  body: string;
} {
  // Split on first empty line (CRLF CRLF or LF LF)
  const separatorIdx = rawMessage.indexOf(CRLF + CRLF);
  const lfSeparatorIdx = rawMessage.indexOf("\n\n");

  let headerPart: string;
  let body: string;

  if (separatorIdx !== -1 && (lfSeparatorIdx === -1 || separatorIdx <= lfSeparatorIdx)) {
    headerPart = rawMessage.slice(0, separatorIdx);
    body = rawMessage.slice(separatorIdx + 4);
  } else if (lfSeparatorIdx !== -1) {
    headerPart = rawMessage.slice(0, lfSeparatorIdx);
    body = rawMessage.slice(lfSeparatorIdx + 2);
  } else {
    headerPart = rawMessage;
    body = "";
  }

  // Parse header fields, handling continuation lines
  const headerLines = headerPart.replace(/\r?\n/g, "\n").split("\n");
  const headers: Array<{ name: string; value: string }> = [];

  for (const line of headerLines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // Continuation line — append to previous header
      const last = headers[headers.length - 1];
      if (last) {
        last.value += " " + line.trim();
      }
    } else {
      const colonIdx = line.indexOf(":");
      if (colonIdx > 0) {
        headers.push({
          name: line.slice(0, colonIdx),
          value: line.slice(colonIdx + 1),
        });
      }
    }
  }

  return { headers, body };
}

// ---------------------------------------------------------------------------
// Body hash computation
// ---------------------------------------------------------------------------

/** Compute the body hash for a DKIM signature. */
function computeBodyHash(
  body: string,
  canonMethod: CanonicalizationMethod,
  algorithm: DkimAlgorithm,
  bodyLength?: number,
): string {
  let canonicalBody = canonicalizeBody(body, canonMethod);

  if (bodyLength !== undefined && bodyLength >= 0) {
    canonicalBody = canonicalBody.slice(0, bodyLength);
  }

  const hashAlg = algorithm === "rsa-sha256" ? "sha256" : "sha256";
  return createHash(hashAlg).update(canonicalBody).digest("base64");
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/**
 * Generate a DKIM-Signature header for a raw email message.
 *
 * @param rawMessage - The complete email message (headers + body)
 * @param options - DKIM signing parameters
 * @returns Result containing the DKIM-Signature header value or an error
 */
export function signMessage(
  rawMessage: string,
  options: DkimSignOptions,
): Result<string, Error> {
  const {
    domain,
    selector,
    privateKey,
    algorithm = "rsa-sha256",
    canonicalization = { header: "relaxed", body: "relaxed" },
    headersToSign = DEFAULT_HEADERS_TO_SIGN,
    expiresIn,
    bodyLength,
  } = options;

  const { headers, body } = parseMessage(rawMessage);

  // Compute body hash
  const bodyHash = computeBodyHash(body, canonicalization.body, algorithm, bodyLength);

  // Build the DKIM-Signature value without the b= data
  const timestamp = Math.floor(Date.now() / 1000);
  const canonSpec = `${canonicalization.header}/${canonicalization.body}`;

  // Find which requested headers are actually present
  const presentHeaders: string[] = [];
  const headerLowerMap = new Map<string, Array<{ name: string; value: string }>>();

  for (const h of headers) {
    const lower = h.name.toLowerCase();
    const existing = headerLowerMap.get(lower);
    if (existing) {
      existing.push(h);
    } else {
      headerLowerMap.set(lower, [h]);
    }
  }

  for (const requestedHeader of headersToSign) {
    const lower = requestedHeader.toLowerCase();
    if (headerLowerMap.has(lower)) {
      presentHeaders.push(lower);
    }
  }

  // Build the tag list
  const tags: string[] = [
    `v=1`,
    `a=${algorithm}`,
    `c=${canonSpec}`,
    `d=${domain}`,
    `s=${selector}`,
    `t=${timestamp}`,
    `h=${presentHeaders.join(":")}`,
    `bh=${bodyHash}`,
  ];

  if (expiresIn !== undefined) {
    tags.push(`x=${timestamp + expiresIn}`);
  }
  if (bodyLength !== undefined) {
    tags.push(`l=${bodyLength}`);
  }

  const signatureHeaderValue = tags.join("; ") + "; b=";

  // Build the header data to sign
  const headerFragments: string[] = [];

  for (const headerName of presentHeaders) {
    const entries = headerLowerMap.get(headerName);
    if (entries && entries.length > 0) {
      const entry = entries[0]!;
      headerFragments.push(
        canonicalizeHeader(entry.name, entry.value, canonicalization.header),
      );
    }
  }

  // Add the DKIM-Signature header itself (without trailing CRLF)
  headerFragments.push(
    canonicalizeHeader("DKIM-Signature", " " + signatureHeaderValue, canonicalization.header),
  );

  const dataToSign = headerFragments.join(CRLF);

  // Sign the data
  try {
    let signatureB64: string;

    if (algorithm === "rsa-sha256") {
      const signer = createSign("RSA-SHA256");
      signer.update(dataToSign);
      signer.end();
      signatureB64 = signer.sign(privateKey, "base64");
    } else {
      // Ed25519-SHA256: hash first, then sign with Ed25519
      const hash = createHash("sha256").update(dataToSign).digest();
      const key = createPrivateKey(privateKey);
      const sig = cryptoSign(null, hash, key);
      signatureB64 = sig.toString("base64");
    }

    // Format the complete DKIM-Signature header with line folding
    const fullValue = signatureHeaderValue + signatureB64;
    const foldedValue = foldHeaderValue(fullValue);

    return ok(`DKIM-Signature: ${foldedValue}`);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Fold a long header value at 76 characters for RFC compliance.
 */
function foldHeaderValue(value: string): string {
  const maxLen = 76;
  if (value.length <= maxLen) {
    return value;
  }

  const parts: string[] = [];
  let remaining = value;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      parts.push(remaining);
      break;
    }

    // Find a good break point (at a semicolon or space)
    let breakAt = -1;
    for (let i = maxLen - 1; i >= 20; i--) {
      if (remaining[i] === ";" || remaining[i] === " ") {
        breakAt = i + 1;
        break;
      }
    }

    if (breakAt === -1) {
      breakAt = maxLen;
    }

    parts.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt);
  }

  return parts.join(CRLF + "\t");
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** Parse a DKIM-Signature header value into a structured object. */
export function parseSignatureHeader(headerValue: string): Result<DkimSignature, Error> {
  const tagMap = new Map<string, string>();

  const tagParts = headerValue.split(";");
  for (const part of tagParts) {
    const trimmed = part.trim();
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const tagName = trimmed.slice(0, eqIdx).trim();
      const tagValue = trimmed.slice(eqIdx + 1).trim();
      tagMap.set(tagName, tagValue);
    }
  }

  const version = tagMap.get("v");
  if (version !== "1") {
    return err(new Error(`Unsupported DKIM version: ${version ?? "missing"}`));
  }

  const algorithmStr = tagMap.get("a");
  if (algorithmStr !== "rsa-sha256" && algorithmStr !== "ed25519-sha256") {
    return err(new Error(`Unsupported DKIM algorithm: ${algorithmStr ?? "missing"}`));
  }

  const domain = tagMap.get("d");
  if (!domain) {
    return err(new Error("Missing DKIM domain (d= tag)"));
  }

  const selector = tagMap.get("s");
  if (!selector) {
    return err(new Error("Missing DKIM selector (s= tag)"));
  }

  const canonStr = tagMap.get("c") ?? "simple/simple";
  const canonParts = canonStr.split("/");
  const headerCanon = (canonParts[0] ?? "simple") as CanonicalizationMethod;
  const bodyCanon = (canonParts[1] ?? headerCanon) as CanonicalizationMethod;

  const signedHeadersStr = tagMap.get("h");
  if (!signedHeadersStr) {
    return err(new Error("Missing signed headers (h= tag)"));
  }

  const bodyHash = tagMap.get("bh");
  if (!bodyHash) {
    return err(new Error("Missing body hash (bh= tag)"));
  }

  const signature = tagMap.get("b");
  if (!signature) {
    return err(new Error("Missing signature (b= tag)"));
  }

  const timestampStr = tagMap.get("t");
  const timestamp = timestampStr ? parseInt(timestampStr, 10) : Math.floor(Date.now() / 1000);

  const expirationStr = tagMap.get("x");
  const expiration = expirationStr ? parseInt(expirationStr, 10) : undefined;

  const bodyLengthStr = tagMap.get("l");
  const parsedBodyLength = bodyLengthStr ? parseInt(bodyLengthStr, 10) : undefined;

  const identity = tagMap.get("i");

  const parsed: DkimSignature = {
    version: 1,
    algorithm: algorithmStr,
    domain,
    selector,
    canonicalization: { header: headerCanon, body: bodyCanon },
    signedHeaders: signedHeadersStr.split(":").map((h) => h.trim()),
    bodyHash,
    signature: signature.replace(/\s+/g, ""),
    timestamp,
    ...(expiration !== undefined ? { expiration } : {}),
    ...(parsedBodyLength !== undefined ? { bodyLength: parsedBodyLength } : {}),
    ...(identity !== undefined ? { identity } : {}),
  };

  return ok(parsed);
}

/**
 * Verify a DKIM signature on a raw email message.
 *
 * @param rawMessage - The complete raw email message
 * @param publicKeyPem - PEM-encoded public key for the signing domain
 * @returns Verification result with validity and diagnostic info
 */
export function verifySignature(
  rawMessage: string,
  publicKeyPem: string,
): Result<DkimVerifyResult, Error> {
  const { headers, body } = parseMessage(rawMessage);

  // Find the DKIM-Signature header
  const dkimHeader = headers.find(
    (h) => h.name.toLowerCase() === "dkim-signature",
  );

  if (!dkimHeader) {
    return ok({
      valid: false,
      domain: "",
      selector: "",
      algorithm: "rsa-sha256",
      reason: "No DKIM-Signature header found",
    });
  }

  const sigResult = parseSignatureHeader(dkimHeader.value);
  if (!sigResult.ok) {
    return ok({
      valid: false,
      domain: "",
      selector: "",
      algorithm: "rsa-sha256",
      reason: `Failed to parse DKIM-Signature: ${sigResult.error.message}`,
    });
  }

  const sig = sigResult.value;

  // Check expiration
  if (sig.expiration !== undefined) {
    const now = Math.floor(Date.now() / 1000);
    if (now > sig.expiration) {
      return ok({
        valid: false,
        domain: sig.domain,
        selector: sig.selector,
        algorithm: sig.algorithm,
        reason: "DKIM signature has expired",
      });
    }
  }

  // Verify body hash
  const computedBodyHash = computeBodyHash(
    body,
    sig.canonicalization.body,
    sig.algorithm,
    sig.bodyLength,
  );

  if (computedBodyHash !== sig.bodyHash) {
    return ok({
      valid: false,
      domain: sig.domain,
      selector: sig.selector,
      algorithm: sig.algorithm,
      reason: "Body hash mismatch",
    });
  }

  // Rebuild the header data that was signed
  const headerLowerMap = new Map<string, Array<{ name: string; value: string }>>();
  for (const h of headers) {
    const lower = h.name.toLowerCase();
    if (lower === "dkim-signature") continue;
    const existing = headerLowerMap.get(lower);
    if (existing) {
      existing.push(h);
    } else {
      headerLowerMap.set(lower, [h]);
    }
  }

  const headerFragments: string[] = [];
  for (const headerName of sig.signedHeaders) {
    const lower = headerName.toLowerCase();
    const entries = headerLowerMap.get(lower);
    if (entries && entries.length > 0) {
      const entry = entries[0]!;
      headerFragments.push(
        canonicalizeHeader(entry.name, entry.value, sig.canonicalization.header),
      );
    }
  }

  // Re-add DKIM-Signature header with b= tag emptied
  const dkimValueWithoutSig = dkimHeader.value.replace(
    /b=[A-Za-z0-9+/=\s]+/,
    "b=",
  );
  headerFragments.push(
    canonicalizeHeader("DKIM-Signature", dkimValueWithoutSig, sig.canonicalization.header),
  );

  const dataToVerify = headerFragments.join(CRLF);
  const signatureBuffer = Buffer.from(sig.signature, "base64");

  try {
    let isValid: boolean;

    if (sig.algorithm === "rsa-sha256") {
      const verifier = createVerify("RSA-SHA256");
      verifier.update(dataToVerify);
      verifier.end();
      isValid = verifier.verify(publicKeyPem, signatureBuffer);
    } else {
      // Ed25519-SHA256
      const hash = createHash("sha256").update(dataToVerify).digest();
      const key = createPublicKey(publicKeyPem);
      isValid = cryptoVerify(null, hash, key, signatureBuffer);
    }

    const verifyResult: DkimVerifyResult = {
      valid: isValid,
      domain: sig.domain,
      selector: sig.selector,
      algorithm: sig.algorithm,
      ...(isValid ? {} : { reason: "Signature verification failed" }),
    };
    return ok(verifyResult);
  } catch (e) {
    return ok({
      valid: false,
      domain: sig.domain,
      selector: sig.selector,
      algorithm: sig.algorithm,
      reason: `Verification error: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Key pair generation
// ---------------------------------------------------------------------------

/**
 * Generate a new DKIM key pair for a domain and selector.
 *
 * @param domain - The domain to generate keys for
 * @param selector - The DKIM selector (e.g., "em", "default", "2024")
 * @param algorithm - The signing algorithm (defaults to rsa-sha256)
 * @param keySize - RSA key size in bits (defaults to 2048, ignored for Ed25519)
 * @returns A key pair with private key, public key, and DNS record value
 */
export function generateKeyPair(
  domain: string,
  selector: string,
  algorithm: DkimAlgorithm = "rsa-sha256",
  keySize: number = 2048,
): Result<DkimKeyPair, Error> {
  try {
    let privateKeyPem: string;
    let publicKeyPem: string;

    if (algorithm === "rsa-sha256") {
      const pair = generateKeyPairSync("rsa", {
        modulusLength: keySize,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      privateKeyPem = pair.privateKey;
      publicKeyPem = pair.publicKey;
    } else {
      const pair = generateKeyPairSync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      privateKeyPem = pair.privateKey;
      publicKeyPem = pair.publicKey;
    }

    // Extract the base64-encoded public key for the DNS record
    const publicKeyBase64 = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
      .replace(/\s+/g, "");

    const keyType = algorithm === "rsa-sha256" ? "rsa" : "ed25519";
    const dnsRecordValue = `v=DKIM1; k=${keyType}; p=${publicKeyBase64}`;

    return ok({
      privateKeyPem,
      publicKeyPem,
      dnsRecordValue,
      selector,
      domain,
      algorithm,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Generate the DNS TXT record name for a DKIM selector and domain.
 *
 * @example
 *   dkimRecordName("em", "example.com") // "em._domainkey.example.com"
 */
export function dkimRecordName(selector: string, domain: string): string {
  return `${selector}._domainkey.${domain}`;
}

/**
 * Validate that a private key matches a public key by performing a
 * sign/verify round-trip.
 */
export function validateKeyPair(
  privateKeyPem: string,
  publicKeyPem: string,
  algorithm: DkimAlgorithm = "rsa-sha256",
): Result<boolean, Error> {
  const testData = "dkim-key-validation-test";

  try {
    if (algorithm === "rsa-sha256") {
      const signer = createSign("RSA-SHA256");
      signer.update(testData);
      signer.end();
      const signature = signer.sign(privateKeyPem);

      const verifier = createVerify("RSA-SHA256");
      verifier.update(testData);
      verifier.end();
      const isValid = verifier.verify(publicKeyPem, signature);

      return ok(isValid);
    } else {
      const key = createPrivateKey(privateKeyPem);
      const pubKey = createPublicKey(publicKeyPem);
      const hash = createHash("sha256").update(testData).digest();
      const signature = cryptoSign(null, hash, key);
      const isValid = cryptoVerify(null, hash, pubKey, signature);
      return ok(isValid);
    }
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
