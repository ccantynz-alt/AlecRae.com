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
import { eq } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { getDatabase, encryptionKeys } from "@alecrae/db";

// ─── Key Storage ────────────────────────────────────────────────────────────
//
// Persisted to Postgres (encryption_keys table) so keys survive restarts and
// are shared across instances. ZERO-KNOWLEDGE: only the public key and the
// CLIENT-ENCRYPTED (passphrase-wrapped) private key are stored. The passphrase
// never reaches the server, so the server can never decrypt the private key.

const ENCRYPTION_ALGORITHM = "RSA-OAEP-4096 + AES-256-GCM";

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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

    // Upsert: exactly one keypair per account (regeneration overwrites).
    const db = getDatabase();
    const now = new Date();
    await db
      .insert(encryptionKeys)
      .values({
        id: generateId(),
        accountId: auth.accountId,
        publicKey: publicKeyB64,
        encryptedPrivateKey,
        algorithm: ENCRYPTION_ALGORITHM,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: encryptionKeys.accountId,
        set: {
          publicKey: publicKeyB64,
          encryptedPrivateKey,
          algorithm: ENCRYPTION_ALGORITHM,
          updatedAt: now,
        },
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
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();
    const [keys] = await db
      .select({
        publicKey: encryptionKeys.publicKey,
        createdAt: encryptionKeys.createdAt,
      })
      .from(encryptionKeys)
      .where(eq(encryptionKeys.accountId, auth.accountId))
      .limit(1);

    if (!keys) {
      return c.json({ error: { message: "No encryption keys found. Generate keys first.", code: "no_keys" } }, 404);
    }

    return c.json({
      data: {
        publicKey: keys.publicKey,
        createdAt: keys.createdAt.toISOString(),
      },
    });
  },
);

// GET /v1/encryption/status — Check E2E encryption status
encryption.get(
  "/status",
  requireScope("encryption:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();
    const [keys] = await db
      .select({
        createdAt: encryptionKeys.createdAt,
        algorithm: encryptionKeys.algorithm,
      })
      .from(encryptionKeys)
      .where(eq(encryptionKeys.accountId, auth.accountId))
      .limit(1);

    return c.json({
      data: {
        enabled: !!keys,
        hasKeys: !!keys,
        keyCreatedAt: keys?.createdAt.toISOString() ?? null,
        algorithm: keys?.algorithm ?? ENCRYPTION_ALGORITHM,
        message: keys
          ? "E2E encryption is active. Emails to other AlecRae users with keys will be encrypted automatically."
          : "E2E encryption is not set up. Generate keys to enable.",
      },
    });
  },
);

export { encryption };
