/**
 * Tests for the Vapron platform client.
 *
 * Verifies:
 *  1. Requests carry the Bearer auth header + correct URL/body
 *  2. { error, code } envelopes surface as typed VapronError
 *  3. ai.chat maps maxTokens -> max_tokens (OpenAI-compatible)
 *  4. Missing VAPRON_API_KEY throws "not_configured" without a network call
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vapron, isVapronConfigured } from "../src/lib/vapron.js";

const realFetch = globalThis.fetch;

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(body === undefined ? "" : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env["VAPRON_API_KEY"] = "vpk_test_key";
  process.env["VAPRON_BASE_URL"] = "https://api.vapron.ai";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env["VAPRON_API_KEY"];
  delete process.env["VAPRON_BASE_URL"];
});

describe("vapron client", () => {
  it("reports configuration state from the env", () => {
    expect(isVapronConfigured()).toBe(true);
    delete process.env["VAPRON_API_KEY"];
    expect(isVapronConfigured()).toBe(false);
  });

  it("sends email with the Bearer header, URL and JSON body", async () => {
    const fetchMock = mockFetch(200, { id: "msg_123" });
    globalThis.fetch = fetchMock;

    const result = await vapron.email.send({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });

    expect(result.id).toBe("msg_123");
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.vapron.ai/api/platform/email/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer vpk_test_key");
    expect(JSON.parse(init.body as string)).toEqual({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
  });

  it("surfaces { error, code } as a typed VapronError", async () => {
    globalThis.fetch = mockFetch(401, { error: "Invalid key", code: "unauthorized" });

    await expect(vapron.email.send({ to: "a@b.com", subject: "x", html: "y" })).rejects.toMatchObject(
      {
        name: "VapronError",
        code: "unauthorized",
        status: 401,
        message: "Invalid key",
      },
    );
  });

  it("maps maxTokens -> max_tokens for ai.chat", async () => {
    const fetchMock = mockFetch(200, {
      id: "cmpl_1",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    });
    globalThis.fetch = fetchMock;

    const completion = await vapron.ai.chat({
      messages: [{ role: "user", content: "hello" }],
      model: "gpt-4o-mini",
      maxTokens: 256,
    });

    expect(completion.choices[0]?.message.content).toBe("ok");
    const [, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent["max_tokens"]).toBe(256);
    expect(sent["model"]).toBe("gpt-4o-mini");
    expect("maxTokens" in sent).toBe(false);
  });

  it("throws not_configured without hitting the network when the key is missing", async () => {
    delete process.env["VAPRON_API_KEY"];
    const fetchMock = mockFetch(200, {});
    globalThis.fetch = fetchMock;

    await expect(vapron.secrets.get("DATABASE_URL")).rejects.toMatchObject({
      name: "VapronError",
      code: "not_configured",
    });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
