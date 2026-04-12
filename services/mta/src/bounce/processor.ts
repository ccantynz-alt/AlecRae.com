/**
 * @emailed/mta — Bounce Processor
 *
 * Handles DSN (Delivery Status Notification, RFC 3464) parsing, bounce
 * classification, suppression list management, and retry scheduling.
 *
 * Key RFCs:
 *   - RFC 3464  Delivery Status Notifications
 *   - RFC 3463  Enhanced Mail System Status Codes
 *   - RFC 5321  SMTP reply codes
 */

import {
  type BounceInfo,
  type BounceCategory,
  type BounceType,
  type Result,
  ok,
  err,
} from "../types.js";

// ─── DSN field types ────────────────────────────────────────────────────────

/**
 * Parsed DSN per-recipient fields (RFC 3464 §2.3).
 */
export interface DsnFields {
  /** Original-Recipient field (optional). */
  originalRecipient?: string;
  /** Final-Recipient field (required). */
  finalRecipient: string;
  /** Action field: "failed" | "delayed" | "delivered" | "relayed" | "expanded". */
  action: string;
  /** Status field — enhanced status code, e.g. "5.1.1". */
  status: string;
  /** Remote-MTA that generated the DSN. */
  remoteMta?: string;
  /** Diagnostic-Code, typically the full SMTP response line. */
  diagnosticCode?: string;
  /** Last-Attempt-Date. */
  lastAttemptDate?: string;
}

/**
 * Full parsed DSN message.
 */
export interface DsnMessage {
  /** Per-message DSN fields (Reporting-MTA, Arrival-Date, etc.). */
  reportingMta?: string;
  arrivalDate?: string;
  /** One entry per recipient in the DSN. */
  recipients: DsnFields[];
  /** The original message (or headers) included in part 3, if present. */
  originalMessageFragment?: string;
}

// ─── Suppression entry ──────────────────────────────────────────────────────

export interface SuppressionEntry {
  address: string;
  reason: BounceType;
  bounceCategory: BounceCategory;
  addedAt: Date;
  lastBounceAt: Date;
  bounceCount: number;
}

// ─── Bounce action returned from processBounce ─────────────────────────────

export type BounceAction =
  | { kind: "suppress"; entry: SuppressionEntry }
  | { kind: "retry"; retryAt: Date; attempt: number }
  | { kind: "ignore" };

// ─── Pure functions ─────────────────────────────────────────────────────────

/**
 * Parse a raw DSN bounce message (RFC 3464).
 *
 * A DSN is a MIME multipart/report with content-type
 * `multipart/report; report-type=delivery-status`. The second MIME part
 * is `message/delivery-status` containing per-message and per-recipient
 * groups separated by blank lines.
 *
 * This parser is intentionally lenient — many MTAs produce non-conformant
 * DSNs and we must handle them gracefully.
 */
export function parseDsn(raw: string): Result<DsnMessage> {
  try {
    const message: DsnMessage = { recipients: [] };

    // Attempt to locate the delivery-status body part.
    // Look for "message/delivery-status" or fall back to scanning for
    // Status: fields directly (lenient mode).
    const statusBlockMatch = raw.match(
      /content-type:\s*message\/delivery-status[\s\S]*?\n\n([\s\S]*?)(?:\n--|\n\nContent-Type:|\n\n$)/i,
    );
    const statusBlock = statusBlockMatch ? statusBlockMatch[1] ?? raw : raw;

    // Split into groups: per-message fields come first, then one group
    // per recipient, separated by blank lines.
    const groups = statusBlock
      .split(/\n\s*\n/)
      .map((g) => g.trim())
      .filter(Boolean);

    for (const group of groups) {
      const fields = parseHeaderFields(group);

      // Per-message fields have Reporting-MTA but no Final-Recipient.
      if (fields["reporting-mta"] && !fields["final-recipient"]) {
        message.reportingMta = stripType(fields["reporting-mta"]);
        const arrivalDate = fields["arrival-date"];
        if (arrivalDate !== undefined) {
          message.arrivalDate = arrivalDate;
        }
        continue;
      }

      const finalRecipient = fields["final-recipient"];
      if (!finalRecipient) {
        continue; // skip groups we cannot interpret
      }

      const originalRecipient = fields["original-recipient"];
      const remoteMta = fields["remote-mta"];
      const diagnosticCode = fields["diagnostic-code"];
      const lastAttemptDate = fields["last-attempt-date"];

      const recipient: DsnFields = {
        finalRecipient: stripType(finalRecipient),
        action: (fields["action"] ?? "").toLowerCase(),
        status: fields["status"] ?? "",
        ...(originalRecipient !== undefined
          ? { originalRecipient: stripType(originalRecipient) }
          : {}),
        ...(remoteMta !== undefined
          ? { remoteMta: stripType(remoteMta) }
          : {}),
        ...(diagnosticCode !== undefined ? { diagnosticCode } : {}),
        ...(lastAttemptDate !== undefined ? { lastAttemptDate } : {}),
      };

      message.recipients.push(recipient);
    }

    if (message.recipients.length === 0) {
      return err(new Error("No recipient status groups found in DSN"));
    }

    return ok(message);
  } catch (e: unknown) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Parse a bounce message (email body / DSN) and extract {@link BounceInfo}
 * for every affected recipient.
 *
 * This is a convenience wrapper that calls {@link parseDsn} and then
 * {@link classifyBounce} for each recipient.
 */
export function parseBounceMessage(raw: string): Result<BounceInfo[]> {
  const dsnResult = parseDsn(raw);
  if (!dsnResult.ok) {
    // Fall back to heuristic parsing for non-DSN bounce messages.
    return parseBounceHeuristic(raw);
  }

  const dsn = dsnResult.value;
  const infos: BounceInfo[] = [];

  for (const rcpt of dsn.recipients) {
    const statusCode = smtpCodeFromStatus(rcpt.status);
    const classified = classifyBounce(statusCode, rcpt.diagnosticCode ?? "");
    const remoteMta = rcpt.remoteMta ?? dsn.reportingMta;
    infos.push({
      ...classified,
      recipient: rcpt.finalRecipient,
      ...(remoteMta !== undefined ? { remoteMta } : {}),
      timestamp: new Date(),
    });
  }

  return ok(infos);
}

/**
 * Classify a bounce from an SMTP status code and diagnostic text.
 *
 * Returns the {@link BounceCategory} (hard / soft / block / transient)
 * and a more specific {@link BounceType} plus retryability flag.
 */
export function classifyBounce(
  statusCode: number,
  diagnosticText: string,
): Pick<BounceInfo, "category" | "type" | "statusCode" | "enhancedCode" | "diagnosticCode" | "retryable"> {
  const diag = diagnosticText.toLowerCase();

  // Extract enhanced status code (e.g. "5.1.1") if present.
  const enhancedMatch = diagnosticText.match(/([245]\.\d{1,3}\.\d{1,3})/);
  const enhancedCode = enhancedMatch ? enhancedMatch[1] : undefined;
  const enhancedClass = enhancedCode ? enhancedCode.charAt(0) : undefined;

  // exactOptionalPropertyTypes forbids passing `enhancedCode: undefined`
  // when the field is declared as `enhancedCode?: string`. This helper
  // builds the result object while conditionally including the field.
  const build = (
    category: BounceCategory,
    type: BounceType,
    retryable: boolean,
  ): Pick<BounceInfo, "category" | "type" | "statusCode" | "enhancedCode" | "diagnosticCode" | "retryable"> => ({
    category,
    type,
    statusCode,
    ...(enhancedCode !== undefined ? { enhancedCode } : {}),
    diagnosticCode: diagnosticText,
    retryable,
  });

  // ── Hard bounces (5xx, permanent) ────────────────────────────────────
  if (statusCode >= 550 || enhancedClass === "5") {
    // Invalid / non-existent recipient
    if (
      matches(diag, ["user unknown", "no such user", "does not exist", "mailbox not found", "invalid recipient", "recipient rejected"]) ||
      enhancedCode === "5.1.1"
    ) {
      return build("hard", "invalid-recipient", false);
    }

    // Domain not found
    if (
      matches(diag, ["domain not found", "no such domain", "host not found", "name not resolved"]) ||
      enhancedCode === "5.1.2"
    ) {
      return build("hard", "domain-not-found", false);
    }

    // Spam / policy block
    if (
      matches(diag, ["spam", "blocked", "blacklist", "blocklist", "dnsbl", "rbl", "rejected for policy", "abuse"]) ||
      enhancedCode === "5.7.1"
    ) {
      return build("block", "spam-block", false);
    }

    // Content rejected
    if (matches(diag, ["content rejected", "message rejected", "virus", "malware"])) {
      return build("block", "content-rejected", false);
    }

    // Auth failure
    if (
      matches(diag, ["dkim", "spf", "dmarc", "authentication failed"]) ||
      enhancedCode === "5.7.0"
    ) {
      return build("block", "auth-failure", false);
    }

    // Message too large
    if (
      matches(diag, ["too large", "size limit", "exceeds maximum"]) ||
      enhancedCode === "5.3.4"
    ) {
      return build("hard", "message-too-large", false);
    }

    // Policy violation (catch-all for remaining 5xx)
    if (enhancedCode?.startsWith("5.7")) {
      return build("block", "policy-violation", false);
    }

    // Generic permanent failure
    return build("hard", "unknown", false);
  }

  // ── Soft / transient bounces (4xx, temporary) ────────────────────────
  if (statusCode >= 400 || enhancedClass === "4") {
    // Mailbox full
    if (
      matches(diag, ["mailbox full", "over quota", "quota exceeded", "insufficient storage"]) ||
      enhancedCode === "4.2.2"
    ) {
      return build("soft", "mailbox-full", true);
    }

    // Rate limiting / throttling
    if (
      matches(diag, ["rate limit", "too many connections", "throttl", "try again later"]) ||
      enhancedCode === "4.7.1"
    ) {
      return build("transient", "rate-limited", true);
    }

    // Connection refused
    if (matches(diag, ["connection refused", "connect failed"])) {
      return build("transient", "connection-refused", true);
    }

    // Timeout
    if (matches(diag, ["timeout", "timed out"])) {
      return build("transient", "timeout", true);
    }

    // Network error
    if (matches(diag, ["network error", "connection reset", "broken pipe"])) {
      return build("transient", "network-error", true);
    }

    // Generic temporary failure
    return build("soft", "unknown", true);
  }

  // ── Undetermined ─────────────────────────────────────────────────────
  return build("undetermined", "unknown", true);
}

/**
 * Decide what action to take for a given bounce.
 *
 * - **Hard / block** bounces: suppress the recipient immediately.
 * - **Soft / transient** bounces: schedule a retry with exponential
 *   back-off (base 60 s, ×2 per attempt, max 6 h).
 * - **Undetermined**: treat as soft for up to 3 attempts, then suppress.
 */
export function processBounce(
  bounceInfo: BounceInfo,
  currentAttempt: number,
  maxAttempts: number,
): BounceAction {
  const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000; // 6 hours
  const BASE_DELAY_MS = 60_000; // 1 minute

  // Hard / block → immediate suppression
  if (bounceInfo.category === "hard" || bounceInfo.category === "block") {
    return {
      kind: "suppress",
      entry: {
        address: bounceInfo.recipient,
        reason: bounceInfo.type,
        bounceCategory: bounceInfo.category,
        addedAt: new Date(),
        lastBounceAt: bounceInfo.timestamp,
        bounceCount: 1,
      },
    };
  }

  // Soft / transient / undetermined → retry until maxAttempts
  if (currentAttempt < maxAttempts) {
    const delay = Math.min(
      BASE_DELAY_MS * Math.pow(2, currentAttempt),
      MAX_BACKOFF_MS,
    );
    // Add ±20 % jitter
    const jitter = delay * (0.8 + Math.random() * 0.4);
    const retryAt = new Date(Date.now() + jitter);

    return { kind: "retry", retryAt, attempt: currentAttempt + 1 };
  }

  // Exhausted retries — suppress
  return {
    kind: "suppress",
    entry: {
      address: bounceInfo.recipient,
      reason: bounceInfo.type,
      bounceCategory: bounceInfo.category,
      addedAt: new Date(),
      lastBounceAt: bounceInfo.timestamp,
      bounceCount: currentAttempt,
    },
  };
}

// ─── BounceProcessor class ──────────────────────────────────────────────────

/**
 * Stateful bounce processor that maintains an in-memory suppression list.
 *
 * In production the suppression list would be backed by PostgreSQL /
 * Redis; this implementation keeps the same interface while storing
 * entries in a `Map` for testability and zero external dependencies.
 */
export class BounceProcessor {
  private readonly suppressions = new Map<string, SuppressionEntry>();
  private readonly maxAttempts: number;

  constructor(maxAttempts = 5) {
    this.maxAttempts = maxAttempts;
  }

  /**
   * Process a raw incoming bounce message end-to-end.
   *
   * 1. Parse the DSN.
   * 2. Classify each recipient bounce.
   * 3. Decide action (suppress / retry / ignore).
   * 4. Update the suppression list where applicable.
   *
   * @returns An action for each recipient found in the bounce.
   */
  processIncoming(
    rawBounce: string,
    currentAttemptsByRecipient?: Map<string, number>,
  ): Result<{ recipient: string; bounceInfo: BounceInfo; action: BounceAction }[]> {
    const parsed = parseBounceMessage(rawBounce);
    if (!parsed.ok) {
      return parsed;
    }

    const results: { recipient: string; bounceInfo: BounceInfo; action: BounceAction }[] = [];

    for (const info of parsed.value) {
      const attempt = currentAttemptsByRecipient?.get(info.recipient) ?? 0;
      const action = processBounce(info, attempt, this.maxAttempts);

      // Update suppression list
      if (action.kind === "suppress") {
        const existing = this.suppressions.get(info.recipient.toLowerCase());
        if (existing) {
          existing.bounceCount += 1;
          existing.lastBounceAt = info.timestamp;
        } else {
          this.suppressions.set(
            info.recipient.toLowerCase(),
            action.entry,
          );
        }
      }

      results.push({ recipient: info.recipient, bounceInfo: info, action });
    }

    return ok(results);
  }

  /**
   * Return a snapshot of the current suppression list.
   */
  getSuppressionList(): SuppressionEntry[] {
    return Array.from(this.suppressions.values());
  }

  /**
   * Check whether an address is on the suppression list.
   */
  isAddressSuppressed(address: string): boolean {
    return this.suppressions.has(address.toLowerCase());
  }

  /**
   * Manually add an address to the suppression list.
   */
  addSuppression(entry: SuppressionEntry): void {
    this.suppressions.set(entry.address.toLowerCase(), entry);
  }

  /**
   * Remove an address from the suppression list (e.g. after manual review).
   */
  removeSuppression(address: string): boolean {
    return this.suppressions.delete(address.toLowerCase());
  }
}

// ─── Internal utilities ─────────────────────────────────────────────────────

/**
 * Parse "Key: Value" header fields from a DSN group, handling line
 * continuations (lines starting with whitespace).
 */
function parseHeaderFields(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey = "";
  let currentValue = "";

  for (const line of block.split("\n")) {
    if (/^\s/.test(line) && currentKey) {
      // Continuation line
      currentValue += " " + line.trim();
    } else {
      // Flush previous
      if (currentKey) {
        result[currentKey] = currentValue;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) {
        currentKey = "";
        currentValue = "";
        continue;
      }
      currentKey = line.slice(0, colonIdx).trim().toLowerCase();
      currentValue = line.slice(colonIdx + 1).trim();
    }
  }

  if (currentKey) {
    result[currentKey] = currentValue;
  }

  return result;
}

/**
 * Strip the optional type prefix from DSN fields.
 * e.g. "rfc822;user@example.com" → "user@example.com"
 *      "dns;mx.example.com"      → "mx.example.com"
 */
function stripType(value: string): string {
  const idx = value.indexOf(";");
  if (idx === -1) return value.trim();
  return value.slice(idx + 1).trim();
}

/**
 * Derive a 3-digit SMTP reply code from an enhanced status code.
 * "5.1.1" → 550, "4.2.2" → 452, etc.
 */
function smtpCodeFromStatus(status: string): number {
  const cls = status.charAt(0);
  if (cls === "5") return 550;
  if (cls === "4") return 450;
  if (cls === "2") return 250;
  return 0;
}

/**
 * Check if `text` contains any of the given `keywords`.
 */
function matches(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

/**
 * Heuristic bounce parser for non-DSN bounce messages.
 *
 * Many MTAs send plain-text bounces without proper DSN MIME structure.
 * This attempts to extract an SMTP code and recipient from the raw text.
 */
function parseBounceHeuristic(raw: string): Result<BounceInfo[]> {
  // Try to find an SMTP status code
  const codeMatch = raw.match(/\b([245]\d{2})\b/);
  const statusCode = codeMatch?.[1] ? parseInt(codeMatch[1], 10) : 0;

  // Try to find an email address
  const emailMatch = raw.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  const recipient = emailMatch ? emailMatch[0] : "unknown@unknown";

  if (statusCode === 0 && recipient === "unknown@unknown") {
    return err(new Error("Unable to parse bounce message: no status code or recipient found"));
  }

  const classified = classifyBounce(statusCode, raw);

  return ok([
    {
      ...classified,
      recipient,
      timestamp: new Date(),
      retryable: classified.retryable,
    },
  ]);
}
