/**
 * Issue #166 — the degraded /compose fallback put "[AI-composed content
 * would appear here…]" placeholder prose (wrapped in a greeting and
 * sign-off) into `body`, a SENDABLE field. Issue #137 caught that text
 * landing in a user's reply box; the callers now refuse on degraded, but the
 * body itself must also carry nothing fabricated — a caller that ignores the
 * flag must have nothing to send.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../src/middleware/auth.js", () => ({
  requireScope:
    () =>
    async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      c.set("auth", { accountId: "acct_1", userId: "user_1" });
      await next();
    },
}));

describe("POST /compose degraded fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    // Claude unavailable: the API answers 500 for every call.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
  });

  it("returns degraded with an EMPTY body — no placeholder prose in a sendable field", async () => {
    const { aiWritingRouter } = await import("../src/routes/ai-writing.js");
    const app = new Hono();
    app.route("/", aiWritingRouter);

    const res = await app.request("/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: "quarterly report status" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        subject: string;
        body: string;
        confidence: number;
        degraded?: boolean;
        wordCount: number;
      };
    };

    // The degradation is declared, per the #99/#137 contract…
    expect(body.data.degraded).toBe(true);
    expect(body.data.confidence).toBe(0);

    // …and the sendable field is empty rather than fabricated.
    expect(body.data.body).toBe("");
    expect(body.data.wordCount).toBe(0);
    expect(JSON.stringify(body)).not.toContain("[AI-composed");
    expect(JSON.stringify(body)).not.toContain("Best regards");

    // The subject is an honest derivation of the caller's own topic.
    expect(body.data.subject).toBe("Re: quarterly report status");
  });
});
