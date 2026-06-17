import { describe, it, expect } from "vitest";
import { parseEmail } from "@alecrae/email-parser";
import {
  splitMboxMessages,
  parsedToReceived,
} from "../src/lib/received-email-store.js";

const SAMPLE_EML = [
  "From: Alice Example <alice@example.com>",
  "To: Bob <bob@example.org>",
  "Cc: carol@example.net",
  "Subject: Quarterly numbers",
  "Message-ID: <msg-123@example.com>",
  "Date: Mon, 01 Jan 2024 10:00:00 +0000",
  "",
  "Hi Bob, the numbers are attached. Thanks!",
].join("\n");

function mboxWith(...messages: string[]): string {
  return messages
    .map((m, i) => `From sender${i}@example.com Mon Jan 01 10:00:00 2024\n${m}`)
    .join("\n");
}

describe("splitMboxMessages", () => {
  it("splits an mbox into individual messages and drops the From_ postmark", () => {
    const mbox = mboxWith(SAMPLE_EML, SAMPLE_EML.replace("Quarterly numbers", "Second message"));
    const parts = splitMboxMessages(mbox);
    expect(parts).toHaveLength(2);
    for (const p of parts) {
      expect(p).toContain("Subject:");
      // The "From " postmark line must not leak into the parsed message.
      expect(p.startsWith("From ")).toBe(false);
    }
    expect(parts[1]).toContain("Second message");
  });

  it("treats content with no postmark as a single message", () => {
    const parts = splitMboxMessages(SAMPLE_EML);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toContain("Quarterly numbers");
  });

  it("returns nothing for empty content", () => {
    expect(splitMboxMessages("")).toEqual([]);
    expect(splitMboxMessages("   \n  ")).toEqual([]);
  });
});

describe("parseEmail + parsedToReceived", () => {
  it("maps a parsed RFC 5322 message to the store input", () => {
    const parsed = parseEmail(SAMPLE_EML);
    const input = parsedToReceived(parsed, "acct_1", "eml");

    expect(input.accountId).toBe("acct_1");
    expect(input.source).toBe("eml");
    expect(input.from.address).toBe("alice@example.com");
    expect(input.to[0]?.address).toBe("bob@example.org");
    expect(input.subject).toBe("Quarterly numbers");
    expect(input.messageId).toContain("msg-123@example.com");
    expect(input.textBody ?? "").toContain("the numbers are attached");
    expect(input.receivedAt).toBeInstanceOf(Date);
  });
});
