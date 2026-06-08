/**
 * Tests for aiComplete — Claude primary, Vapron fallback.
 *
 * Verifies:
 *  1. Claude success returns { provider: "claude" }
 *  2. Claude failure falls back to Vapron when Vapron is configured
 *  3. Neither provider configured throws AiError("no_provider")
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { aiComplete } from "../src/lib/ai.js";

const realFetch = globalThis.fetch;

function claudeResponse(text: string): Response {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
}

function vapronResponse(text: string): Response {
  return new Response(
    JSON.stringify({ id: "cmpl_1", choices: [{ index: 0, message: { role: "assistant", content: text } }] }),
    { status: 200 },
  );
}

beforeEach(() => {
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["VAPRON_API_KEY"];
});

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
  delete process.env["ANTHROPIC_API_KEY"];
  delete process.env["VAPRON_API_KEY"];
});

describe("aiComplete", () => {
  it("uses Claude when ANTHROPIC_API_KEY is set", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain("api.anthropic.com");
      return claudeResponse("from claude");
    }) as unknown as typeof fetch;

    const result = await aiComplete({ messages: [{ role: "user", content: "hi" }] });
    expect(result).toEqual({ text: "from claude", provider: "claude" });
  });

  it("falls back to Vapron when Claude errors", async () => {
    process.env["ANTHROPIC_API_KEY"] = "sk-ant-test";
    process.env["VAPRON_API_KEY"] = "vpk_test";
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("api.anthropic.com")) return new Response("upstream", { status: 503 });
      expect(String(url)).toContain("api.vapron.ai");
      return vapronResponse("from vapron");
    }) as unknown as typeof fetch;

    const result = await aiComplete({
      system: "be terse",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result).toEqual({ text: "from vapron", provider: "vapron" });
  });

  it("throws no_provider when neither is configured", async () => {
    await expect(aiComplete({ messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      name: "AiError",
      code: "no_provider",
    });
  });
});
