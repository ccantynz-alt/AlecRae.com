import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryEmailStore } from "../src/storage/store.js";
import type { ParsedEmail, ResolvedRecipient, FilterVerdict } from "../src/types.js";

function makeParsedEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    messageId: `msg-${Date.now()}@example.com`,
    from: [{ address: "sender@example.com" }],
    to: [{ address: "recipient@example.com" }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: "Test Subject",
    references: [],
    headers: [],
    text: "Hello, this is a test email body.",
    attachments: [],
    rawSize: 256,
    ...overrides,
  };
}

function makeRecipient(overrides: Partial<ResolvedRecipient> = {}): ResolvedRecipient {
  return {
    originalAddress: "recipient@example.com",
    resolvedAddress: "recipient@example.com",
    mailboxId: "inbox-1",
    accountId: "acct-1",
    rule: {
      id: "direct:inbox-1",
      pattern: "recipient@example.com",
      type: "exact",
      action: "deliver",
      destination: "inbox-1",
      priority: 0,
    },
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<FilterVerdict> = {}): FilterVerdict {
  return {
    action: "accept",
    score: 0,
    flags: new Set(),
    authResults: [],
    ...overrides,
  };
}

describe("InMemoryEmailStore", () => {
  let store: InMemoryEmailStore;

  beforeEach(() => {
    store = new InMemoryEmailStore();
  });

  it("stores an email and retrieves it by ID", async () => {
    const parsed = makeParsedEmail({ messageId: "store-test-1@example.com" });
    const recipient = makeRecipient();

    const stored = await store.store(parsed, recipient, makeVerdict());

    expect(stored.id).toBeTruthy();
    expect(stored.accountId).toBe("acct-1");
    expect(stored.subject).toBe("Test Subject");
    expect(stored.flags.has("\\Recent")).toBe(true);

    const retrieved = await store.getById("acct-1", stored.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.messageId).toBe("store-test-1@example.com");
  });

  it("retrieves an email by message ID", async () => {
    const parsed = makeParsedEmail({ messageId: "lookup-by-msgid@example.com" });
    const stored = await store.store(parsed, makeRecipient(), makeVerdict());

    const retrieved = await store.getByMessageId("acct-1", "lookup-by-msgid@example.com");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(stored.id);
  });

  it("returns null when retrieving from wrong account", async () => {
    const parsed = makeParsedEmail();
    const stored = await store.store(parsed, makeRecipient(), makeVerdict());

    const retrieved = await store.getById("wrong-account", stored.id);
    expect(retrieved).toBeNull();
  });

  it("deletes an email and confirms removal", async () => {
    const parsed = makeParsedEmail();
    const stored = await store.store(parsed, makeRecipient(), makeVerdict());

    const deleted = await store.delete("acct-1", stored.id);
    expect(deleted).toBe(true);

    const retrieved = await store.getById("acct-1", stored.id);
    expect(retrieved).toBeNull();
  });

  it("reports correct stats after storing and deleting", async () => {
    await store.store(makeParsedEmail(), makeRecipient(), makeVerdict());
    await store.store(makeParsedEmail(), makeRecipient(), makeVerdict());

    let stats = store.getStats();
    expect(stats.totalEmails).toBe(2);
    expect(stats.accountCount).toBe(1);
    expect(stats.totalSize).toBe(512); // 256 * 2

    // Store with different account
    await store.store(
      makeParsedEmail(),
      makeRecipient({ accountId: "acct-2" }),
      makeVerdict(),
    );

    stats = store.getStats();
    expect(stats.totalEmails).toBe(3);
    expect(stats.accountCount).toBe(2);
  });

  it("marks quarantined emails with the quarantine flag", async () => {
    const stored = await store.store(
      makeParsedEmail(),
      makeRecipient(),
      makeVerdict({ action: "quarantine", flags: new Set(["spam_detected"]) }),
    );

    expect(stored.flags.has("\\Quarantine")).toBe(true);
    expect(stored.flags.has("$spam_detected")).toBe(true);
  });

  it("searches by subject text", async () => {
    await store.store(
      makeParsedEmail({ subject: "Invoice for March" }),
      makeRecipient(),
      makeVerdict(),
    );
    await store.store(
      makeParsedEmail({ subject: "Meeting notes" }),
      makeRecipient(),
      makeVerdict(),
    );

    const results = await store.search({
      accountId: "acct-1",
      subject: "invoice",
    });

    expect(results.total).toBe(1);
    expect(results.emails[0]!.subject).toBe("Invoice for March");
  });
});
