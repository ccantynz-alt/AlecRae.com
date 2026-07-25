/**
 * Tests for the Vapron platform client.
 *
 * The client speaks TWO transports (see src/lib/vapron.ts's header):
 *
 *   1. The plain-REST "platform" surface — email, AI gateway, object storage.
 *      Base `https://vapron.ai/api/platform`, `Bearer <key>`, plain-JSON
 *      request AND response (no envelope). This is the transport corrected in
 *      issue #83 after the original was guessed against unpublished docs.
 *   2. The tRPC admin surface — DNS zone/record management only. Base
 *      `https://api.vapron.ai/api/trpc`, `{ json }` request envelope,
 *      `result.data.json` response envelope. Still unverified against real
 *      docs, so it stays as-built.
 *
 * Both are covered here so a future change to one can't silently reshape the
 * other — which is exactly what happened when the REST rewrite landed and
 * this file (still asserting tRPC for email/AI) was left behind.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vapron, isVapronConfigured } from "../src/lib/vapron.js";

const realFetch = globalThis.fetch;

/** Wrap a payload in the tRPC/superjson success envelope (transport 2 only). */
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

function callOf(fetchMock: typeof fetch, index = 0): [string, RequestInit] {
  return (fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls[index] as [string, RequestInit];
}

beforeEach(() => {
  process.env["VAPRON_API_KEY"] = "vpk_test_key";
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env["VAPRON_API_KEY"];
  delete process.env["VAPRON_BASE_URL"];
  delete process.env["VAPRON_PLATFORM_BASE_URL"];
});

describe("vapron client — REST platform surface (email / AI / storage)", () => {
  it("reports configuration state from the env", () => {
    expect(isVapronConfigured()).toBe(true);
    delete process.env["VAPRON_API_KEY"];
    expect(isVapronConfigured()).toBe(false);
  });

  it("sends email as plain JSON to the REST platform base with a Bearer header", async () => {
    const fetchMock = mockFetch(200, { id: "msg_123" });
    globalThis.fetch = fetchMock;

    const result = await vapron.email.send({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });

    expect(result.id).toBe("msg_123");
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://vapron.ai/api/platform/email/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer vpk_test_key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    // No `{ json: ... }` envelope — the body IS the payload.
    expect(JSON.parse(init.body as string)).toEqual({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
  });

  it("honours VAPRON_PLATFORM_BASE_URL and strips trailing slashes", async () => {
    process.env["VAPRON_PLATFORM_BASE_URL"] = "https://staging.vapron.ai/api/platform/";
    const fetchMock = mockFetch(200, { id: "msg_1" });
    globalThis.fetch = fetchMock;

    await vapron.email.send({ to: "a@b.com", subject: "x", html: "y" });

    expect(callOf(fetchMock)[0]).toBe("https://staging.vapron.ai/api/platform/email/send");
  });

  it("surfaces a REST error body as a typed VapronError", async () => {
    globalThis.fetch = mockFetch(401, { error: "Invalid API key" });

    await expect(vapron.email.send({ to: "a@b.com", subject: "x", html: "y" })).rejects.toMatchObject({
      name: "VapronError",
      code: "vapron_error",
      status: 401,
      message: "Invalid API key",
    });
  });

  it("surfaces a nested { error: { message } } REST error body", async () => {
    globalThis.fetch = mockFetch(422, { error: { message: "Recipient rejected" } });

    await expect(vapron.email.send({ to: "a@b.com", subject: "x", html: "y" })).rejects.toMatchObject({
      name: "VapronError",
      status: 422,
      message: "Recipient rejected",
    });
  });

  it("calls the AI gateway and extracts Anthropic-style content", async () => {
    const fetchMock = mockFetch(200, {
      content: [{ type: "text", text: "ok" }],
      model: "claude-sonnet-4-6",
    });
    globalThis.fetch = fetchMock;

    const result = await vapron.ai.complete({
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 256,
    });

    expect(result.text).toBe("ok");
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://vapron.ai/api/platform/ai/chat");
    const sent = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sent["max_tokens"]).toBe(256);
    expect(sent["model"]).toBe("claude-sonnet-4-6"); // defaulted
    expect(sent["messages"]).toEqual([{ role: "user", content: "hello" }]);
  });

  it("extracts text from an OpenAI-style choices payload", async () => {
    globalThis.fetch = mockFetch(200, {
      choices: [{ index: 0, message: { role: "assistant", content: "hi there" } }],
    });

    const result = await vapron.ai.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("hi there");
  });

  it("returns empty text (never throws) for an unrecognised gateway shape", async () => {
    // The gateway's exact shape isn't documented, so the schema is deliberately
    // tolerant. Callers (lib/ai.ts) MUST treat empty text as a failure — this
    // asserts the contract they rely on rather than silently passing "" along.
    globalThis.fetch = mockFetch(200, { unexpected: { nested: "payload" } });

    const result = await vapron.ai.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("");
    expect(result.raw).toEqual({ unexpected: { nested: "payload" } });
  });

  it("requests a presigned upload URL over REST", async () => {
    const fetchMock = mockFetch(200, { uploadUrl: "https://storage.vapron.ai/put?sig=abc" });
    globalThis.fetch = fetchMock;

    const result = await vapron.storage.getUploadUrl({
      bucket: "alecrae-files",
      path: "acct_1/file.pdf",
      contentType: "application/pdf",
    });

    expect(result.uploadUrl).toBe("https://storage.vapron.ai/put?sig=abc");
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://vapron.ai/api/platform/storage/upload-url");
    expect(JSON.parse(init.body as string)).toEqual({
      bucket: "alecrae-files",
      path: "acct_1/file.pdf",
      contentType: "application/pdf",
    });
  });

  it("rejects a response that doesn't match the expected schema", async () => {
    globalThis.fetch = mockFetch(200, { notAnUploadUrl: true });

    await expect(
      vapron.storage.getUploadUrl({ bucket: "b", path: "p", contentType: "text/plain" }),
    ).rejects.toMatchObject({ name: "VapronError", code: "invalid_response" });
  });

  it("throws not_configured without hitting the network when the key is missing", async () => {
    delete process.env["VAPRON_API_KEY"];
    const fetchMock = mockFetch(200, {});
    globalThis.fetch = fetchMock;

    await expect(vapron.email.send({ to: "a@b.com", subject: "x", html: "y" })).rejects.toMatchObject({
      name: "VapronError",
      code: "not_configured",
    });
    expect((fetchMock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });
});

describe("vapron client — tRPC admin surface (DNS)", () => {
  it("calls a DNS procedure on the tRPC base with a { json } GET input envelope", async () => {
    const fetchMock = mockFetch(200, trpcOk([{ id: "zone_1", name: "alecrae.com" }]));
    globalThis.fetch = fetchMock;

    const zones = await vapron.dns.listZones();

    expect(zones).toEqual([{ id: "zone_1", name: "alecrae.com" }]);
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://api.vapron.ai/api/trpc/dns.myZones.list");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer vpk_test_key");
  });

  it("wraps mutation input in the { json } envelope and unwraps result.data.json", async () => {
    const fetchMock = mockFetch(200, trpcOk({ id: "rec_1" }));
    globalThis.fetch = fetchMock;

    const created = await vapron.dns.createRecord({
      zoneId: "zone_1",
      name: "mx1",
      type: "A",
      content: "149.28.119.158",
    });

    expect(created).toEqual({ id: "rec_1" });
    const [url, init] = callOf(fetchMock);
    expect(url).toBe("https://api.vapron.ai/api/trpc/dns.records.create");
    expect(JSON.parse(init.body as string)).toEqual({
      json: { zoneId: "zone_1", name: "mx1", type: "A", content: "149.28.119.158" },
    });
  });

  it("surfaces a tRPC { error: { json } } envelope as a typed VapronError", async () => {
    globalThis.fetch = mockFetch(401, {
      error: { json: { message: "Invalid key", data: { code: "UNAUTHORIZED", httpStatus: 401 } } },
    });

    await expect(vapron.dns.listZones()).rejects.toMatchObject({
      name: "VapronError",
      code: "UNAUTHORIZED",
      status: 401,
      message: "Invalid key",
    });
  });

  it("honours VAPRON_BASE_URL for the tRPC surface only", async () => {
    process.env["VAPRON_BASE_URL"] = "https://staging.vapron.ai/api/trpc";
    const fetchMock = mockFetch(200, trpcOk([]));
    globalThis.fetch = fetchMock;

    await vapron.dns.listZones();

    expect(callOf(fetchMock)[0]).toBe("https://staging.vapron.ai/api/trpc/dns.myZones.list");
  });
});
