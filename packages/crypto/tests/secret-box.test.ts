/**
 * Secrets at rest (issue #160 — DKIM private keys; issue #80 — OAuth tokens).
 *
 * The load-bearing behaviours are the two that decide whether an existing
 * deployment keeps working: legacy plaintext must pass through untouched
 * (there is no data migration), and a value that IS sealed but cannot be
 * opened must fail loudly rather than being handed back as if it were
 * plaintext.
 */
import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import {
  sealSecret,
  sealSecretOrNull,
  openSecret,
  openSecretOrNull,
  openSecretSafe,
  isSealed,
} from "../src/secret-box.js";

const ORIGINAL_SECRET = process.env["JWT_SECRET"];
const TEST_SECRET = "test-jwt-secret-that-is-long-enough-to-pass-32";

const SAMPLE_PEM =
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcw\n-----END PRIVATE KEY-----";

beforeEach(() => {
  process.env["JWT_SECRET"] = TEST_SECRET;
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env["JWT_SECRET"];
  else process.env["JWT_SECRET"] = ORIGINAL_SECRET;
});

describe("sealSecret / openSecret", () => {
  it("round-trips a DKIM private key exactly, including newlines", () => {
    const sealed = sealSecret(SAMPLE_PEM);
    expect(sealed).not.toContain("BEGIN PRIVATE KEY");
    expect(openSecret(sealed)).toBe(SAMPLE_PEM);
  });

  it("produces a different ciphertext each time (fresh IV)", () => {
    expect(sealSecret(SAMPLE_PEM)).not.toBe(sealSecret(SAMPLE_PEM));
  });

  it("passes a legacy plaintext row through unchanged", () => {
    // No data migration exists — rows written before #160 hold a raw PEM and
    // must keep signing mail. This is the compatibility contract.
    expect(openSecret(SAMPLE_PEM)).toBe(SAMPLE_PEM);
    expect(isSealed(SAMPLE_PEM)).toBe(false);
  });

  it("does not mistake arbitrary JSON for a sealed envelope", () => {
    const notOurs = '{"some":"other json"}';
    expect(isSealed(notOurs)).toBe(false);
    expect(openSecret(notOurs)).toBe(notOurs);
  });

  it("throws when a sealed value cannot be opened, rather than returning the envelope", () => {
    const sealed = sealSecret(SAMPLE_PEM);
    process.env["JWT_SECRET"] = "a-completely-different-secret-key-32chars";
    // Silently returning the JSON blob would hand the signer a fake "key" and
    // produce a confusing downstream failure instead of the real one.
    expect(() => openSecret(sealed)).toThrow();
  });

  it("refuses to seal when JWT_SECRET is absent or too short", () => {
    delete process.env["JWT_SECRET"];
    expect(() => sealSecret(SAMPLE_PEM)).toThrow(/JWT_SECRET/);
    process.env["JWT_SECRET"] = "too-short";
    expect(() => sealSecret(SAMPLE_PEM)).toThrow(/JWT_SECRET/);
  });
});

describe("openSecretSafe — the MTA signing path", () => {
  it("returns the key on the happy path", () => {
    expect(openSecretSafe(sealSecret(SAMPLE_PEM))).toBe(SAMPLE_PEM);
  });

  it("returns null instead of throwing when the key cannot be decrypted", () => {
    const sealed = sealSecret(SAMPLE_PEM);
    process.env["JWT_SECRET"] = "a-completely-different-secret-key-32chars";
    // A key we cannot open is a key we do not have: the worker's issue-#144
    // branch then HOLDS the message rather than sending it unsigned or
    // failing the job into the DLQ.
    expect(openSecretSafe(sealed)).toBeNull();
  });

  it("treats null, undefined and empty as no key", () => {
    expect(openSecretSafe(null)).toBeNull();
    expect(openSecretSafe(undefined)).toBeNull();
    expect(openSecretSafe("")).toBeNull();
  });
});

describe("optional-column helpers", () => {
  it("leaves null and empty alone in both directions", () => {
    expect(sealSecretOrNull(null)).toBeNull();
    expect(sealSecretOrNull("")).toBeNull();
    expect(openSecretOrNull(null)).toBeNull();
    expect(openSecretOrNull(undefined)).toBeNull();
  });

  it("round-trips a real value", () => {
    const sealed = sealSecretOrNull("ya29.a0AfB_oauth_token");
    expect(sealed).not.toBeNull();
    expect(openSecretOrNull(sealed)).toBe("ya29.a0AfB_oauth_token");
  });
});
