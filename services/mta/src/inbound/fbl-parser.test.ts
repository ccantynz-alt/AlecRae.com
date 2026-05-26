/**
 * Tests for the ARF (RFC 5965) Feedback Loop parser.
 *
 * Fixtures are inlined so we don't need to ship .eml files with the repo. All
 * fixtures use CRLF line endings to mirror what an MTA actually delivers; the
 * parser also accepts LF-only input, which one case exercises explicitly.
 */

import { describe, expect, it } from "bun:test";
import { parseArfReport, summarize, type ArfReport } from "./fbl-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a message with CRLF line endings from a list of lines. */
function crlf(lines: readonly string[]): string {
  return lines.join("\r\n");
}

/** A canonical Yahoo-style abuse report. */
const ABUSE_REPORT = crlf([
  "From: abuse@yahoo.com",
  "To: fbl@alecrae.com",
  "Subject: Yahoo! Mail Feedback Loop",
  "Date: Thu, 18 Apr 2026 10:00:00 -0700",
  'Content-Type: multipart/report; report-type=feedback-report; boundary="ARF-BOUNDARY-1"',
  "MIME-Version: 1.0",
  "",
  "--ARF-BOUNDARY-1",
  "Content-Type: text/plain; charset=UTF-8",
  "",
  "This is an email abuse report for an email message received from IP 203.0.113.42",
  "on Thu, 18 Apr 2026 09:55:12 -0700.",
  "",
  "--ARF-BOUNDARY-1",
  "Content-Type: message/feedback-report",
  "",
  "Feedback-Type: abuse",
  "User-Agent: YahooMailFBL/2.0",
  "Version: 1",
  "Original-Mail-From: <bounce-123@mail.alecrae.com>",
  "Original-Rcpt-To: <victim@yahoo.com>",
  "Arrival-Date: Thu, 18 Apr 2026 09:55:12 -0700",
  "Reporting-MTA: dns; mta1.am0.yahoodns.net",
  "Source-IP: 203.0.113.42",
  "Reported-Domain: mail.alecrae.com",
  "Original-Message-ID: <abc123@mail.alecrae.com>",
  "Authentication-Results: mta1.am0.yahoodns.net; dkim=pass header.d=alecrae.com; spf=pass",
  "Incidents: 1",
  "",
  "--ARF-BOUNDARY-1",
  "Content-Type: message/rfc822",
  "",
  "From: marketing@mail.alecrae.com",
  "To: victim@yahoo.com",
  "Subject: Your weekly digest",
  "Message-ID: <abc123@mail.alecrae.com>",
  "Date: Thu, 18 Apr 2026 09:50:00 -0700",
  "",
  "Hi there, here's your digest...",
  "",
  "--ARF-BOUNDARY-1--",
  "",
]);

/** A Gmail-style not-spam (positive) report. */
const NOT_SPAM_REPORT = crlf([
  "From: feedback@google.com",
  "To: fbl@alecrae.com",
  'Content-Type: multipart/report; boundary="=_NS_BOUNDARY_=";',
  "  report-type=feedback-report",
  "MIME-Version: 1.0",
  "",
  "--=_NS_BOUNDARY_=",
  "Content-Type: text/plain",
  "",
  "The user indicated this message is not spam.",
  "--=_NS_BOUNDARY_=",
  "Content-Type: message/feedback-report",
  "",
  "Feedback-Type: not-spam",
  "User-Agent: GoogleFBL/1.0",
  "Version: 1",
  "Original-Rcpt-To: <user@gmail.com>",
  "Arrival-Date: Thu, 18 Apr 2026 08:00:00 +0000",
  "Source-IP: 198.51.100.9",
  "Reported-Domain: alecrae.com",
  "",
  "--=_NS_BOUNDARY_=",
  "Content-Type: text/rfc822-headers",
  "",
  "From: news@alecrae.com",
  "To: user@gmail.com",
  "Subject: Thanks for joining AlecRae",
  "Message-ID: <greetings-7@alecrae.com>",
  "",
  "--=_NS_BOUNDARY_=--",
  "",
]);

/** An auth-failure (DMARC) report — domain level problem, not recipient complaint. */
const AUTH_FAILURE_REPORT = crlf([
  "From: dmarc-reports@microsoft.com",
  "To: fbl@alecrae.com",
  'Content-Type: multipart/report; report-type=feedback-report; boundary="AF1"',
  "MIME-Version: 1.0",
  "",
  "--AF1",
  "Content-Type: text/plain",
  "",
  "DMARC authentication failure.",
  "--AF1",
  "Content-Type: message/feedback-report",
  "",
  "Feedback-Type: auth-failure",
  "User-Agent: MSFBL/3.0",
  "Version: 1",
  "Original-Mail-From: noreply@alecrae.com",
  "Arrival-Date: 2026-04-18T06:12:00Z",
  "Source-IP: 192.0.2.55",
  "Reported-Domain: alecrae.com",
  "Authentication-Results: mx.microsoft.com; dkim=fail; spf=fail; dmarc=fail",
  "",
  "--AF1--",
  "",
]);

/** A minimal report missing all optional headers except feedback-type. */
const MINIMAL_REPORT = crlf([
  'Content-Type: multipart/report; report-type=feedback-report; boundary="MIN"',
  "MIME-Version: 1.0",
  "",
  "--MIN",
  "Content-Type: text/plain",
  "",
  "Minimal.",
  "--MIN",
  "Content-Type: message/feedback-report",
  "",
  "Feedback-Type: fraud",
  "Version: 1",
  "",
  "--MIN--",
  "",
]);

/** Opt-out report from a mailing list unsubscribe complaint. */
const OPT_OUT_REPORT = crlf([
  'Content-Type: multipart/report; report-type=feedback-report; boundary="OO"',
  "MIME-Version: 1.0",
  "",
  "--OO",
  "Content-Type: text/plain",
  "",
  "User used List-Unsubscribe.",
  "--OO",
  "Content-Type: message/feedback-report",
  "",
  "Feedback-Type: opt-out",
  "Version: 1",
  "Original-Rcpt-To: subscriber@example.com",
  "Arrival-Date: Fri, 10 Apr 2026 14:00:00 +0000",
  "Reported-Domain: alecrae.com",
  "",
  "--OO--",
  "",
]);

/** Virus report. */
const VIRUS_REPORT = crlf([
  'Content-Type: multipart/report; report-type=feedback-report; boundary="V"',
  "MIME-Version: 1.0",
  "",
  "--V",
  "Content-Type: text/plain",
  "",
  "Virus detected.",
  "--V",
  "Content-Type: message/feedback-report",
  "",
  "Feedback-Type: virus",
  "Version: 1",
  "Source-IP: 203.0.113.77",
  "Arrival-Date: Thu, 18 Apr 2026 10:00:00 +0000",
  "",
  "--V--",
  "",
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseArfReport", () => {
  it("parses a standard Yahoo-style abuse report", () => {
    const result = parseArfReport(ABUSE_REPORT);
    expect(result.success).toBe(true);
    const r = result.report as ArfReport;
    expect(r.feedbackType).toBe("abuse");
    expect(r.userAgent).toBe("YahooMailFBL/2.0");
    expect(r.sourceIp).toBe("203.0.113.42");
    expect(r.reportingMta).toBe("mta1.am0.yahoodns.net");
    expect(r.originalMailFrom).toBe("bounce-123@mail.alecrae.com");
    expect(r.originalRcptTo).toBe("victim@yahoo.com");
    expect(r.originalMessageId).toBe("abc123@mail.alecrae.com");
    expect(r.reportedDomain).toBe("mail.alecrae.com");
    expect(r.incidents).toBe(1);
    expect(r.authResults).toContain("dkim=pass");
    // Arrival-Date normalized to ISO 8601.
    expect(r.arrivalDate).toMatch(/^2026-04-18T\d{2}:55:12\.000Z$/);
    // Original subject pulled from the message/rfc822 part.
    expect(r.originalSubject).toBe("Your weekly digest");
    expect(r.rawHeaders).toContain("Message-ID: <abc123@mail.alecrae.com>");
  });

  it("parses a Gmail-style not-spam report as a positive signal", () => {
    const result = parseArfReport(NOT_SPAM_REPORT);
    expect(result.success).toBe(true);
    const r = result.report as ArfReport;
    expect(r.feedbackType).toBe("not-spam");
    expect(r.originalRcptTo).toBe("user@gmail.com");
    expect(r.sourceIp).toBe("198.51.100.9");
    expect(r.originalMessageId).toBe("greetings-7@alecrae.com");
    expect(r.originalSubject).toBe("Thanks for joining AlecRae");
  });

  it("parses an auth-failure (DMARC) report", () => {
    const result = parseArfReport(AUTH_FAILURE_REPORT);
    expect(result.success).toBe(true);
    const r = result.report as ArfReport;
    expect(r.feedbackType).toBe("auth-failure");
    expect(r.authResults).toContain("dmarc=fail");
    expect(r.reportedDomain).toBe("alecrae.com");
    expect(r.arrivalDate).toBe("2026-04-18T06:12:00.000Z");
    // No original-message part present → these should be absent.
    expect(r.originalSubject).toBeUndefined();
    expect(r.rawHeaders).toBeUndefined();
  });

  it("parses a minimal report with only feedback-type", () => {
    const result = parseArfReport(MINIMAL_REPORT);
    expect(result.success).toBe(true);
    const r = result.report as ArfReport;
    expect(r.feedbackType).toBe("fraud");
    // Arrival-Date falls back to "now" when absent — just check it's valid ISO.
    expect(Number.isNaN(new Date(r.arrivalDate).getTime())).toBe(false);
    expect(r.userAgent).toBeUndefined();
    expect(r.sourceIp).toBeUndefined();
    expect(r.reportingMta).toBeUndefined();
    expect(r.originalMailFrom).toBeUndefined();
    expect(r.incidents).toBeUndefined();
  });

  it("parses an opt-out report", () => {
    const result = parseArfReport(OPT_OUT_REPORT);
    expect(result.success).toBe(true);
    expect(result.report?.feedbackType).toBe("opt-out");
    expect(result.report?.originalRcptTo).toBe("subscriber@example.com");
  });

  it("parses a virus report", () => {
    const result = parseArfReport(VIRUS_REPORT);
    expect(result.success).toBe(true);
    expect(result.report?.feedbackType).toBe("virus");
    expect(result.report?.sourceIp).toBe("203.0.113.77");
  });

  it("handles LF-only line endings", () => {
    const lfOnly = ABUSE_REPORT.replace(/\r\n/g, "\n");
    const result = parseArfReport(lfOnly);
    expect(result.success).toBe(true);
    expect(result.report?.feedbackType).toBe("abuse");
    expect(result.report?.sourceIp).toBe("203.0.113.42");
  });

  it("accepts a Buffer input", () => {
    const buf = Buffer.from(ABUSE_REPORT, "utf8");
    const result = parseArfReport(buf);
    expect(result.success).toBe(true);
    expect(result.report?.feedbackType).toBe("abuse");
  });

  it("returns success=false for an empty message", () => {
    const result = parseArfReport("");
    expect(result.success).toBe(false);
    expect(result.error).toContain("empty");
  });

  it("returns success=false when the top-level type is not multipart/report", () => {
    const notMultipart = crlf([
      "Content-Type: text/plain",
      "",
      "just a regular email",
      "",
    ]);
    const result = parseArfReport(notMultipart);
    expect(result.success).toBe(false);
    expect(result.error).toContain("multipart");
  });

  it("returns success=false when no MIME boundary is declared", () => {
    const noBoundary = crlf([
      "Content-Type: multipart/report; report-type=feedback-report",
      "",
      "no boundary here",
      "",
    ]);
    const result = parseArfReport(noBoundary);
    expect(result.success).toBe(false);
    expect(result.error).toContain("boundary");
  });

  it("returns success=false when the machine-readable report part is missing", () => {
    const noMachine = crlf([
      'Content-Type: multipart/report; report-type=feedback-report; boundary="X"',
      "",
      "--X",
      "Content-Type: text/plain",
      "",
      "Just a summary, no feedback-report part.",
      "--X--",
      "",
    ]);
    const result = parseArfReport(noMachine);
    expect(result.success).toBe(false);
    expect(result.error).toContain("machine-readable");
  });

  it("falls back to sniffing Feedback-Type in a mis-labeled text/plain part", () => {
    const misLabeled = crlf([
      'Content-Type: multipart/report; report-type=feedback-report; boundary="ML"',
      "",
      "--ML",
      "Content-Type: text/plain",
      "",
      "This ISP mis-labels the content-type but puts ARF fields in plain text.",
      "--ML",
      "Content-Type: text/plain",
      "",
      "Feedback-Type: abuse",
      "Version: 1",
      "Source-IP: 192.0.2.1",
      "Arrival-Date: Thu, 18 Apr 2026 12:00:00 +0000",
      "",
      "--ML--",
      "",
    ]);
    const result = parseArfReport(misLabeled);
    expect(result.success).toBe(true);
    expect(result.report?.feedbackType).toBe("abuse");
    expect(result.report?.sourceIp).toBe("192.0.2.1");
  });

  it("normalizes unknown feedback-type values to 'other'", () => {
    const weird = crlf([
      'Content-Type: multipart/report; report-type=feedback-report; boundary="W"',
      "",
      "--W",
      "Content-Type: message/feedback-report",
      "",
      "Feedback-Type: hostile-takeover",
      "Version: 1",
      "",
      "--W--",
      "",
    ]);
    const result = parseArfReport(weird);
    expect(result.success).toBe(true);
    expect(result.report?.feedbackType).toBe("other");
  });

  it("tolerates an unparseable Arrival-Date by falling back to now", () => {
    const badDate = crlf([
      'Content-Type: multipart/report; report-type=feedback-report; boundary="BD"',
      "",
      "--BD",
      "Content-Type: message/feedback-report",
      "",
      "Feedback-Type: abuse",
      "Arrival-Date: not a real date",
      "Version: 1",
      "",
      "--BD--",
      "",
    ]);
    const before = Date.now();
    const result = parseArfReport(badDate);
    const after = Date.now();
    expect(result.success).toBe(true);
    const t = new Date(result.report?.arrivalDate ?? "").getTime();
    expect(Number.isFinite(t)).toBe(true);
    // Fallback should be "roughly now" — give a generous 2s window.
    expect(t).toBeGreaterThanOrEqual(before - 1000);
    expect(t).toBeLessThanOrEqual(after + 1000);
  });

  it("strips the 'dns;' prefix from Reporting-MTA values", () => {
    const result = parseArfReport(ABUSE_REPORT);
    expect(result.success).toBe(true);
    expect(result.report?.reportingMta).toBe("mta1.am0.yahoodns.net");
    expect(result.report?.reportingMta?.startsWith("dns")).toBe(false);
  });

  it("strips angle brackets from addresses and message-ids", () => {
    const result = parseArfReport(ABUSE_REPORT);
    expect(result.success).toBe(true);
    expect(result.report?.originalMailFrom).not.toContain("<");
    expect(result.report?.originalMessageId).not.toContain("<");
  });
});

describe("summarize", () => {
  it("maps abuse to suppress", () => {
    const s = summarize({
      feedbackType: "abuse",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("suppress");
    expect(s.reason.length).toBeGreaterThan(0);
  });

  it("maps fraud to suppress", () => {
    const s = summarize({
      feedbackType: "fraud",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("suppress");
  });

  it("maps virus to suppress", () => {
    const s = summarize({
      feedbackType: "virus",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("suppress");
  });

  it("maps auth-failure to flag (domain-level issue)", () => {
    const s = summarize({
      feedbackType: "auth-failure",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("flag");
  });

  it("maps not-spam to log (positive signal)", () => {
    const s = summarize({
      feedbackType: "not-spam",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("log");
    expect(s.reason.toLowerCase()).toContain("positive");
  });

  it("maps opt-out to log", () => {
    const s = summarize({
      feedbackType: "opt-out",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("log");
  });

  it("maps other to log", () => {
    const s = summarize({
      feedbackType: "other",
      arrivalDate: new Date().toISOString(),
    });
    expect(s.action).toBe("log");
  });
});
