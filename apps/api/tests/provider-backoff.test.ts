/**
 * Tests for provider rate-limit backoff (Known Issue #111, first half).
 *
 * Gmail/Outlook sync had no 429 handling at all: a rate-limit response was
 * treated as an ordinary failure and the sweep retried the same account a few
 * minutes later, indefinitely, for every affected account at once. The
 * consequence is not per-account — sustained disregard for 429 and
 * `Retry-After` gets throttling applied to the OAuth *client*, which breaks
 * Gmail for every customer simultaneously. On that path our exposure is the
 * app registration, not an IP.
 *
 * Covered here: both `Retry-After` encodings, the clamping that keeps a bogus
 * value from either hammering or disabling sync for days, and the
 * record/observe round trip.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  parseRetryAfter,
  clampBackoffSeconds,
  recordProviderRateLimit,
  getProviderBackoffUntil,
  resetProviderBackoffForTests,
} from "../src/lib/provider-backoff.js";

const ACCOUNT = "ca_01HZY8QK3M4N5P6R7S8T9V0W1X";
const OTHER_ACCOUNT = "ca_01HZY8QK3M4N5P6R7S8T9V0W2Y";
const NOW = Date.parse("2026-03-02T09:00:00.000Z");

beforeEach(() => {
  delete process.env["REDIS_URL"];
  resetProviderBackoffForTests();
});

describe("parseRetryAfter", () => {
  it("reads the delta-seconds form", () => {
    expect(parseRetryAfter("120", NOW)).toBe(120);
    expect(parseRetryAfter("  45  ", NOW)).toBe(45);
  });

  it("reads the HTTP-date form", () => {
    // Both encodings are legal per RFC 9110; a parser that handles only one
    // silently falls back to a default on the other.
    const future = new Date(NOW + 300_000).toUTCString();
    expect(parseRetryAfter(future, NOW)).toBe(300);
  });

  it("never returns a negative wait for a date already past", () => {
    const past = new Date(NOW - 600_000).toUTCString();
    expect(parseRetryAfter(past, NOW)).toBe(0);
  });

  it("returns null when absent or unparseable", () => {
    expect(parseRetryAfter(null, NOW)).toBeNull();
    expect(parseRetryAfter(undefined, NOW)).toBeNull();
    expect(parseRetryAfter("", NOW)).toBeNull();
    expect(parseRetryAfter("soon-ish", NOW)).toBeNull();
  });
});

describe("clampBackoffSeconds", () => {
  it("applies a default when the provider gave no usable value", () => {
    expect(clampBackoffSeconds(null)).toBe(15 * 60);
  });

  it("enforces a floor so we cannot be talked into hammering", () => {
    // A `Retry-After: 0` must not mean "retry immediately, forever".
    expect(clampBackoffSeconds(0)).toBe(60);
    expect(clampBackoffSeconds(5)).toBe(60);
  });

  it("enforces a ceiling so a bogus value cannot disable sync for days", () => {
    expect(clampBackoffSeconds(86_400 * 7)).toBe(60 * 60);
  });

  it("honours a sensible value unchanged", () => {
    expect(clampBackoffSeconds(300)).toBe(300);
  });
});

describe("record and observe", () => {
  it("pauses the account for the requested window", async () => {
    const seconds = await recordProviderRateLimit(ACCOUNT, "600", NOW);
    expect(seconds).toBe(600);

    const until = await getProviderBackoffUntil(ACCOUNT, NOW);
    expect(until).toBe(NOW + 600_000);
  });

  it("reports clear once the window has passed", async () => {
    await recordProviderRateLimit(ACCOUNT, "600", NOW);
    expect(await getProviderBackoffUntil(ACCOUNT, NOW + 601_000)).toBeNull();
  });

  it("pauses only the account that was rate-limited", async () => {
    await recordProviderRateLimit(ACCOUNT, "600", NOW);
    expect(await getProviderBackoffUntil(OTHER_ACCOUNT, NOW)).toBeNull();
  });

  it("falls back to the default window when no header was sent", async () => {
    const seconds = await recordProviderRateLimit(ACCOUNT, null, NOW);
    expect(seconds).toBe(15 * 60);
    expect(await getProviderBackoffUntil(ACCOUNT, NOW)).toBe(NOW + 15 * 60 * 1000);
  });

  it("treats an account with no recorded limit as clear to sync", async () => {
    expect(await getProviderBackoffUntil(ACCOUNT, NOW)).toBeNull();
  });
});
