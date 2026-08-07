/**
 * Tests for the SMTP wire responses of the inbound receiver:
 *
 *  - Typed verdict errors map to their own codes: reject -> 550, defer -> 451
 *    (previously EVERY throw became "451 Temporary failure: <reason>", so
 *    permanently-rejected spam was retried by senders for days).
 *  - Wire responses are GENERIC — no spam score / filter detail leaks to the
 *    sender (a tuning oracle); detail goes to logs only.
 *  - STARTTLS is answered honestly: not advertised, 502 on the command, and
 *    session.secure is never set without a real TLS upgrade.
 */

import { describe, it, expect } from "vitest";
import {
  SmtpConnectionHandler,
  type DomainCheckResult,
  type DomainVerifier,
  type SmtpReceiverConfig,
} from "../src/receiver/smtp-receiver.js";
import { smtpReject, smtpDefer, SmtpError } from "../src/errors.js";

const baseConfig = {
  hostname: "mx.test.dev",
  port: 25,
  maxMessageSize: 10 * 1024 * 1024,
  maxRecipients: 50,
  connectionTimeout: 60_000,
  dataTimeout: 120_000,
  requireTls: false,
  bannerDelay: 0,
  maxInboundPerDomainPerHour: 100,
  onMessage: async (): Promise<void> => {},
};

const acceptAllVerifier: DomainVerifier = async (): Promise<DomainCheckResult> => ({
  registered: true,
  active: true,
  dnsStale: false,
});

function createHandler(overrides: Partial<SmtpReceiverConfig> = {}): SmtpConnectionHandler {
  const config: SmtpReceiverConfig = {
    ...baseConfig,
    domainVerifier: acceptAllVerifier,
    ...overrides,
  };
  return new SmtpConnectionHandler(config, "127.0.0.1", 12345);
}

/** Drive a handler through EHLO/MAIL/RCPT/DATA and submit a message body. */
async function submitMessage(
  handler: SmtpConnectionHandler,
): Promise<{ code: number; message: string }> {
  handler.getGreeting();
  await handler.processCommand("EHLO client.example.com");
  await handler.processCommand("MAIL FROM:<sender@remote.example>");
  await handler.processCommand("RCPT TO:<user@example.com>");
  const dataResp = await handler.processCommand("DATA");
  expect(dataResp.code).toBe(354);

  const raw = new TextEncoder().encode(
    "Subject: test\r\nFrom: sender@remote.example\r\n\r\nbody\r\n.\r\n",
  );
  const response = await handler.processDataChunk(raw);
  if (!response) throw new Error("Expected a response after end-of-data");
  return response;
}

describe("SMTP verdict wire responses", () => {
  it("answers 250 for a message the handler accepts", async () => {
    const handler = createHandler({
      onMessage: async (): Promise<void> => {},
    });
    const response = await submitMessage(handler);
    expect(response.code).toBe(250);
  });

  it("maps a reject verdict (SmtpError 550) to a generic permanent rejection", async () => {
    const handler = createHandler({
      onMessage: async (): Promise<void> => {
        throw smtpReject();
      },
    });
    const response = await submitMessage(handler);
    expect(response.code).toBe(550);
    expect(response.message).toBe("5.7.1 Message rejected");
  });

  it("maps a defer verdict (SmtpError 451) to a generic temporary failure", async () => {
    const handler = createHandler({
      onMessage: async (): Promise<void> => {
        throw smtpDefer();
      },
    });
    const response = await submitMessage(handler);
    expect(response.code).toBe(451);
    expect(response.message).toBe("4.7.1 Temporary failure, try again later");
  });

  it("never leaks internal error detail on the wire for unexpected errors", async () => {
    const handler = createHandler({
      onMessage: async (): Promise<void> => {
        throw new Error("spam score 9.7 exceeds reject threshold in stage 'ai-detector'");
      },
    });
    const response = await submitMessage(handler);
    expect(response.code).toBe(451);
    // The old behaviour echoed the message verbatim — a filter-tuning oracle.
    expect(response.message).not.toContain("9.7");
    expect(response.message).not.toContain("spam");
    expect(response.message).not.toContain("ai-detector");
    expect(response.message).toBe("4.7.1 Temporary failure, try again later");
  });

  it("carries a custom SmtpError code through to the wire", async () => {
    const handler = createHandler({
      onMessage: async (): Promise<void> => {
        throw new SmtpError(550, "5.7.1 Message rejected");
      },
    });
    const response = await submitMessage(handler);
    expect(response.code).toBe(550);
  });

  it("recovers the transaction after a rejection (RSET not required)", async () => {
    let shouldReject = true;
    const handler = createHandler({
      onMessage: async (): Promise<void> => {
        if (shouldReject) throw smtpReject();
      },
    });
    const first = await submitMessage(handler);
    expect(first.code).toBe(550);

    // Same connection: a follow-up message must go through cleanly.
    shouldReject = false;
    await handler.processCommand("MAIL FROM:<sender@remote.example>");
    await handler.processCommand("RCPT TO:<user@example.com>");
    const dataResp = await handler.processCommand("DATA");
    expect(dataResp.code).toBe(354);
    const raw = new TextEncoder().encode("Subject: ok\r\n\r\nfine\r\n.\r\n");
    const response = await handler.processDataChunk(raw);
    expect(response?.code).toBe(250);
  });
});

describe("STARTTLS honesty", () => {
  it("does not advertise STARTTLS in the EHLO response", async () => {
    const handler = createHandler();
    handler.getGreeting();
    const response = await handler.processCommand("EHLO client.example.com");
    expect(response.code).toBe(250);
    expect(response.message).not.toContain("STARTTLS");
  });

  it("answers STARTTLS with 502 Command not implemented", async () => {
    const handler = createHandler();
    handler.getGreeting();
    await handler.processCommand("EHLO client.example.com");
    const response = await handler.processCommand("STARTTLS");
    expect(response.code).toBe(502);
    expect(response.message).toContain("Command not implemented");
  });

  it("never marks the session secure after a STARTTLS attempt", async () => {
    const handler = createHandler();
    handler.getGreeting();
    await handler.processCommand("EHLO client.example.com");
    await handler.processCommand("STARTTLS");
    expect(handler.getSession().secure).toBe(false);
  });

  it("refuses DATA when requireTls is set — STARTTLS cannot satisfy it", async () => {
    // With no real TLS upgrade available, a config that demands TLS must
    // refuse plaintext mail rather than pretend. The old code set
    // session.secure = true on STARTTLS without upgrading the socket, so
    // requireTls was defeated by issuing STARTTLS and continuing plaintext.
    const handler = createHandler({ requireTls: true });
    handler.getGreeting();
    await handler.processCommand("EHLO client.example.com");
    await handler.processCommand("STARTTLS"); // 502, changes nothing
    await handler.processCommand("MAIL FROM:<sender@remote.example>");
    await handler.processCommand("RCPT TO:<user@example.com>");
    const response = await handler.processCommand("DATA");
    expect(response.code).toBe(530);
    expect(handler.getSession().secure).toBe(false);
  });
});

describe("Bounce-domain RCPT tracking", () => {
  it("records bounce-domain recipients on the session", async () => {
    const verifier: DomainVerifier = async (domain): Promise<DomainCheckResult> => {
      if (domain === "bounce.example.com") {
        return { registered: true, active: true, dnsStale: false, bounceDomain: true };
      }
      return { registered: true, active: true, dnsStale: false };
    };
    const handler = createHandler({ domainVerifier: verifier });
    handler.getGreeting();
    await handler.processCommand("EHLO client.example.com");
    await handler.processCommand("MAIL FROM:<mailer-daemon@remote.example>");

    const r1 = await handler.processCommand("RCPT TO:<bounces+abc123@bounce.example.com>");
    expect(r1.code).toBe(250);
    const r2 = await handler.processCommand("RCPT TO:<user@example.com>");
    expect(r2.code).toBe(250);

    const session = handler.getSession();
    expect(session.rcptTo).toEqual([
      "bounces+abc123@bounce.example.com",
      "user@example.com",
    ]);
    expect(session.bounceRcptTo).toEqual(["bounces+abc123@bounce.example.com"]);
  });
});
