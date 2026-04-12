/**
 * DKIM Email Signing
 * Implements RFC 6376 DomainKeys Identified Mail (DKIM) Signatures.
 * Uses RSA-SHA256 algorithm.
 */

import * as crypto from "node:crypto";
import type { DkimSignOptions, DkimSignature, DkimCanonicalization, Result } from "../types.js";
import { ok, err } from "../types.js";

const DEFAULT_HEADERS_TO_SIGN = [
  "from",
  "to",
  "cc",
  "subject",
  "date",
  "message-id",
  "mime-version",
  "content-type",
  "content-transfer-encoding",
  "reply-to",
  "in-reply-to",
  "references",
];

/**
 * Sign an email message with DKIM.
 */
export function signMessage(
  rawMessage: string,
  options: DkimSignOptions,
): Result<DkimSignature> {
  try {
    const headersToSign = options.headersToSign.length > 0
      ? options.headersToSign.map((h) => h.toLowerCase())
      : DEFAULT_HEADERS_TO_SIGN;

    const { headerPart, bodyPart } = splitMessage(rawMessage);
    const [headerCanon, bodyCanon] = parseCanonicalization(options.canonicalization);

    // Step 1: Canonicalize and hash the body
    const canonicalBody = canonicalizeBody(bodyPart, bodyCanon);
    const bodyToHash = options.bodyLengthLimit !== undefined
      ? canonicalBody.substring(0, options.bodyLengthLimit)
      : canonicalBody;
    const bodyHash = crypto
      .createHash("sha256")
      .update(bodyToHash)
      .digest("base64");

    // Step 2: Build the DKIM-Signature header value (without b= value)
    const timestamp = Math.floor(Date.now() / 1000);
    const dkimFields: Record<string, string> = {
      v: "1",
      a: "rsa-sha256",
      c: options.canonicalization,
      d: options.domain,
      s: options.selector,
      t: String(timestamp),
      bh: bodyHash,
      h: headersToSign.join(":"),
    };

    if (options.bodyLengthLimit !== undefined) {
      dkimFields["l"] = String(options.bodyLengthLimit);
    }

    // Build the header value with empty b=
    const dkimHeaderValue = Object.entries(dkimFields)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ")
      + "; b=";

    const dkimHeaderLine = `DKIM-Signature: ${dkimHeaderValue}`;

    // Step 3: Canonicalize the headers (including the DKIM-Signature header itself)
    const parsedHeaders = parseHeaders(headerPart);
    const canonicalHeaders = canonicalizeSignedHeaders(
      parsedHeaders,
      headersToSign,
      headerCanon,
    );

    // Append the DKIM-Signature header for signing (without trailing CRLF)
    const dkimForSigning = canonicalizeHeaderLine(dkimHeaderLine, headerCanon);
    const dataToSign = canonicalHeaders + dkimForSigning;

    // Step 4: Sign with RSA-SHA256
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(dataToSign);
    const signature = signer.sign(options.privateKey, "base64");

    // Step 5: Build the complete DKIM-Signature header
    const fullHeaderValue = dkimHeaderValue + foldBase64(signature);

    const result: DkimSignature = {
      raw: `DKIM-Signature: ${fullHeaderValue}`,
      headerValue: fullHeaderValue,
      domain: options.domain,
      selector: options.selector,
      algorithm: "rsa-sha256",
      bodyHash,
      signature,
      signedHeaders: headersToSign,
      timestamp,
    };

    return ok(result);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Prepend a DKIM-Signature header to a raw email message.
 */
export function addSignatureToMessage(rawMessage: string, signature: DkimSignature): string {
  return `${signature.raw}\r\n${rawMessage}`;
}

/**
 * Split a raw email message into header and body parts.
 */
function splitMessage(raw: string): { headerPart: string; bodyPart: string } {
  // Headers and body are separated by an empty line
  const crlfSep = raw.indexOf("\r\n\r\n");
  const lfSep = raw.indexOf("\n\n");

  let splitIndex: number;
  let sepLength: number;

  if (crlfSep !== -1 && (lfSep === -1 || crlfSep < lfSep)) {
    splitIndex = crlfSep;
    sepLength = 4;
  } else if (lfSep !== -1) {
    splitIndex = lfSep;
    sepLength = 2;
  } else {
    // No body
    return { headerPart: raw, bodyPart: "" };
  }

  return {
    headerPart: raw.substring(0, splitIndex),
    bodyPart: raw.substring(splitIndex + sepLength),
  };
}

/**
 * Parse canonicalization string into header and body parts.
 */
function parseCanonicalization(c: DkimCanonicalization): ["simple" | "relaxed", "simple" | "relaxed"] {
  const [header, body] = c.split("/") as [string, string];
  return [
    header === "relaxed" ? "relaxed" : "simple",
    body === "relaxed" ? "relaxed" : "simple",
  ];
}

/**
 * Parse raw headers into an array of { key, raw } tuples.
 * Handles header folding (continuation lines).
 */
function parseHeaders(headerBlock: string): { key: string; raw: string }[] {
  const headers: { key: string; raw: string }[] = [];
  const lines = headerBlock.split(/\r?\n/);

  let currentHeader = "";

  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      // Continuation of previous header (folded)
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

  // Don't forget the last header
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
 * Canonicalize the headers that will be signed.
 * Per RFC 6376 Section 3.4.1 and 3.4.2.
 */
function canonicalizeSignedHeaders(
  headers: { key: string; raw: string }[],
  headersToSign: string[],
  mode: "simple" | "relaxed",
): string {
  const result: string[] = [];

  // For each header in the signing list, find the last occurrence
  // (RFC 6376 5.4.2 - sign from bottom to top)
  for (const headerName of headersToSign) {
    const matching = headers.filter((h) => h.key === headerName.toLowerCase());
    const header = matching[matching.length - 1];
    if (header) {
      result.push(canonicalizeHeaderLine(header.raw, mode) + "\r\n");
    }
  }

  return result.join("");
}

/**
 * Canonicalize a single header line.
 */
function canonicalizeHeaderLine(line: string, mode: "simple" | "relaxed"): string {
  if (mode === "simple") {
    // Simple: no change (but ensure no trailing whitespace on the line)
    return line;
  }

  // Relaxed canonicalization (RFC 6376 3.4.2):
  // 1. Header name to lowercase
  // 2. Unfold headers (remove CRLF before whitespace)
  // 3. Collapse whitespace runs to single space
  // 4. Remove trailing whitespace before colon and at end
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
    // Simple body canonicalization (RFC 6376 3.4.3):
    // - Ensure body ends with CRLF
    // - Remove trailing empty lines
    let result = body.replace(/\r?\n/g, "\r\n");
    // Remove trailing empty lines
    result = result.replace(/(\r\n)+$/, "");
    // Add final CRLF
    return result + "\r\n";
  }

  // Relaxed body canonicalization (RFC 6376 3.4.4):
  // 1. Reduce all whitespace runs to single space
  // 2. Remove trailing whitespace on each line
  // 3. Remove trailing empty lines
  // 4. Ensure single trailing CRLF
  const lines = body.split(/\r?\n/);
  const canonLines = lines.map((line) => {
    // Reduce whitespace runs
    let canonLine = line.replace(/[ \t]+/g, " ");
    // Remove trailing whitespace
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

/**
 * Fold a base64 string for use in a DKIM header (RFC 6376 3.7).
 * Lines should be limited to 76 characters.
 */
function foldBase64(b64: string): string {
  const lineLength = 72; // Leave room for CRLF and padding
  const parts: string[] = [];

  for (let i = 0; i < b64.length; i += lineLength) {
    parts.push(b64.substring(i, i + lineLength));
  }

  if (parts.length <= 1) return b64;

  return parts.join("\r\n        "); // 8 spaces for folding continuation
}
