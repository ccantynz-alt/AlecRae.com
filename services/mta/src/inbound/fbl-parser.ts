/**
 * ARF (Abuse Reporting Format) parser — RFC 5965.
 *
 * Parses Feedback Loop (FBL) complaint reports delivered to fbl@alecrae.com
 * by ISPs (Yahoo/AOL, Microsoft SNDS/JMRP, Comcast, Mail.ru, etc.). The output
 * drives auto-suppression and reputation signals for the MTA.
 *
 * An ARF report is a multipart/report message with report-type=feedback-report
 * and three (or more) subparts:
 *   1. A human-readable summary (text/plain)
 *   2. A machine-readable report (message/feedback-report) — the one we care about
 *   3. The original message (message/rfc822) or its headers
 *
 * This file intentionally implements its own lightweight MIME walker: the
 * email-parser package returns a flattened body/attachment view that drops the
 * machine-readable report fields, so we parse the structure directly here.
 */

export type FeedbackType =
  | "abuse"
  | "fraud"
  | "virus"
  | "other"
  | "not-spam"
  | "opt-out"
  | "auth-failure";

export interface ArfReport {
  readonly feedbackType: FeedbackType;
  readonly userAgent?: string;
  readonly arrivalDate: string;
  readonly reportingMta?: string;
  readonly sourceIp?: string;
  readonly originalMailFrom?: string;
  readonly originalRcptTo?: string;
  readonly originalMessageId?: string;
  readonly originalSubject?: string;
  readonly reportedDomain?: string;
  readonly incidents?: number;
  readonly authResults?: string;
  readonly rawHeaders?: string;
}

export interface ParseResult {
  readonly success: boolean;
  readonly report?: ArfReport;
  readonly error?: string;
}

export interface SummaryAction {
  readonly action: "suppress" | "flag" | "log";
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseArfReport(rawMessage: string | Buffer): ParseResult {
  try {
    const raw =
      typeof rawMessage === "string" ? rawMessage : rawMessage.toString("utf8");
    if (!raw || raw.trim().length === 0) {
      return { success: false, error: "empty message" };
    }

    const normalized = normalizeLineEndings(raw);
    const { headers: topHeaders, body } = splitHeadersAndBody(normalized);

    const contentType = getHeader(topHeaders, "content-type") ?? "";
    const { mediaType, boundary } = parseContentType(contentType);

    if (!mediaType.startsWith("multipart/")) {
      return {
        success: false,
        error: `expected multipart/report, got ${mediaType || "unknown"}`,
      };
    }
    if (!boundary) {
      return { success: false, error: "missing MIME boundary" };
    }

    const parts = splitMultipart(body, boundary);
    if (parts.length === 0) {
      return { success: false, error: "no MIME parts found" };
    }

    // Locate the machine-readable report part. Prefer message/feedback-report,
    // but fall back to anything whose body looks like ARF key/value pairs.
    const machinePart = findMachineReadablePart(parts);
    if (!machinePart) {
      return {
        success: false,
        error: "no machine-readable report part (message/feedback-report)",
      };
    }

    // Locate the original-message / original-headers part for raw header preservation.
    const originalPart = findOriginalPart(parts);

    const fields = parseMachineReadableFields(machinePart.body);

    const feedbackType = normalizeFeedbackType(fields.get("feedback-type"));
    const arrivalDateRaw = fields.get("arrival-date") ?? fields.get("received-date");
    const arrivalDate = parseDateToIso(arrivalDateRaw) ?? new Date().toISOString();

    const incidentsRaw = fields.get("incidents");
    const incidents = incidentsRaw ? parseIncidents(incidentsRaw) : undefined;

    // Mine the original-message part for Message-ID / Subject / raw headers.
    const originalHeaders = originalPart
      ? extractOriginalHeaders(originalPart.body)
      : new Map<string, string>();

    const originalMessageId =
      fields.get("original-message-id") ??
      originalHeaders.get("message-id") ??
      undefined;
    const originalSubject = originalHeaders.get("subject");
    const rawHeaders = originalPart
      ? extractRawHeadersBlock(originalPart.body)
      : undefined;

    const userAgent = fields.get("user-agent");
    const reportingMtaRaw = fields.get("reporting-mta");
    const sourceIp = fields.get("source-ip");
    const originalMailFromRaw = fields.get("original-mail-from");
    const originalRcptToRaw = fields.get("original-rcpt-to");
    const reportedDomain = fields.get("reported-domain");
    const authResults = fields.get("authentication-results");

    const report: ArfReport = {
      feedbackType,
      arrivalDate,
      ...(userAgent ? { userAgent } : {}),
      ...(reportingMtaRaw ? { reportingMta: stripMtaType(reportingMtaRaw) } : {}),
      ...(sourceIp ? { sourceIp } : {}),
      ...(originalMailFromRaw
        ? { originalMailFrom: stripAngleBrackets(originalMailFromRaw) }
        : {}),
      ...(originalRcptToRaw
        ? { originalRcptTo: stripAngleBrackets(originalRcptToRaw) }
        : {}),
      ...(originalMessageId ? { originalMessageId: stripAngleBrackets(originalMessageId) } : {}),
      ...(originalSubject ? { originalSubject } : {}),
      ...(reportedDomain ? { reportedDomain } : {}),
      ...(incidents !== undefined ? { incidents } : {}),
      ...(authResults ? { authResults } : {}),
      ...(rawHeaders ? { rawHeaders } : {}),
    };

    return { success: true, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: `parse error: ${message}` };
  }
}

export function summarize(report: ArfReport): SummaryAction {
  switch (report.feedbackType) {
    case "abuse":
      return {
        action: "suppress",
        reason: "Recipient complaint — auto-suppress sender for this recipient",
      };
    case "fraud":
      return {
        action: "suppress",
        reason: "Fraud/phishing report — suppress and escalate for review",
      };
    case "virus":
      return {
        action: "suppress",
        reason: "Virus report — suppress sender and quarantine related mail",
      };
    case "auth-failure":
      return {
        action: "flag",
        reason: "DKIM/SPF/DMARC failure — flag domain for reputation review",
      };
    case "not-spam":
      return {
        action: "log",
        reason: "Recipient marked as not spam — positive reputation signal",
      };
    case "opt-out":
      return {
        action: "log",
        reason: "List-Unsubscribe complaint — honored via unsubscribe flow",
      };
    case "other":
    default:
      return {
        action: "log",
        reason: "Feedback of unclassified type — logged for analyst review",
      };
  }
}

// ---------------------------------------------------------------------------
// Internal: MIME walking
// ---------------------------------------------------------------------------

const CRLF = "\r\n";

function normalizeLineEndings(raw: string): string {
  // Collapse bare CR or LF into CRLF for uniform boundary scanning.
  return raw.replace(/\r\n|\r|\n/g, CRLF);
}

function splitHeadersAndBody(raw: string): {
  headers: ReadonlyMap<string, string>;
  body: string;
} {
  const sepIdx = raw.indexOf(CRLF + CRLF);
  if (sepIdx === -1) {
    return { headers: parseHeaderBlock(raw), body: "" };
  }
  return {
    headers: parseHeaderBlock(raw.slice(0, sepIdx)),
    body: raw.slice(sepIdx + 4),
  };
}

function parseHeaderBlock(block: string): ReadonlyMap<string, string> {
  const unfolded = block.replace(/\r\n[ \t]+/g, " ");
  const out = new Map<string, string>();
  for (const line of unfolded.split(CRLF)) {
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    // First occurrence wins (matches typical parser semantics for single-value headers).
    if (!out.has(name)) out.set(name, value);
  }
  return out;
}

function getHeader(
  headers: ReadonlyMap<string, string>,
  name: string,
): string | undefined {
  return headers.get(name.toLowerCase());
}

function parseContentType(header: string): {
  mediaType: string;
  boundary?: string;
  reportType?: string;
} {
  const segments = header.split(";").map((s) => s.trim());
  const mediaType = (segments[0] ?? "").toLowerCase();
  let boundary: string | undefined;
  let reportType: string | undefined;
  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) continue;
    const eq = seg.indexOf("=");
    if (eq === -1) continue;
    const key = seg.slice(0, eq).trim().toLowerCase();
    let val = seg.slice(eq + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (key === "boundary") boundary = val;
    if (key === "report-type") reportType = val.toLowerCase();
  }
  return {
    mediaType,
    ...(boundary !== undefined ? { boundary } : {}),
    ...(reportType !== undefined ? { reportType } : {}),
  };
}

interface MimeSection {
  readonly headers: ReadonlyMap<string, string>;
  readonly contentType: string;
  readonly body: string;
}

function splitMultipart(body: string, boundary: string): MimeSection[] {
  const delim = `--${boundary}`;
  const sections: MimeSection[] = [];
  const raw = body.split(delim);
  for (let i = 1; i < raw.length; i++) {
    const chunk = raw[i];
    if (chunk === undefined) continue;
    // Closing delimiter is "--boundary--"; skip it.
    if (chunk.startsWith("--")) continue;
    // Strip leading CRLF after the boundary line and any trailing CRLF before the next.
    const body = chunk.replace(/^\r\n/, "").replace(/\r\n$/, "");
    const sepIdx = body.indexOf(CRLF + CRLF);
    const headerBlock = sepIdx === -1 ? body : body.slice(0, sepIdx);
    const partBody = sepIdx === -1 ? "" : body.slice(sepIdx + 4);
    const headers = parseHeaderBlock(headerBlock);
    const ct = (getHeader(headers, "content-type") ?? "").toLowerCase();
    sections.push({ headers, contentType: ct, body: partBody });
  }
  return sections;
}

function findMachineReadablePart(parts: readonly MimeSection[]): MimeSection | undefined {
  // Exact match per RFC 5965.
  for (const p of parts) {
    if (p.contentType.startsWith("message/feedback-report")) return p;
  }
  // Fallback: a text/plain part whose body contains Feedback-Type: — seen in
  // malformed reports where ISPs mislabel the content-type.
  for (const p of parts) {
    if (/^\s*feedback-type\s*:/im.test(p.body)) return p;
  }
  return undefined;
}

function findOriginalPart(parts: readonly MimeSection[]): MimeSection | undefined {
  for (const p of parts) {
    if (
      p.contentType.startsWith("message/rfc822") ||
      p.contentType.startsWith("text/rfc822-headers")
    ) {
      return p;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Internal: machine-readable part parsing
// ---------------------------------------------------------------------------

function parseMachineReadableFields(body: string): Map<string, string> {
  // The machine-readable part is a block of RFC 5322-style headers.
  const unfolded = body.replace(/\r\n[ \t]+/g, " ");
  const out = new Map<string, string>();
  for (const line of unfolded.split(CRLF)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!out.has(name)) out.set(name, value);
  }
  return out;
}

function extractOriginalHeaders(body: string): Map<string, string> {
  // message/rfc822 may contain headers+body; text/rfc822-headers is headers only.
  // Either way the headers are at the top, terminated by a blank line or EOF.
  const sepIdx = body.indexOf(CRLF + CRLF);
  const block = sepIdx === -1 ? body : body.slice(0, sepIdx);
  const unfolded = block.replace(/\r\n[ \t]+/g, " ");
  const out = new Map<string, string>();
  for (const line of unfolded.split(CRLF)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!out.has(name)) out.set(name, value);
  }
  return out;
}

function extractRawHeadersBlock(body: string): string {
  const sepIdx = body.indexOf(CRLF + CRLF);
  const block = sepIdx === -1 ? body : body.slice(0, sepIdx);
  return block.trim();
}

// ---------------------------------------------------------------------------
// Internal: field normalization
// ---------------------------------------------------------------------------

function normalizeFeedbackType(value: string | undefined): FeedbackType {
  if (!value) return "other";
  const v = value.trim().toLowerCase();
  switch (v) {
    case "abuse":
      return "abuse";
    case "fraud":
      return "fraud";
    case "virus":
      return "virus";
    case "not-spam":
    case "notspam":
      return "not-spam";
    case "opt-out":
    case "optout":
      return "opt-out";
    case "auth-failure":
    case "authfailure":
      return "auth-failure";
    default:
      return "other";
  }
}

function parseIncidents(value: string): number | undefined {
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseDateToIso(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const d = new Date(value.trim());
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function stripAngleBrackets(value: string): string {
  const m = /<([^>]+)>/.exec(value);
  return m && m[1] ? m[1] : value.trim();
}

function stripMtaType(value: string): string {
  // Reporting-MTA is often "dns; host.example.com" — strip the type prefix.
  const idx = value.indexOf(";");
  return idx === -1 ? value.trim() : value.slice(idx + 1).trim();
}
