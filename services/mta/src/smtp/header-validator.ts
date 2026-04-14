/**
 * Custom SMTP header validator — reputation-protection gate for the
 * `emails.customHeaders` JSONB column.
 *
 * Customers are allowed to set a small number of operational headers on
 * outbound mail (e.g. X-Entity-Ref-ID for idempotency tracing, List-
 * Unsubscribe for RFC 8058 compliance, X-Custom-* for campaign metadata).
 * An unrestricted customHeaders map is a direct reputation-destruction
 * vector because:
 *
 *  1. Attackers can inject Bcc:/Cc: headers to exfiltrate mail silently
 *  2. CRLF (\r\n) sequences smuggle entirely new headers or split the
 *     message at the DATA boundary, enabling spam/phishing payloads
 *  3. Setting DKIM-Signature / Authentication-Results / Received headers
 *     confuses downstream MTAs and poisons trust scoring instantly
 *
 * This validator is called at queue-accept time BEFORE a send is
 * enqueued. Failures return a structured `{ ok: false, reason }` result
 * so the API layer can surface a clear error code to the caller — no
 * runtime exceptions reach the customer.
 */

// ── Whitelist: headers the customer is allowed to set ────────────────────

/**
 * Exact-match allow list (case-insensitive). Header names not in this
 * list are rejected unless they match the X-Custom-* wildcard rule.
 */
const ALLOWED_HEADERS: ReadonlySet<string> = new Set([
  "x-entity-ref-id",
  "x-campaign-id",
  "x-mailer",
  "list-unsubscribe",
  "list-unsubscribe-post",
  "message-id",
  "references",
  "in-reply-to",
]);

/**
 * Blocklist — headers that are NEVER allowed from customer input, even
 * if they'd otherwise match a pattern. Duplicated here for defence-in-
 * depth: even if a future refactor opens up the allow list, these names
 * stay hard-blocked.
 */
const BANNED_HEADERS: ReadonlySet<string> = new Set([
  "bcc",
  "cc",
  "to",
  "from",
  "sender",
  "reply-to",
  "return-path",
  "received",
  "authentication-results",
  "dkim-signature",
  // ARC-* handled via prefix check below
  "content-type",
  "content-transfer-encoding",
  "mime-version",
]);

// ── Limits (RFC 5322 §2.1.1 and reputation audit) ────────────────────────

const HEADER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]*$/;
const MAX_X_CUSTOM_COUNT = 10;
const MAX_X_CUSTOM_VALUE_BYTES = 256;
const MAX_HEADER_LINE_BYTES = 998; // RFC 5322 §2.1.1
const RFC2822_MESSAGE_ID = /^<[^\s<>]+@[^\s<>]+>$/;

// ── Result type ──────────────────────────────────────────────────────────

export type HeaderValidationResult =
  | { ok: true; sanitized: Record<string, string> }
  | { ok: false; reason: string };

/**
 * Pure function — validates a customer-supplied headers map.
 *
 * On success returns `{ ok: true, sanitized }` where `sanitized` is a
 * copy of the input with consistent name casing. On failure returns
 * `{ ok: false, reason }` describing the first offending header.
 *
 * Callers must treat a non-ok result as a hard reject (HTTP 400 with
 * code `HEADER_INJECTION_REJECTED`) — do NOT silently drop the bad
 * header because that masks attacker probes.
 */
export function validateCustomHeaders(
  headers: Record<string, unknown> | null | undefined,
): HeaderValidationResult {
  if (headers === null || headers === undefined) {
    return { ok: true, sanitized: {} };
  }

  if (typeof headers !== "object" || Array.isArray(headers)) {
    return { ok: false, reason: "customHeaders must be an object" };
  }

  const sanitized: Record<string, string> = {};
  let xCustomCount = 0;

  for (const [rawName, rawValue] of Object.entries(headers)) {
    // Skip entries explicitly set to null/undefined — treat as unset.
    if (rawValue === null || rawValue === undefined) continue;

    // Header names must be a non-empty string matching RFC 5322 token
    // syntax (letters, digits, hyphen; must start with a letter).
    if (typeof rawName !== "string" || rawName.length === 0) {
      return { ok: false, reason: "header name must be a non-empty string" };
    }
    if (!HEADER_NAME_PATTERN.test(rawName)) {
      return {
        ok: false,
        reason: `invalid header name "${rawName}" — must match /^[A-Za-z][A-Za-z0-9-]*$/`,
      };
    }

    // Values must be strings (not numbers, objects, arrays, etc).
    if (typeof rawValue !== "string") {
      return {
        ok: false,
        reason: `header "${rawName}" value must be a string`,
      };
    }

    const lowerName = rawName.toLowerCase();

    // CRLF/NUL injection guard — applies to BOTH names and values.
    // Any of \r, \n, or NUL means the caller is trying to split the
    // DATA stream or smuggle new headers. Hard reject, always.
    if (/[\r\n\0]/.test(rawName) || /[\r\n\0]/.test(rawValue)) {
      return {
        ok: false,
        reason: `header "${rawName}" contains CR/LF/NUL — CRLF injection rejected`,
      };
    }

    // Banned headers — platform-controlled, never accept from customers.
    if (BANNED_HEADERS.has(lowerName)) {
      return {
        ok: false,
        reason: `header "${rawName}" is reserved — set via API fields instead of customHeaders`,
      };
    }
    // Any Resent-* or ARC-* header is reserved.
    if (lowerName.startsWith("resent-") || lowerName.startsWith("arc-")) {
      return {
        ok: false,
        reason: `header "${rawName}" is reserved (Resent-*/ARC-* are platform-controlled)`,
      };
    }

    // UTF-8 validity + line-length limit (RFC 5322 §2.1.1 — 998 bytes
    // max per unfolded line, excluding CRLF). We measure the full
    // `Name: value` line because that's what gets emitted to the wire.
    const lineBytes = Buffer.byteLength(`${rawName}: ${rawValue}`, "utf-8");
    if (lineBytes > MAX_HEADER_LINE_BYTES) {
      return {
        ok: false,
        reason: `header "${rawName}" exceeds 998 bytes per RFC 5322 §2.1.1`,
      };
    }
    // Explicit UTF-8 validity check: Buffer.byteLength succeeds on any
    // string, but strings that contain unpaired surrogates must also
    // be rejected. A round-trip through Buffer + toString catches this.
    const encoded = Buffer.from(rawValue, "utf-8").toString("utf-8");
    if (encoded !== rawValue) {
      return {
        ok: false,
        reason: `header "${rawName}" is not valid UTF-8`,
      };
    }

    // X-Custom-* wildcard namespace
    if (lowerName.startsWith("x-custom-")) {
      xCustomCount += 1;
      if (xCustomCount > MAX_X_CUSTOM_COUNT) {
        return {
          ok: false,
          reason: `too many X-Custom-* headers — max ${MAX_X_CUSTOM_COUNT} per message`,
        };
      }
      if (Buffer.byteLength(rawValue, "utf-8") > MAX_X_CUSTOM_VALUE_BYTES) {
        return {
          ok: false,
          reason: `X-Custom-* header "${rawName}" exceeds ${MAX_X_CUSTOM_VALUE_BYTES} bytes`,
        };
      }
      sanitized[rawName] = rawValue;
      continue;
    }

    // Exact-match whitelist check.
    if (!ALLOWED_HEADERS.has(lowerName)) {
      return {
        ok: false,
        reason: `header "${rawName}" is not in the allow list`,
      };
    }

    // Extra constraint: Message-ID must match RFC 2822 angle-addr form.
    if (lowerName === "message-id" && !RFC2822_MESSAGE_ID.test(rawValue)) {
      return {
        ok: false,
        reason: `Message-ID "${rawValue}" must be in <local@domain> form (RFC 2822)`,
      };
    }

    sanitized[rawName] = rawValue;
  }

  return { ok: true, sanitized };
}

/**
 * Error code surfaced to API clients when header validation fails.
 * Kept here (not in types.ts) so callers can import the constant
 * alongside the validator.
 */
export const HEADER_INJECTION_REJECTED = "HEADER_INJECTION_REJECTED" as const;
