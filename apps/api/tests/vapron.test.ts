/**
 * Tests for the Vapron platform client.
 *
 * The client speaks TWO transports (see src/lib/vapron.ts header):
 *
 *   1. Plain REST  — https://vapron.ai/api/platform  (email, AI, upload URLs)
 *      Bearer auth, plain-JSON request body, plain-JSON response, no envelope.
 *      This is the transport confirmed against Craig-supplied working API docs
 *      (issue #83). These tests assert that contract exactly.
 *
 *   2. tRPC — https://api.vapron.ai/api/trpc  (DNS, bucket admin, deploy)
 *      Retained unverified; `{ json }` request envelope, `result.data.json`
 *      response envelope. Tests here pin the CURRENT behaviour so a future
 *      correction to this surface is a deliberate, visible change.
 *
 * NB: an earlier revision of this file asserted the tRPC shape for email + AI.
 * Those assertions were left behind when the REST rewrite landed, so the suite
 * was red and proved nothing about either transport.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { vapron, isVapronConfigured, VapronError } from "../src/lib/vapron.js";

const realFetch = globalThis.fetch;

/** Wrap a payload in the tRPC/superjson success envelope. */
function trpcOk(data: unknown): unknown {
  return { result: { data: { json: data } } };
}

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(body === undefined ? "" : JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  ) as unknown as typeof fetch;
}

function callsOf(f: typeof fetch): [string, RequestInit][] {
  return (f as unknown as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][];
}

beforeEach(() => {
  process.env["VAPRON_API_KEY"] = "vpk_test_key";
  process.env["VAPRON_BASE_URL"] = "https://api.vapron.ai/api/trpc";
  // Deliberately NOT setting VAPRON_PLATFORM_BASE_URL — the REST tests below
  // assert the built-in default, which is the documented production base URL.
  delete process.env["VAPRON_PLATFORM_BASE_URL"];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env["VAPRON_API_KEY"];
  delete process.env["VAPRON_BASE_URL"];
  delete process.env["VAPRON_PLATFORM_BASE_URL"];
});

describe("vapron client — configuration", () => {
  it("reports configuration state from the env", () => {
    expect(isVapronConfigured()).toBe(true);
    delete process.env["VAPRON_API_KEY"];
    expect(isVapronConfigured()).toBe(false);
  });

  it("throws not_configured without hitting the network when the key is missing", async () => {
    delete process.env["VAPRON_API_KEY"];
    const fetchMock = mockFetch(200, {});
    globalThis.fetch = fetchMock;

    await expect(vapron.email.send({ to: "a@b.com", subject: "x", html: "y" })).rejects.toMatchObject({
      name: "VapronError",
      code: "not_configured",
    });
    expect(callsOf(fetchMock).length).toBe(0);
  });
});

describe("vapron client — REST platform surface (email / AI / storage)", () => {
  it("sends email as plain JSON to the documented REST endpoint", async () => {
    const fetchMock = mockFetch(200, { id: "msg_123" });
    globalThis.fetch = fetchMock;

    const result = await vapron.email.send({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });

    expect(result.id).toBe("msg_123");

    const [url, init] = callsOf(fetchMock)[0]!;
    expect(url).toBe("https://vapron.ai/api/platform/email/send");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer vpk_test_key");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    // Plain JSON body — no { json } envelope.
    expect(JSON.parse(init.body as string)).toEqual({
      to: "a@b.com",
      subject: "Hi",
      html: "<p>Hi</p>",
    });
  });

  it("surfaces a REST error body as a typed VapronError carrying the HTTP status", async () => {
    globalThis.fetch = mockFetch(401, { error: "Invalid API key" });

    await expect(
      vapron.email.send({ to: "a@b.com", subject: "x", html: "y" }),
    ).rejects.toMatchObject({
      name: "VapronError",
      code: "vapron_error",
      status: 401,
      message: "Invalid API key",
    });
  });

  it("surfaces a nested { error: { message } } REST error body", async () => {
    globalThis.fetch = mockFetch(422, { error: { message: "recipient rejected" } });

    await expect(
      vapron.email.send({ to: "bad", subject: "x", html: "y" }),
    ).rejects.toMatchObject({ name: "VapronError", status: 422, message: "recipient rejected" });
  });

  it("falls back to a status-based message when the error body has no message", async () => {
    globalThis.fetch = mockFetch(500, {});

    await expect(
      vapron.email.send({ to: "a@b.com", subject: "x", html: "y" }),
    ).rejects.toMatchObject({
      name: "VapronError",
      status: 500,
      message: "Vapron request failed with status 500",
    });
  });

  it("calls the REST AI gateway and extracts Anthropic-style content", async () => {
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

    const [url, init] = callsOf(fetchMock)[0]!;
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

  it("extracts text from a plain-string payload field", async () => {
    globalThis.fetch = mockFetch(200, { text: "plain field" });

    const result = await vapron.ai.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("plain field");
  });

  it("returns empty text (never throws) for an unrecognised gateway shape, exposing raw", async () => {
    // The gateway's exact response shape is undocumented, so the schema is
    // deliberately permissive. Callers (lib/ai.ts::callVapron) are responsible
    // for treating empty text as a provider failure — asserted in ai.test.ts.
    globalThis.fetch = mockFetch(200, { unexpected: { nested: "shape" } });

    const result = await vapron.ai.complete({ messages: [{ role: "user", content: "hello" }] });
    expect(result.text).toBe("");
    expect(result.raw).toEqual({ unexpected: { nested: "shape" } });
  });

  it("requests a presigned upload URL over REST", async () => {
    const fetchMock = mockFetch(200, { uploadUrl: "https://storage.example/put?sig=abc" });
    globalThis.fetch = fetchMock;

    const result = await vapron.storage.getUploadUrl({
      bucket: "alecrae-files",
      path: "acct/file.pdf",
      contentType: "application/pdf",
    });

    expect(result.uploadUrl).toBe("https://storage.example/put?sig=abc");
    const [url, init] = callsOf(fetchMock)[0]!;
    expect(url).toBe("https://vapron.ai/api/platform/storage/upload-url");
    expect(JSON.parse(init.body as string)).toEqual({
      bucket: "alecrae-files",
      path: "acct/file.pdf",
      contentType: "application/pdf",
    });
  });

  it("rejects a REST response that does not match the declared schema", async () => {
    globalThis.fetch = mockFetch(200, { notAnUploadUrl: true });

    await expect(
      vapron.storage.getUploadUrl({ bucket: "b", path: "p", contentType: "text/plain" }),
    ).rejects.toMatchObject({ name: "VapronError", code: "invalid_response" });
  });

  it("wraps a network-level failure without leaking the API key", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const err = await vapron.email
      .send({ to: "a@b.com", subject: "x", html: "y" })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(VapronError);
    expect((err as VapronError).code).toBe("network_error");
    expect((err as VapronError).message).not.toContain("vpk_test_key");
  });
});

describe("vapron client — tRPC surface (DNS / bucket admin)", () => {
  it("sends a { json } envelope to the tRPC base URL and unwraps result.data.json", async () => {
    const fetchMock = mockFetch(200, trpcOk({ id: "rec_1", name: "mx1", type: "A", content: "1.2.3.4" }));
    globalThis.fetch = fetchMock;

    await vapron.dns.createRecord({
      zoneId: "z1",
      name: "mx1",
      type: "A",
      content: "1.2.3.4",
    });

    const [url, init] = callsOf(fetchMock)[0]!;
    expect(url).toBe("https://api.vapron.ai/api/trpc/dns.records.create");
    expect(JSON.parse(init.body as string)).toEqual({
      json: { zoneId: "z1", name: "mx1", type: "A", content: "1.2.3.4" },
    });
  });

  it("encodes GET query input as ?input=<urlencoded {json}>", async () => {
    const fetchMock = mockFetch(200, trpcOk({ zone: { id: "z1", name: "alecrae.com" }, records: [] }));
    globalThis.fetch = fetchMock;

    await vapron.dns.getZone("z1");

    const [url] = callsOf(fetchMock)[0]!;
    expect(url).toBe(
      `https://api.vapron.ai/api/trpc/dns.myZones.get?input=${encodeURIComponent(
        JSON.stringify({ json: { zoneId: "z1" } }),
      )}`,
    );
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
});
