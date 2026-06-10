/**
 * Tests for the Vapron platform client (tRPC transport).
 *
 * Verifies:
 *  1. Requests carry the Bearer auth header + correct tRPC URL/body envelope
 *  2. tRPC { error: { json } } envelopes surface as typed VapronError
 *  3. ai.complete unwraps result.data.json and extracts assistant text
 *  4. Missing VAPRON_API_KEY throws "not_configured" without a network call
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vapron, isVapronConfigured } from "../src/lib/vapron.js";

const realFetch = globalThis.fetch;

/** Wrap a payload in the tRPC/superjson success envelope. */
function trpcOk(data: unknown): unknown {
  return { result: { data: { json: data } } };
}

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
  process.env["VAPRON_BASE_URL"] = "https://api.vapron.ai/api/trpc";
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

  it("sends email with the Bearer header, tRPC URL and { json } body", async () => {
    const fetchMock = mockFetch(200, trpcOk({ id: "msg_123" }));
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
    expect(url).toBe("https://api.vapron.ai/api/trpc/customerEmail.send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer vpk_test_key");
    expect(JSON.parse(init.body as string)).toEqual({
      json: { to: "a@b.com", subject: "Hi", html: "<p>Hi</p>" },
    });
  });

  it("surfaces a tRPC { error: { json } } envelope as a typed VapronError", async () => {
    globalThis.fetch = mockFetch(401, {
      error: { json: { message: "Invalid key", data: { code: "UNAUTHORIZED", httpStatus: 401 } } },
    });

    await expect(vapron.email.send({ to: "a@b.com", subject: "x", html: "y" })).rejects.toMatchObject(
      {
        name: "VapronError",
        code: "UNAUTHORIZED",
        status: 401,
        message: "Invalid key",
      },
    );
  });

  it("calls aiGateway.complete and extracts text (Anthropic-style content)", async () => {
    const fetchMock = mockFetch(
      200,
      trpcOk({ content: [{ type: "text", text: "ok" }], model: "claude-sonnet-4-6" }),
    );
    globalThis.fetch = fetchMock;

    const result = await vapron.ai.complete({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 256,
    });

    expect(result.text).toBe("ok");
    const [url, init] = (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.vapron.ai/api/trpc/aiGateway.complete");
    const sent = JSON.parse(init.body as string) as { json: Record<string, unknown> };
    expect(sent.json["max_tokens"]).toBe(256);
    expect(sent.json["model"]).toBe("claude-sonnet-4-6"); // defaulted
    expect(sent.json["messages"]).toEqual([{ role: "user", content: "hello" }]);
  });

  it("extracts text from an OpenAI-style choices payload", async () => {
    globalThis.fetch = mockFetch(
      200,
      trpcOk({ choices: [{ index: 0, message: { role: "assistant", content: "hi there" } }] }),
    );

    const result = await vapron.ai.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("hi there");
  });

  it("throws not_configured without hitting the network when the key is missing", async () => {
    delete process.env["VAPRON_API_KEY"];
    const fetchMock = mockFetch(200, trpcOk({}));
    globalThis.fetch = fetchMock;

    await expect(vapron.storage.listBuckets()).rejects.toMatchObject({
      name: "VapronError",
      code: "not_configured",
    });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});
