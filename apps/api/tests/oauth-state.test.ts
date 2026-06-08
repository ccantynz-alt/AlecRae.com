/**
 * Tests for OAuth state signing (Fix S2 — account-linking CSRF)
 *
 * Verifies:
 *  1. Round-trip sign/verify passes and preserves the payload
 *  2. Tampered token (mutated payload segment) is rejected
 *  3. Expired token is rejected
 *  4. Forged HMAC (random signature) is rejected
 */

import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { signState, verifyState } from "../src/lib/oauth-state.js";

beforeAll(() => {
  // Deterministic, sufficiently-long secret for HMAC.
  process.env["JWT_SECRET"] = "test_secret_at_least_thirty_two_chars_long_xx";
  process.env["NODE_ENV"] = "test";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("oauth-state", () => {
  it("round-trips a valid state token", async () => {
    const token = await signState({ userId: "acct_123", provider: "gmail" });
    const result = await verifyState(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.userId).toBe("acct_123");
      expect(result.payload.provider).toBe("gmail");
    }
  });

  it("rejects a tampered payload segment", async () => {
    const token = await signState({ userId: "acct_123", provider: "gmail" });
    const [payloadSegment, signatureSegment] = token.split(".");

    // Forge a new payload (different userId) while keeping the old signature.
    const forgedPayload = Buffer.from(
      JSON.stringify({
        userId: "attacker",
        provider: "gmail",
        iat: Date.now(),
        exp: Date.now() + 600000,
        nonce: "deadbeef",
      }),
    ).toString("base64url");

    const tampered = `${forgedPayload}.${signatureSegment}`;
    expect(payloadSegment).not.toBe(forgedPayload);

    const result = await verifyState(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("tampered");
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    const token = await signState({ userId: "acct_123", provider: "outlook" });

    // Advance past the 10-minute TTL.
    vi.setSystemTime(new Date("2026-01-01T00:11:00Z"));

    const result = await verifyState(token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("expired");
  });

  it("rejects a forged HMAC signature", async () => {
    const token = await signState({ userId: "acct_123", provider: "gmail" });
    const [payloadSegment] = token.split(".");

    const forgedSig = Buffer.from(new Uint8Array(32).fill(7)).toString("base64url");
    const forged = `${payloadSegment}.${forgedSig}`;

    const result = await verifyState(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("tampered");
  });

  it("rejects a malformed token", async () => {
    const result = await verifyState("not-a-valid-token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed");
  });
});
