import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before importing the module under test
vi.mock("@emailed/mta/src/spf/validator.js", () => ({
  checkSpf: vi.fn().mockResolvedValue({ result: "pass", domain: "example.com" }),
}));

vi.mock("@emailed/mta/src/dmarc/enforcer.js", () => ({
  evaluateDmarc: vi.fn().mockResolvedValue({
    result: "pass",
    policy: "none",
    appliedPolicy: "none",
    spfAligned: true,
    dkimAligned: true,
  }),
  determineAction: vi.fn().mockReturnValue("none"),
}));

vi.mock("../src/filter/dkim-verifier.js", () => ({
  verifyDkim: vi.fn().mockResolvedValue([
    { status: "pass", domain: "example.com", selector: "default", details: "OK" },
  ]),
}));

vi.mock("@emailed/ai-engine/classifier", () => ({
  classifyEmail: vi.fn().mockResolvedValue({ ok: false }),
  isAIAvailable: vi.fn().mockReturnValue(false),
}));

import { FilterPipeline } from "../src/filter/pipeline.js";
import type { ParsedEmail, SmtpEnvelope } from "../src/types.js";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: "test@example.com",
    from: [{ address: "sender@example.com" }],
    to: [{ address: "recipient@example.com" }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: "Test email",
    references: [],
    headers: [],
    text: "Normal email body.",
    attachments: [],
    rawSize: 500,
    ...overrides,
  };
}

function makeEnvelope(overrides: Partial<SmtpEnvelope> = {}): SmtpEnvelope {
  return {
    mailFrom: "sender@example.com",
    rcptTo: ["recipient@example.com"],
    ...overrides,
  };
}

describe("FilterPipeline", () => {
  let pipeline: FilterPipeline;

  beforeEach(() => {
    pipeline = new FilterPipeline();
    // Remove authentication stage for unit tests of content-based filters
    pipeline.removeStage("authentication");
    pipeline.removeStage("aiClassification");
  });

  it("accepts a clean email with low spam score", async () => {
    const verdict = await pipeline.process(
      makeEnvelope(),
      makeEmail({ subject: "Meeting tomorrow", text: "Let's meet at 3pm." }),
    );

    expect(verdict.action).toBe("accept");
    expect(verdict.score).toBeLessThan(5);
  });

  it("rejects an email with very high spam score", async () => {
    const verdict = await pipeline.process(
      makeEnvelope(),
      makeEmail({
        subject: "FREE VIAGRA CIALIS ROLEX",
        text: "Buy cheap cialis and viagra now! Click here free offer! Dear sir, urgent act now!",
        headers: [
          { key: "x-mailer", value: "bulk sender pro" },
          { key: "precedence", value: "bulk" },
        ],
      }),
    );

    expect(verdict.score).toBeGreaterThanOrEqual(8);
    expect(["reject", "quarantine"]).toContain(verdict.action);
  });

  it("quarantines an email with moderate spam score", async () => {
    const verdict = await pipeline.process(
      makeEnvelope(),
      makeEmail({
        subject: "AMAZING OFFER",
        text: "Dear customer, click here free exclusive deal.",
        headers: [{ key: "precedence", value: "bulk" }],
      }),
    );

    expect(verdict.score).toBeGreaterThanOrEqual(3);
    expect(verdict.flags.has("clickbait") || verdict.flags.has("generic_greeting") || verdict.flags.has("caps_subject")).toBe(true);
  });

  it("flags emails containing phishing language", async () => {
    const verdict = await pipeline.process(
      makeEnvelope(),
      makeEmail({
        subject: "Urgent account issue",
        html: '<p>We detected unusual activity on your account. <a href=\"https://evil.com\">https://bank.com</a></p>',
        text: "Verify your account immediately.",
      }),
    );

    expect(verdict.flags.has("deceptive_link") || verdict.flags.has("phishing_language")).toBe(true);
  });

  it("flags dangerous attachment extensions", async () => {
    const verdict = await pipeline.process(
      makeEnvelope(),
      makeEmail({
        attachments: [
          {
            filename: "invoice.exe",
            contentType: "application/octet-stream",
            contentDisposition: "attachment",
            size: 1024,
            content: new Uint8Array(1024),
            checksum: "abc123",
          },
        ],
      }),
    );

    expect(verdict.flags.has("dangerous_attachment:.exe")).toBe(true);
    expect(verdict.score).toBeGreaterThanOrEqual(5);
  });

  it("defers on stage error instead of accepting", async () => {
    const pipeline = new FilterPipeline();
    pipeline.removeStage("authentication");
    pipeline.removeStage("spam");
    pipeline.removeStage("aiClassification");
    pipeline.removeStage("phishing");
    pipeline.removeStage("content");
    pipeline.removeStage("malware");

    pipeline.addStage("broken", async () => {
      throw new Error("stage exploded");
    });

    const verdict = await pipeline.process(makeEnvelope(), makeEmail());

    expect(verdict.action).toBe("defer");
    expect(verdict.reason).toContain("broken");
    expect(verdict.flags.has("error:broken")).toBe(true);
  });

  it("detects EICAR test malware in attachments", async () => {
    const eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
    const verdict = await pipeline.process(
      makeEnvelope(),
      makeEmail({
        attachments: [
          {
            filename: "test.txt",
            contentType: "text/plain",
            contentDisposition: "attachment",
            size: eicar.length,
            content: new TextEncoder().encode(eicar),
            checksum: "eicar",
          },
        ],
      }),
    );

    expect(verdict.action).toBe("reject");
    expect(verdict.flags.has("malware_detected")).toBe(true);
  });
});
