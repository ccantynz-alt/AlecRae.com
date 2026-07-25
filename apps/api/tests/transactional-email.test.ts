/**
 * Tests for sendTransactionalEmail.
 *
 * Verifies:
 *  1. Sends via Vapron when configured, returning the provider + id
 *  2. No-ops (sent: false) without a network call when unconfigured
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendTransactionalEmail } from "../src/lib/transactional-email.js";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env["VAPRON_API_KEY"];
});

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    delete process.env["VAPRON_API_KEY"];
  });

  it("sends via Vapron when configured", async () => {
    process.env["VAPRON_API_KEY"] = "vpk_test";
    // Vapron's platform email endpoint answers with plain JSON — no tRPC
    // envelope (issue #83's transport correction).
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: "msg_42" }), { status: 200 }),
    ) as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const result = await sendTransactionalEmail({
      to: "a@b.com",
      subject: "Welcome",
      html: "<p>hi</p>",
    });

    expect(result).toEqual({ sent: true, provider: "vapron", id: "msg_42" });
    const calls = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(1);
    expect(String(calls[0]?.[0])).toBe("https://vapron.ai/api/platform/email/send");
  });

  it("no-ops without a network call when unconfigured", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    globalThis.fetch = fetchMock;

    const result = await sendTransactionalEmail({ to: "a@b.com", subject: "x", html: "y" });

    expect(result).toEqual({ sent: false, provider: "none" });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
