import { describe, it, expect } from "bun:test";
import {
  hash,
  sha256,
  sha512,
  hmac,
  hmacRaw,
  constantTimeEqual,
  hashPassword,
  verifyPassword,
  generateToken,
} from "../src/hashing.js";

describe("hash", () => {
  it("should produce a hex-encoded SHA-256 digest by default", () => {
    const result = hash("hello");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should produce a consistent digest for the same input", () => {
    expect(hash("test")).toBe(hash("test"));
  });

  it("should produce different digests for different inputs", () => {
    expect(hash("a")).not.toBe(hash("b"));
  });

  it("should support SHA-512 algorithm", () => {
    const result = hash("hello", "sha512");
    expect(result).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("sha256", () => {
  it("should return a 32-byte Buffer", () => {
    const result = sha256("hello");
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(32);
  });

  it("should be consistent across calls", () => {
    expect(sha256("test").equals(sha256("test"))).toBe(true);
  });
});

describe("sha512", () => {
  it("should return a 64-byte Buffer", () => {
    const result = sha512("hello");
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(64);
  });
});

describe("hmac", () => {
  it("should produce a hex-encoded HMAC-SHA256 by default", () => {
    const result = hmac("data", "secret");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should produce different results for different keys", () => {
    expect(hmac("data", "key1")).not.toBe(hmac("data", "key2"));
  });

  it("should produce different results for different data", () => {
    expect(hmac("data1", "key")).not.toBe(hmac("data2", "key"));
  });
});

describe("hmacRaw", () => {
  it("should return a Buffer of the raw HMAC digest", () => {
    const result = hmacRaw("data", "secret");
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(32);
  });
});

describe("constantTimeEqual", () => {
  it("should return true for identical strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });

  it("should return false for different strings", () => {
    expect(constantTimeEqual("abc", "xyz")).toBe(false);
  });

  it("should return false for strings of different lengths", () => {
    expect(constantTimeEqual("short", "longer string")).toBe(false);
  });

  it("should work with Buffers", () => {
    const a = Buffer.from("test");
    const b = Buffer.from("test");
    expect(constantTimeEqual(a, b)).toBe(true);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("should hash and verify a password successfully", async () => {
    const hashResult = await hashPassword("my-secret-password");
    expect(hashResult.ok).toBe(true);
    if (!hashResult.ok) return;

    const verifyResult = await verifyPassword("my-secret-password", hashResult.value);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) expect(verifyResult.value).toBe(true);
  });

  it("should reject an incorrect password", async () => {
    const hashResult = await hashPassword("correct-password");
    expect(hashResult.ok).toBe(true);
    if (!hashResult.ok) return;

    const verifyResult = await verifyPassword("wrong-password", hashResult.value);
    expect(verifyResult.ok).toBe(true);
    if (verifyResult.ok) expect(verifyResult.value).toBe(false);
  });

  it("should produce different hashes for the same password (unique salts)", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1.ok && h2.ok).toBe(true);
    if (h1.ok && h2.ok) {
      expect(h1.value.hash).not.toBe(h2.value.hash);
    }
  });
});

describe("generateToken", () => {
  it("should return a hex string of 64 characters by default (32 bytes)", () => {
    const token = generateToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("should return the correct length for custom byte count", () => {
    const token = generateToken(16);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("should produce unique tokens on each call", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
  });
});
