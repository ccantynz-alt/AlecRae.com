import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so these are available when vi.mock factories run (hoisted above imports)
const { mockProcessBounce, mockProcessComplaint, mockIsBounce, mockIsComplaint } = vi.hoisted(() => ({
  mockProcessBounce: vi.fn(),
  mockProcessComplaint: vi.fn(),
  mockIsBounce: vi.fn(),
  mockIsComplaint: vi.fn(),
}));

// Mock the database and MTA bounce modules before importing the handler
vi.mock("@emailed/db", () => ({
  getDatabase: vi.fn(),
  emails: {},
  events: {},
  deliveryResults: {},
  suppressionLists: {},
  domains: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => args),
  and: vi.fn((...args: unknown[]) => args),
  ilike: vi.fn((...args: unknown[]) => args),
}));

vi.mock("@emailed/mta/src/bounce/processor.js", () => ({
  DatabaseBounceProcessor: vi.fn().mockImplementation(() => ({
    processBounceMessage: mockProcessBounce,
    processComplaintMessage: mockProcessComplaint,
  })),
}));

vi.mock("@emailed/mta/src/bounce/parser.js", () => ({
  isBounceNotification: mockIsBounce,
  isComplaintReport: mockIsComplaint,
}));

import { BounceComplaintHandler } from "../src/bounce-handler.js";
import type { SmtpEnvelope } from "../src/types.js";

describe("BounceComplaintHandler", () => {
  let handler: BounceComplaintHandler;
  const envelope: SmtpEnvelope = {
    mailFrom: "<>",
    rcptTo: ["postmaster@example.com"],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsBounce.mockReturnValue(false);
    mockIsComplaint.mockReturnValue(false);
    handler = new BounceComplaintHandler();
  });

  it("returns handled=false for a normal (non-bounce) message", async () => {
    const result = await handler.handleIfBounceOrComplaint(
      "From: alice@example.com\r\nSubject: Hello\r\n\r\nHi!",
      envelope,
    );

    expect(result.handled).toBe(false);
    expect(result.type).toBe("none");
    expect(result.recipients).toHaveLength(0);
  });

  it("detects and handles a DSN bounce notification", async () => {
    const dsnMessage = [
      "From: mailer-daemon@example.com",
      "Subject: Delivery Status Notification (Failure)",
      "Content-Type: multipart/report; report-type=delivery-status; boundary=bound",
      "",
      "This is a bounce.",
    ].join("\r\n");

    mockIsBounce.mockReturnValue(true);
    mockProcessBounce.mockReturnValue({
      ok: true,
      value: {
        bounceEvents: [
          {
            recipient: "baduser@remote.com",
            bounceType: "hard",
            bounceCategory: "unknown_user",
            diagnosticCode: "550 5.1.1 User unknown",
          },
        ],
        suppressions: [{ address: "baduser@remote.com", reason: "bounce" }],
        retries: [],
        originalMessageId: null,
      },
    });

    const result = await handler.handleIfBounceOrComplaint(dsnMessage, envelope);

    expect(mockIsBounce).toHaveBeenCalled();
    expect(mockProcessBounce).toHaveBeenCalledWith(dsnMessage);
    expect(result.handled).toBe(true);
    expect(result.type).toBe("bounce");
    expect(result.recipients).toContain("baduser@remote.com");
  });

  it("detects and handles an ARF complaint report", async () => {
    const arfMessage = [
      "Content-Type: multipart/report; report-type=feedback-report; boundary=arf",
      "From: fbl@isp.com",
      "Subject: Complaint",
      "",
      "Complaint about your message.",
    ].join("\r\n");

    // Complaint check runs before bounce check
    mockIsComplaint.mockReturnValue(true);
    mockProcessComplaint.mockReturnValue({
      ok: true,
      value: {
        complaint: {
          recipient: "user@isp.com",
          feedbackType: "abuse",
          feedbackProvider: "isp.com",
        },
        suppression: { address: "user@isp.com", reason: "complaint" },
        originalMessageId: null,
      },
    });

    const result = await handler.handleIfBounceOrComplaint(arfMessage, envelope);

    expect(mockIsComplaint).toHaveBeenCalled();
    expect(mockProcessComplaint).toHaveBeenCalledWith(arfMessage);
    expect(result.handled).toBe(true);
    expect(result.type).toBe("complaint");
    expect(result.recipients).toContain("user@isp.com");
  });

  it("returns handled=false when bounce parsing fails", async () => {
    mockIsBounce.mockReturnValue(true);
    mockProcessBounce.mockReturnValue({
      ok: false,
      error: new Error("Unparseable DSN"),
    });

    const result = await handler.handleIfBounceOrComplaint("raw bounce data", envelope);

    expect(result.handled).toBe(false);
    expect(result.type).toBe("none");
  });

  it("returns handled=false when complaint parsing fails", async () => {
    mockIsComplaint.mockReturnValue(true);
    mockProcessComplaint.mockReturnValue({
      ok: false,
      error: new Error("Unparseable ARF"),
    });

    const result = await handler.handleIfBounceOrComplaint("raw complaint data", envelope);

    expect(result.handled).toBe(false);
    expect(result.type).toBe("none");
  });
});
