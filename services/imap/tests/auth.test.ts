/**
 * IMAP Auth Handler — Smoke Tests
 *
 * Exercises the credential-verification primitives that sit between the
 * IMAP session loop and the shared user store. These do NOT require a
 * database: we test the pure crypto helpers and the in-memory rate limiter.
 *
 * The hashPassword algorithm MUST stay in sync with apps/api/src/routes/auth.ts
 * (SHA-256 hex). If that contract breaks, IMAP clients will stop accepting
 * credentials that work on the web — these tests are the tripwire.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  hashPassword,
  constantTimeEqual,
  isRateLimited,
  recordFailedAttempt,
  clearRateLimit,
} from "../src/handlers/auth-crypto.js";

// ─── hashPassword ───────────────────────────────────────────────────────────

describe("hashPassword", () => {
  it("produces deterministic SHA-256 hex for a known input", async () => {
    // Locked vector: SHA-256("hello") in lower-case hex.
    const hash = await hashPassword("hello");
    expect(hash).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("produces the same hash for the same password every call", async () => {
    const a = await hashPassword("correct horse battery staple");
    const b = await hashPassword("correct horse battery staple");
    expect(a).toBe(b);
  });

  it("produces different hashes for different passwords", async () => {
    const a = await hashPassword("password1");
    const b = await hashPassword("password2");
    expect(a).not.toBe(b);
  });

  it("handles unicode passwords without throwing", async () => {
    const hash = await hashPassword("пароль-日本語-🔐");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("always returns 64 hex characters (SHA-256 width)", async () => {
    const hash = await hashPassword("");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ─── constantTimeEqual ──────────────────────────────────────────────────────

describe("constantTimeEqual", () => {
  it("returns true for identical hashes", () => {
    const a = "a".repeat(64);
    expect(constantTimeEqual(a, a)).toBe(true);
  });

  it("returns false for different hashes of equal length", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("returns false when lengths differ", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false for a single-character difference", () => {
    const a = "a".repeat(64);
    const b = "a".repeat(63) + "b";
    expect(constantTimeEqual(a, b)).toBe(false);
  });

  it("treats empty strings as equal", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });
});

// ─── Rate limiter ───────────────────────────────────────────────────────────

describe("rate limiter", () => {
  // Use a fresh IP per test to avoid cross-test pollution from the
  // module-level attempts Map.
  let ip: string;

  beforeEach(() => {
    ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
    clearRateLimit(ip);
  });

  it("is NOT rate-limited for a brand new address", () => {
    expect(isRateLimited(ip)).toBe(false);
  });

  it("is NOT rate-limited after a small number of failures", () => {
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    recordFailedAttempt(ip);
    expect(isRateLimited(ip)).toBe(false);
  });

  it("becomes rate-limited after 5 failed attempts", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
    expect(isRateLimited(ip)).toBe(true);
  });

  it("stays rate-limited after further failures", () => {
    for (let i = 0; i < 8; i++) recordFailedAttempt(ip);
    expect(isRateLimited(ip)).toBe(true);
  });

  it("clearRateLimit() resets the counter immediately", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
    expect(isRateLimited(ip)).toBe(true);
    clearRateLimit(ip);
    expect(isRateLimited(ip)).toBe(false);
  });

  it("tracks different IP addresses independently", () => {
    const other = "10.0.99.99";
    clearRateLimit(other);
    for (let i = 0; i < 5; i++) recordFailedAttempt(ip);
    expect(isRateLimited(ip)).toBe(true);
    expect(isRateLimited(other)).toBe(false);
  });
});

// ─── Web ↔ IMAP compatibility ───────────────────────────────────────────────

/**
 * Re-implements apps/api/src/routes/auth.ts::hashPassword verbatim.
 * If this test ever diverges from the production web auth code, IMAP login
 * will silently stop accepting credentials that work on the web. This test
 * is the tripwire.
 */
async function webHashPasswordReference(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("web ↔ IMAP hash compatibility", () => {
  it("IMAP hashPassword matches the web reference for ASCII", async () => {
    const web = await webHashPasswordReference("secret-password-123");
    const imap = await hashPassword("secret-password-123");
    expect(imap).toBe(web);
  });

  it("IMAP hashPassword matches the web reference for unicode", async () => {
    const web = await webHashPasswordReference("密码-🔐-пароль");
    const imap = await hashPassword("密码-🔐-пароль");
    expect(imap).toBe(web);
  });

  it("constantTimeEqual accepts identical web-produced hashes", async () => {
    const web = await webHashPasswordReference("another-secret");
    const imap = await hashPassword("another-secret");
    expect(constantTimeEqual(web, imap)).toBe(true);
  });
});
