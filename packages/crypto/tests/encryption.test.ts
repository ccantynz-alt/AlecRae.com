import { describe, it, expect } from "bun:test";
import {
  generateEncryptionKey,
  encryptContent,
  decryptContent,
  envelopeEncrypt,
} from "../src/encryption.js";

describe("generateEncryptionKey", () => {
  it("should return a key with a 32-byte Buffer", () => {
    const key = generateEncryptionKey();
    expect(key.key).toBeInstanceOf(Buffer);
    expect(key.key.length).toBe(32);
  });

  it("should return a hex keyId", () => {
    const key = generateEncryptionKey();
    expect(key.keyId).toMatch(/^[0-9a-f]{32}$/);
  });

  it("should include a createdAt timestamp", () => {
    const key = generateEncryptionKey();
    expect(key.createdAt).toBeInstanceOf(Date);
  });

  it("should generate unique keys on each call", () => {
    const k1 = generateEncryptionKey();
    const k2 = generateEncryptionKey();
    expect(k1.keyId).not.toBe(k2.keyId);
    expect(k1.key.equals(k2.key)).toBe(false);
  });
});

describe("encryptContent / decryptContent", () => {
  it("should encrypt and decrypt a plaintext roundtrip", () => {
    const key = generateEncryptionKey();
    const plaintext = Buffer.from("Hello, world!");

    const encrypted = encryptContent(plaintext, key.key);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = decryptContent(encrypted.value, key.key);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value.toString("utf8")).toBe("Hello, world!");
    }
  });

  it("should produce different ciphertexts for the same plaintext (random IV)", () => {
    const key = generateEncryptionKey();
    const plaintext = Buffer.from("same data");

    const e1 = encryptContent(plaintext, key.key);
    const e2 = encryptContent(plaintext, key.key);
    expect(e1.ok && e2.ok).toBe(true);
    if (e1.ok && e2.ok) {
      expect(e1.value.ciphertext).not.toBe(e2.value.ciphertext);
    }
  });

  it("should fail with a wrong key", () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    const plaintext = Buffer.from("secret");

    const encrypted = encryptContent(plaintext, key1.key);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = decryptContent(encrypted.value, key2.key);
    expect(decrypted.ok).toBe(false);
  });

  it("should reject a key of incorrect length", () => {
    const shortKey = Buffer.alloc(16);
    const plaintext = Buffer.from("data");
    const result = encryptContent(plaintext, shortKey);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Key must be exactly 32 bytes");
    }
  });

  it("should support additional authenticated data (AAD)", () => {
    const key = generateEncryptionKey();
    const plaintext = Buffer.from("sensitive");
    const aad = Buffer.from("context-id-123");

    const encrypted = encryptContent(plaintext, key.key, aad);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    // Decrypt with correct AAD
    const decrypted = decryptContent(encrypted.value, key.key, aad);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value.toString("utf8")).toBe("sensitive");
    }

    // Decrypt with wrong AAD should fail
    const wrongAad = Buffer.from("wrong-context");
    const badDecrypt = decryptContent(encrypted.value, key.key, wrongAad);
    expect(badDecrypt.ok).toBe(false);
  });

  it("should handle empty plaintext", () => {
    const key = generateEncryptionKey();
    const plaintext = Buffer.alloc(0);

    const encrypted = encryptContent(plaintext, key.key);
    expect(encrypted.ok).toBe(true);
    if (!encrypted.ok) return;

    const decrypted = decryptContent(encrypted.value, key.key);
    expect(decrypted.ok).toBe(true);
    if (decrypted.ok) {
      expect(decrypted.value.length).toBe(0);
    }
  });
});

describe("envelopeEncrypt", () => {
  it("should produce an S/MIME envelope", () => {
    const result = envelopeEncrypt("Hello body", {
      scheme: "smime",
      recipientKey: "FAKE_PUBLIC_KEY",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scheme).toBe("smime");
      expect(result.value.encryptedBody).toContain("-----BEGIN SMIME ENCRYPTED-----");
      expect(result.value.encryptedBody).toContain("-----END SMIME ENCRYPTED-----");
    }
  });

  it("should produce a PGP envelope", () => {
    const result = envelopeEncrypt("Hello body", {
      scheme: "pgp",
      recipientKey: "FAKE_PGP_KEY",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.scheme).toBe("pgp");
      expect(result.value.encryptedBody).toContain("-----BEGIN PGP MESSAGE-----");
      expect(result.value.encryptedBody).toContain("-----END PGP MESSAGE-----");
    }
  });

  it("should reject an empty recipient key", () => {
    const result = envelopeEncrypt("Hello", {
      scheme: "smime",
      recipientKey: "  ",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Recipient key must not be empty");
    }
  });
});
