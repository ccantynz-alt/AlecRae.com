/**
 * Tests for Outlook delta-query deletion handling (issue #113(e)).
 *
 * Outlook sync already used Microsoft Graph's delta query for incremental
 * sync, but never handled the "@removed" marker delta responses use for
 * deletions — every item was parsed as a real message unconditionally,
 * which for a removed-marker item (no subject/from/body) would produce a
 * garbage row rather than just missing the deletion. Outlook sync also
 * never attempted delta-delete detection at all, unlike Gmail's history
 * API (fixed earlier this session).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const storeReceivedEmailMock = vi.fn().mockResolvedValue({ stored: true, id: "email_1" });
const applyRemoteDeletionMock = vi.fn().mockResolvedValue(true);

vi.mock("../src/lib/received-email-store.js", () => ({
  storeReceivedEmail: storeReceivedEmailMock,
  applyRemoteDeletion: applyRemoteDeletionMock,
}));

const realFetch = globalThis.fetch;

describe("syncOutlookMessages — delta deletion handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes an @removed delta entry to applyRemoteDeletion, not storeReceivedEmail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [{ id: "outlook_msg_deleted", "@removed": { reason: "deleted" } }],
          "@odata.deltaLink": "https://graph.microsoft.com/delta?token=abc",
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const { syncOutlookMessages } = await import("../src/sync/engine.js");
    const result = await syncOutlookMessages({
      id: "acct_1",
      userId: "user_1",
      provider: "outlook",
      email: "test@outlook.com",
      displayName: "Test",
      accessToken: "token_abc",
    } as never);

    expect(applyRemoteDeletionMock).toHaveBeenCalledWith("user_1", "outlook_msg_deleted");
    expect(storeReceivedEmailMock).not.toHaveBeenCalled();
    expect(result.messagesDeleted).toBe(1);
    expect(result.messagesAdded).toBe(0);

    globalThis.fetch = realFetch;
  });

  it("still stores a normal message, with providerMessageId set for future deletion correlation", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          value: [
            {
              id: "outlook_msg_real",
              conversationId: "conv_1",
              subject: "Hello",
              bodyPreview: "Hi there",
              from: { emailAddress: { name: "Alice", address: "alice@example.com" } },
              toRecipients: [{ emailAddress: { name: "Bob", address: "bob@example.com" } }],
              ccRecipients: [],
              receivedDateTime: "2026-07-20T00:00:00Z",
              isRead: false,
              hasAttachments: false,
              internetMessageId: "<msg1@example.com>",
              importance: "normal",
            },
          ],
          "@odata.deltaLink": "https://graph.microsoft.com/delta?token=def",
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const { syncOutlookMessages } = await import("../src/sync/engine.js");
    const result = await syncOutlookMessages({
      id: "acct_1",
      userId: "user_1",
      provider: "outlook",
      email: "test@outlook.com",
      displayName: "Test",
      accessToken: "token_abc",
    } as never);

    expect(storeReceivedEmailMock).toHaveBeenCalledTimes(1);
    const callArg = storeReceivedEmailMock.mock.calls[0]?.[0] as { providerMessageId?: string };
    expect(callArg.providerMessageId).toBe("outlook_msg_real");
    expect(result.messagesAdded).toBe(1);
    expect(result.messagesDeleted).toBe(0);

    globalThis.fetch = realFetch;
  });
});
