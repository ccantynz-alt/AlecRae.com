/**
 * @emailed/mta — Bounce & Complaint MIME Parser
 *
 * Parses multipart/report MIME messages for:
 *   - DSN (Delivery Status Notification) per RFC 3464
 *   - ARF (Abuse Reporting Format) complaints per RFC 5965
 *
 * Also provides SMTP status code to human-readable bounce category mapping.
 */

import type { Result } from "../types.js";
import { ok, err } from "../types.js";

// ─── MIME boundary extraction ──────────────────────────────────────────────

/**
 * Extract the MIME boundary from a Content-Type header value.
 */
export function extractBoundary(contentType: string): string | null {
  const match = contentType.match(/boundary\s*=\s*"?([^"\s;]+)"?/i);
  return match ? (match[1] ?? null) : null;
}

/**
 * Split a raw MIME message into its constituent parts using the boundary.
 */
export function splitMimeParts(raw: string, boundary: string): string[] {
  const delimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;

  // Split on boundary markers
  const segments = raw.split(delimiter);
  const parts: string[] = [];

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i]!;
    // Skip the closing boundary marker
    if (segment.trimStart().startsWith("--")) continue;

    // Remove leading CRLF and trailing whitespace
    const cleaned = segment.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    if (cleaned.trim()) {
      parts.push(cleaned);
    }
  }

  return parts;
}

/**
 * Parse headers from a MIME part, returning headers and body separately.
 */
export function parseMimePartHeaders(
  part: string,
): { headers: Record<string, string>; body: string } {
  // Headers and body separated by blank line
  const splitIdx = part.search(/\r?\n\r?\n/);
  if (splitIdx === -1) {
    return { headers: {}, body: part };
  }

  const headerBlock = part.slice(0, splitIdx);
  const separatorMatch = part.slice(splitIdx).match(/^(\r?\n\r?\n)/);
  const separatorLen = separatorMatch?.[1] ? separatorMatch[1].length : 2;
  const body = part.slice(splitIdx + separatorLen);

  const headers: Record<string, string> = {};
  let currentKey = "";
  let currentValue = "";

  for (const line of headerBlock.split(/\r?\n/)) {
    if (/^\s/.test(line) && currentKey) {
      // Continuation line (folded header)
      currentValue += " " + line.trim();
    } else {
      if (currentKey) {
        headers[currentKey] = currentValue;
      }
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) continue;
      currentKey = line.slice(0, colonIdx).trim().toLowerCase();
      currentValue = line.slice(colonIdx + 1).trim();
    }
  }
  if (currentKey) {
    headers[currentKey] = currentValue;
  }

  return { headers, body };
}

// ─── Multipart/report detector ─────────────────────────────────────────────

export type ReportType = "delivery-status" | "feedback-report" | "unknown";

/**
 * Detect the type of a multipart/report message from headers.
 */
export function detectReportType(rawMessage: string): ReportType {
  const ctMatch = rawMessage.match(/^Content-Type:\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/im);
  if (!ctMatch) return "unknown";

  const ct = ctMatch[1]!.replace(/\r?\n\s+/g, " ").toLowerCase();

  if (ct.includes("multipart/report")) {
    if (ct.includes("delivery-status")) return "delivery-status";
    if (ct.includes("feedback-report")) return "feedback-report";
  }

  // Some MTAs don't use multipart/report but still include delivery-status parts
  if (ct.includes("delivery-status")) return "delivery-status";
  if (ct.includes("feedback-report")) return "feedback-report";

  return "unknown";
}

/**
 * Check if a raw message appears to be a bounce notification.
 * Uses multiple heuristics: Content-Type, subject line, return-path, etc.
 */
export function isBounceNotification(rawMessage: string, envelope?: { mailFrom?: string; rcptTo?: string[] }): boolean {
  // Check Content-Type for multipart/report; report-type=delivery-status
  const reportType = detectReportType(rawMessage);
  if (reportType === "delivery-status") return true;

  // Check for null/empty return-path (bounce messages typically use MAIL FROM:<>)
  if (envelope?.mailFrom === "" || envelope?.mailFrom === "<>") return true;

  // Check for common bounce sender patterns
  const fromMatch = rawMessage.match(/^From:\s*([^\r\n]+)/im);
  if (fromMatch) {
    const from = fromMatch[1]!.toLowerCase();
    if (
      from.includes("mailer-daemon") ||
      from.includes("postmaster") ||
      from.includes("mail delivery") ||
      from.includes("delivery notification")
    ) {
      return true;
    }
  }

  // Check subject for bounce indicators
  const subjMatch = rawMessage.match(/^Subject:\s*([^\r\n]+)/im);
  if (subjMatch) {
    const subject = subjMatch[1]!.toLowerCase();
    if (
      subject.includes("delivery status") ||
      subject.includes("undeliverable") ||
      subject.includes("undelivered mail") ||
      subject.includes("delivery failure") ||
      subject.includes("delivery failed") ||
      subject.includes("mail delivery failed") ||
      subject.includes("returned mail") ||
      subject.includes("failure notice")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a raw message appears to be an ARF complaint report.
 */
export function isComplaintReport(rawMessage: string): boolean {
  const reportType = detectReportType(rawMessage);
  if (reportType === "feedback-report") return true;

  // Check for feedback-report content type anywhere in the message
  if (/content-type:\s*message\/feedback-report/i.test(rawMessage)) return true;

  return false;
}

// ─── ARF (Abuse Reporting Format) Parser — RFC 5965 ────────────────────────

export interface ArfReport {
  /** Feedback type: abuse, fraud, virus, other, etc. */
  feedbackType: string;
  /** User agent that generated the report (e.g. "ISP Feedback Loop") */
  userAgent?: string;
  /** Version of the ARF format */
  version?: string;
  /** Original recipient of the reported message */
  originalRecipient?: string;
  /** Original mail-from of the reported message */
  originalMailFrom?: string;
  /** Arrival date of the reported message */
  arrivalDate?: string;
  /** Authentication results string */
  authenticationResults?: string;
  /** Reported domain */
  reportedDomain?: string;
  /** Reported URI(s) */
  reportedUri?: string[];
  /** Source IP that sent the reported message */
  sourceIp?: string;
  /** The original message (or headers) included in the report */
  originalMessage?: string;
  /** Additional fields from the feedback report */
  additionalFields: Record<string, string>;
}

/**
 * Parse an ARF complaint report (RFC 5965).
 *
 * An ARF message is a multipart/report with report-type=feedback-report.
 * It contains:
 *   Part 1: Human-readable description
 *   Part 2: message/feedback-report (machine-readable fields)
 *   Part 3: message/rfc822 or message/rfc822-headers (original message)
 */
export function parseArfReport(raw: string): Result<ArfReport> {
  try {
    // Extract boundary
    const ctMatch = raw.match(/^Content-Type:\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/im);
    if (!ctMatch) {
      return err(new Error("No Content-Type header found"));
    }
    const ct = ctMatch[1]!.replace(/\r?\n\s+/g, " ");
    const boundary = extractBoundary(ct);

    if (!boundary) {
      return err(new Error("No MIME boundary found in Content-Type"));
    }

    const parts = splitMimeParts(raw, boundary);
    if (parts.length < 2) {
      return err(new Error("ARF report requires at least 2 MIME parts"));
    }

    // Find the feedback-report part
    let feedbackBody = "";
    let originalMsg = "";

    for (const part of parts) {
      const { headers, body } = parseMimePartHeaders(part);
      const partCt = (headers["content-type"] ?? "").toLowerCase();

      if (partCt.includes("message/feedback-report") || partCt.includes("feedback-report")) {
        feedbackBody = body;
      } else if (partCt.includes("message/rfc822") || partCt.includes("rfc822-headers") || partCt.includes("text/rfc822-headers")) {
        originalMsg = body;
      }
    }

    if (!feedbackBody) {
      // Try a more lenient approach: if there's no proper content-type,
      // look for Feedback-Type field in any part
      for (const part of parts) {
        if (/^Feedback-Type:/im.test(part)) {
          const { body } = parseMimePartHeaders(part);
          feedbackBody = body || part;
          break;
        }
      }
    }

    if (!feedbackBody) {
      return err(new Error("No feedback-report part found in ARF message"));
    }

    // Parse the feedback-report fields
    const fields = parseKeyValueFields(feedbackBody);

    const report: ArfReport = {
      feedbackType: (fields["feedback-type"] ?? "abuse").toLowerCase(),
      userAgent: fields["user-agent"],
      version: fields["version"],
      originalRecipient: fields["original-rcpt-to"] ?? fields["original-recipient"],
      originalMailFrom: fields["original-mail-from"],
      arrivalDate: fields["arrival-date"],
      authenticationResults: fields["authentication-results"],
      reportedDomain: fields["reported-domain"],
      sourceIp: fields["source-ip"] ?? fields["source"],
      originalMessage: originalMsg || undefined,
      reportedUri: fields["reported-uri"] ? [fields["reported-uri"]] : undefined,
      additionalFields: fields,
    };

    // Try to extract recipient from original message headers if not in report
    if (!report.originalRecipient && originalMsg) {
      const toMatch = originalMsg.match(/^To:\s*<?([^\s<>,"]+@[^\s<>,"]+)>?/im);
      if (toMatch) {
        report.originalRecipient = toMatch[1];
      }
    }

    return ok(report);
  } catch (e: unknown) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

// ─── SMTP Status Code Mapping ──────────────────────────────────────────────

export interface BounceClassification {
  category: string;
  description: string;
  permanent: boolean;
}

/**
 * Map an SMTP enhanced status code (e.g., "5.1.1") to a human-readable
 * bounce classification per RFC 3463 and RFC 5248.
 */
export function mapEnhancedStatusCode(code: string): BounceClassification {
  const mapping: Record<string, BounceClassification> = {
    // 5.0.x — Other or Undefined Status
    "5.0.0": { category: "unknown", description: "Other undefined status", permanent: true },

    // 5.1.x — Addressing Status
    "5.1.0": { category: "bad-destination", description: "Other address status", permanent: true },
    "5.1.1": { category: "bad-destination", description: "Bad destination mailbox address (user unknown)", permanent: true },
    "5.1.2": { category: "bad-destination", description: "Bad destination system address (domain not found)", permanent: true },
    "5.1.3": { category: "bad-destination", description: "Bad destination mailbox address syntax", permanent: true },
    "5.1.4": { category: "bad-destination", description: "Destination mailbox address ambiguous", permanent: true },
    "5.1.5": { category: "bad-destination", description: "Destination address valid", permanent: false },
    "5.1.6": { category: "bad-destination", description: "Destination mailbox has moved", permanent: true },
    "5.1.7": { category: "bad-sender", description: "Bad sender's mailbox address syntax", permanent: true },
    "5.1.8": { category: "bad-sender", description: "Bad sender's system address", permanent: true },

    // 5.2.x — Mailbox Status
    "5.2.0": { category: "mailbox-issue", description: "Other or undefined mailbox status", permanent: true },
    "5.2.1": { category: "mailbox-issue", description: "Mailbox disabled, not accepting messages", permanent: true },
    "5.2.2": { category: "mailbox-full", description: "Mailbox full", permanent: false },
    "5.2.3": { category: "mailbox-issue", description: "Message length exceeds administrative limit", permanent: true },
    "5.2.4": { category: "mailbox-issue", description: "Mailing list expansion problem", permanent: true },

    // 5.3.x — Mail System Status
    "5.3.0": { category: "system", description: "Other or undefined mail system status", permanent: true },
    "5.3.1": { category: "system", description: "Mail system full", permanent: false },
    "5.3.2": { category: "system", description: "System not accepting network messages", permanent: false },
    "5.3.3": { category: "system", description: "System not capable of selected features", permanent: true },
    "5.3.4": { category: "too-large", description: "Message too big for system", permanent: true },
    "5.3.5": { category: "system", description: "System incorrectly configured", permanent: true },

    // 5.4.x — Network and Routing Status
    "5.4.0": { category: "network", description: "Other or undefined network or routing status", permanent: true },
    "5.4.1": { category: "network", description: "No answer from host", permanent: false },
    "5.4.2": { category: "network", description: "Bad connection", permanent: false },
    "5.4.3": { category: "network", description: "Directory server failure", permanent: false },
    "5.4.4": { category: "network", description: "Unable to route", permanent: true },
    "5.4.5": { category: "network", description: "Mail system congestion", permanent: false },
    "5.4.6": { category: "network", description: "Routing loop detected", permanent: true },
    "5.4.7": { category: "network", description: "Delivery time expired", permanent: true },

    // 5.5.x — Mail Delivery Protocol Status
    "5.5.0": { category: "protocol", description: "Other or undefined protocol status", permanent: true },
    "5.5.1": { category: "protocol", description: "Invalid command", permanent: true },
    "5.5.2": { category: "protocol", description: "Syntax error", permanent: true },
    "5.5.3": { category: "protocol", description: "Too many recipients", permanent: false },
    "5.5.4": { category: "protocol", description: "Invalid command arguments", permanent: true },

    // 5.6.x — Message Content or Media Status
    "5.6.0": { category: "content", description: "Other or undefined media error", permanent: true },
    "5.6.1": { category: "content", description: "Media not supported", permanent: true },
    "5.6.2": { category: "content", description: "Conversion required and prohibited", permanent: true },
    "5.6.3": { category: "content", description: "Conversion required but not supported", permanent: true },

    // 5.7.x — Security or Policy Status
    "5.7.0": { category: "policy", description: "Other or undefined security status", permanent: true },
    "5.7.1": { category: "policy", description: "Delivery not authorized, message refused", permanent: true },
    "5.7.2": { category: "policy", description: "Mailing list expansion prohibited", permanent: true },
    "5.7.3": { category: "policy", description: "Security conversion required but not possible", permanent: true },
    "5.7.4": { category: "policy", description: "Security features not supported", permanent: true },
    "5.7.5": { category: "policy", description: "Cryptographic failure", permanent: true },
    "5.7.6": { category: "policy", description: "Cryptographic algorithm not supported", permanent: true },
    "5.7.7": { category: "policy", description: "Message integrity failure", permanent: true },
    "5.7.8": { category: "auth", description: "Authentication credentials invalid", permanent: true },
    "5.7.9": { category: "auth", description: "Authentication mechanism is too weak", permanent: true },
    "5.7.13": { category: "policy", description: "Account disabled", permanent: true },
    "5.7.14": { category: "policy", description: "Trust relationship required", permanent: true },
    "5.7.20": { category: "dmarc", description: "DMARC validation failure", permanent: true },
    "5.7.23": { category: "spf", description: "SPF validation failure", permanent: true },
    "5.7.25": { category: "dns", description: "Reverse DNS validation failed", permanent: true },
    "5.7.26": { category: "dkim", description: "Multiple authentication checks failed", permanent: true },

    // 4.x.x — Transient failures
    "4.0.0": { category: "transient", description: "Other undefined status (temporary)", permanent: false },
    "4.1.1": { category: "transient", description: "Bad destination mailbox (temporary)", permanent: false },
    "4.2.0": { category: "transient", description: "Other or undefined mailbox status (temporary)", permanent: false },
    "4.2.1": { category: "transient", description: "Mailbox disabled (temporary)", permanent: false },
    "4.2.2": { category: "mailbox-full", description: "Mailbox full (temporary)", permanent: false },
    "4.3.0": { category: "system", description: "Other or undefined mail system status (temporary)", permanent: false },
    "4.3.1": { category: "system", description: "Mail system full (temporary)", permanent: false },
    "4.3.2": { category: "system", description: "System not accepting messages (temporary)", permanent: false },
    "4.4.1": { category: "network", description: "No answer from host (temporary)", permanent: false },
    "4.4.2": { category: "network", description: "Bad connection (temporary)", permanent: false },
    "4.4.5": { category: "congestion", description: "Mail system congestion (temporary)", permanent: false },
    "4.4.7": { category: "timeout", description: "Delivery time expired (temporary)", permanent: false },
    "4.5.3": { category: "transient", description: "Too many recipients (temporary)", permanent: false },
    "4.7.0": { category: "policy", description: "Security policy (temporary)", permanent: false },
    "4.7.1": { category: "rate-limit", description: "Delivery not authorized (rate limited / greylisting)", permanent: false },
  };

  return mapping[code] ?? {
    category: "unknown",
    description: `Unknown enhanced status code: ${code}`,
    permanent: code.startsWith("5"),
  };
}

/**
 * Map a 3-digit SMTP reply code to a basic bounce description.
 */
export function mapSmtpReplyCode(code: number): BounceClassification {
  if (code >= 200 && code < 300) {
    return { category: "success", description: "Message accepted", permanent: false };
  }

  const mapping: Record<number, BounceClassification> = {
    421: { category: "transient", description: "Service not available, closing channel", permanent: false },
    450: { category: "transient", description: "Requested action not taken: mailbox unavailable (temporary)", permanent: false },
    451: { category: "transient", description: "Requested action aborted: local error in processing", permanent: false },
    452: { category: "transient", description: "Requested action not taken: insufficient storage", permanent: false },
    455: { category: "transient", description: "Server unable to accommodate parameters", permanent: false },

    500: { category: "permanent", description: "Syntax error, command unrecognized", permanent: true },
    501: { category: "permanent", description: "Syntax error in parameters or arguments", permanent: true },
    502: { category: "permanent", description: "Command not implemented", permanent: true },
    503: { category: "permanent", description: "Bad sequence of commands", permanent: true },
    504: { category: "permanent", description: "Command parameter not implemented", permanent: true },
    550: { category: "permanent", description: "Requested action not taken: mailbox unavailable (permanent)", permanent: true },
    551: { category: "permanent", description: "User not local; please try forwarding", permanent: true },
    552: { category: "permanent", description: "Requested mail action aborted: exceeded storage allocation", permanent: true },
    553: { category: "permanent", description: "Requested action not taken: mailbox name not allowed", permanent: true },
    554: { category: "permanent", description: "Transaction failed", permanent: true },
    555: { category: "permanent", description: "MAIL FROM/RCPT TO parameters not recognized", permanent: true },
  };

  return mapping[code] ?? {
    category: code >= 500 ? "permanent" : code >= 400 ? "transient" : "unknown",
    description: `SMTP reply code ${code}`,
    permanent: code >= 500,
  };
}

// ─── Extract original message-id from bounce ───────────────────────────────

/**
 * Attempt to extract the original Message-ID from a bounce notification.
 * Looks in the DSN fields, the original message headers, and common patterns.
 */
export function extractOriginalMessageId(raw: string): string | null {
  // Look for X-Failed-Recipients or In-Reply-To with message ID
  const inReplyTo = raw.match(/^In-Reply-To:\s*<?([^\s<>]+@[^\s<>]+)>?/im);
  if (inReplyTo) return inReplyTo[1]!;

  // Look in the original message fragment (part 3 of multipart/report)
  const msgIdInOriginal = raw.match(/^Message-ID:\s*<?([^\s<>]+@[^\s<>]+)>?/im);
  if (msgIdInOriginal) return msgIdInOriginal[1]!;

  // Look for references header
  const refs = raw.match(/^References:\s*<?([^\s<>]+@[^\s<>]+)>?/im);
  if (refs) return refs[1]!;

  return null;
}

// ─── Internal helpers ──────────────────────────────────────────────────────

/**
 * Parse key-value fields from a feedback-report or delivery-status block.
 * Handles line continuations (folded headers).
 */
function parseKeyValueFields(block: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey = "";
  let currentValue = "";

  for (const line of block.split(/\r?\n/)) {
    if (/^\s/.test(line) && currentKey) {
      currentValue += " " + line.trim();
    } else {
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
