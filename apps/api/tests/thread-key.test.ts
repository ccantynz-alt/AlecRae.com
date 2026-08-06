/**
 * Tests for conversation keys (Known Issue #76b).
 *
 * `GET /v1/messages` exposed no threading at all, so the inbox muted threads by
 * MESSAGE id — it literally checked `mutedIds.has(email.id)` against a set of
 * thread ids. Muting a thread therefore muted exactly one message and every
 * reply arrived unmuted. The feature could not do the thing it is named after.
 *
 * The key is derived from the RFC 5322 headers we already persist rather than
 * from a new column, since a migration is Craig's call. What matters is that
 * every message in a chain resolves to the SAME value — including the message
 * that started it, which is the case a naive implementation gets wrong.
 */

import { describe, it, expect } from "vitest";
import { threadKeyFor } from "../src/lib/thread-key.js";

const ROOT = "root-abc@example.com";

describe("thread roots", () => {
  it("keys a message with no ancestors on its own id", () => {
    expect(threadKeyFor({ messageId: ROOT })).toBe(ROOT);
  });

  it("treats null and empty headers as no ancestors", () => {
    expect(
      threadKeyFor({ messageId: ROOT, inReplyTo: null, references: null }),
    ).toBe(ROOT);
    expect(threadKeyFor({ messageId: ROOT, references: [] })).toBe(ROOT);
    expect(threadKeyFor({ messageId: ROOT, inReplyTo: "  " })).toBe(ROOT);
  });
});

describe("replies resolve to the root", () => {
  it("uses the first entry of References — the thread starter", () => {
    expect(
      threadKeyFor({
        messageId: "reply-2@example.com",
        inReplyTo: "reply-1@example.com",
        references: [ROOT, "reply-1@example.com"],
      }),
    ).toBe(ROOT);
  });

  it("falls back to In-Reply-To when the client omitted References", () => {
    // Common in the wild. The parent, having no ancestors, keys on its own id,
    // so this still lands on the same value.
    expect(
      threadKeyFor({ messageId: "reply-1@example.com", inReplyTo: ROOT }),
    ).toBe(ROOT);
  });

  it("gives every message in one chain the same key — the whole point", () => {
    const root = threadKeyFor({ messageId: ROOT });
    const first = threadKeyFor({
      messageId: "r1@example.com",
      inReplyTo: ROOT,
      references: [ROOT],
    });
    const second = threadKeyFor({
      messageId: "r2@example.com",
      inReplyTo: "r1@example.com",
      references: [ROOT, "r1@example.com"],
    });

    expect(new Set([root, first, second]).size).toBe(1);
  });

  it("does not merge unrelated conversations", () => {
    const a = threadKeyFor({ messageId: "a@example.com" });
    const b = threadKeyFor({ messageId: "b@example.com" });
    expect(a).not.toBe(b);
  });
});

describe("header formatting", () => {
  it("ignores angle brackets, which clients disagree about", () => {
    // A chain whose headers mix the two conventions must still resolve to one
    // key, or a thread silently splits partway through.
    expect(threadKeyFor({ messageId: `<${ROOT}>` })).toBe(ROOT);
    expect(
      threadKeyFor({ messageId: "r1@example.com", inReplyTo: `<${ROOT}>` }),
    ).toBe(ROOT);
    expect(
      threadKeyFor({ messageId: "r1@example.com", references: [`<${ROOT}>`] }),
    ).toBe(ROOT);
  });

  it("skips blank entries in a References chain", () => {
    expect(
      threadKeyFor({ messageId: "r1@example.com", references: ["", "  ", ROOT] }),
    ).toBe(ROOT);
  });

  it("always returns something, so every message has exactly one thread", () => {
    expect(threadKeyFor({ messageId: "x@example.com" })).not.toBe("");
  });
});
