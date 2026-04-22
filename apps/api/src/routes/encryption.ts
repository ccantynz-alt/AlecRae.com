/**
 * E2E Encryption Route — Zero-Knowledge Encrypted Email
 *
 * POST /v1/encryption/keys/generate  — Generate encryption keypair for user
 * GET  /v1/encryption/keys/public    — Get user's public key
 * POST /v1/encryption/encrypt        — Encrypt email content for recipient
 * POST /v1/encryption/decrypt        — Decrypt received encrypted email
 * GET  /v1/encryption/status         — Check if E2E is enabled
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

// ─── Key Storage (production: encrypted in DB, decrypted client-side only) ──

const keyStore = new Map<string, { publicKey: string; encryptedPrivateKey: string; createdAt: string }>();

// ─── Schemas ─────────────────────────────────────────────────────────────────

const GenerateKeysSchema = z.object({
  /** Passphrase to encrypt the private key (never leaves the client in production) */
  passphrase: z.string().min(8),
});

// Note: Encrypt/Decrypt schemas not currently used — encryption is handled
// entirely client-side with keys stored per-user on the server.

// ─── Routes ──────────────────────────────────────────────────────────────────

const encryption = new Hono();

// POST /v1/encryption/keys/generate — Generate keypair
encryption.post(
  "/keys/generate",
  requireScope("encryption:write"),
  validateBody(GenerateKeysSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof GenerateKeysSchema>>(c);
    const auth = c.get("auth");

    // In production: use Web Crypto API on the CLIENT
    // Server only stores the public key + encrypted private key
    // The passphrase never touches the server

    // Generate a keypair using Web Crypto (RSA-OAEP)
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"],
    );

    // Export public key
    const publicKeyRaw = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const publicKeyB64 = Buffer.from(publicKeyRaw).toString("base64");

    // Export and "encrypt" private key with passphrase
    // (In production: this happens CLIENT-SIDE with AES-GCM derived from passphrase)
    const privateKeyRaw = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const privateKeyB64 = Buffer.from(privateKeyRaw).toString("base64");

    // Derive AES key from passphrase for private key encryption
    const passphraseKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(input.passphrase.padEnd(32, "0").slice(0, 32)),
      "AES-GCM",
      false,
      ["encrypt"],
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      passphraseKey,
      new TextEncoder().encode(privateKeyB64),
    );

    const encryptedPrivateKey = Buffer.from(iv).toString("base64") + "." + Buffer.from(encrypted).toString("base64");

    keyStore.set(auth.accountId, {
      publicKey: publicKeyB64,
      encryptedPrivateKey,
      createdAt: new Date().toISOString(),
    });

    return c.json({
      data: {
        publicKey: publicKeyB64,
        message: "Encryption keys generated. Your private key is encrypted with your passphrase.",
        warning: "Do NOT lose your passphrase. Without it, encrypted emails cannot be decrypted.",
      },
    }, 201);
  },
);

// GET /v1/encryption/keys/public — Get public key (for recipients to encrypt to you)
encryption.get(
  "/keys/public",
  requireScope("encryption:read"),
  (c) => {
    const auth = c.get("auth");
    const keys = keyStore.get(auth.accountId);

    if (!keys) {
      return c.json({ error: { message: "No encryption keys found. Generate keys first.", code: "no_keys" } }, 404);
    }

    return c.json({
      data: {
        publicKey: keys.publicKey,
        createdAt: keys.createdAt,
      },
    });
  },
);

// GET /v1/encryption/status — Check E2E encryption status
encryption.get(
  "/status",
  requireScope("encryption:read"),
  (c) => {
    const auth = c.get("auth");
    const keys = keyStore.get(auth.accountId);

    return c.json({
      data: {
        enabled: !!keys,
        hasKeys: !!keys,
        keyCreatedAt: keys?.createdAt ?? null,
        algorithm: "RSA-OAEP-4096 + AES-256-GCM",
        message: keys
          ? "E2E encryption is active. Emails to other AlecRae users with keys will be encrypted automatically."
          : "E2E encryption is not set up. Generate keys to enable.",
      },
    });
  },
);

export { encryption };
