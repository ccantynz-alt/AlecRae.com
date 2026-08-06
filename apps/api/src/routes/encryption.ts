/**
 * E2E Encryption Route — public-key registration
 *
 * POST /v1/encryption/keys/generate  — Register the CLIENT's public key
 * GET  /v1/encryption/keys/public    — Get a user's public key
 * GET  /v1/encryption/status         — Whether a public key is registered
 *
 * WHAT THIS DOES AND DOES NOT DO (read before touching the UI copy)
 * -----------------------------------------------------------------
 * This endpoint registers a public key. **No email is encrypted anywhere in
 * this product.** There is no encryption step in the send path
 * (routes/messages.ts encrypts OAuth tokens and nothing else) and no
 * decryption step on read. Key registration is a prerequisite for E2EE, not
 * E2EE. The settings page previously claimed mail was "encrypted
 * automatically"; it was not, and that copy has been corrected.
 *
 * WHAT WAS WRONG (Known Issue #77(d), worse than recorded)
 * --------------------------------------------------------
 * `/keys/generate` used to generate the keypair ON THE SERVER:
 *
 *   1. The server minted an RSA keypair and stored ITS public key. The client
 *      independently generated its own keypair and kept that private key in
 *      IndexedDB — so the registered public key and the user's private key
 *      were from two unrelated pairs. Anything encrypted to the stored public
 *      key could NEVER have been decrypted by the user. The feature could not
 *      have worked even once.
 *   2. A private key therefore existed in server memory, which defeats the
 *      zero-knowledge claim by itself.
 *   3. The private key was wrapped with `passphrase.padEnd(32,"0").slice(0,32)`
 *      used directly as raw AES key material — no KDF, no salt. A passphrase
 *      of "hunter2" produced the key "hunter2" plus 25 zero bytes.
 *   4. The passphrase was accepted as a request field, while the comment
 *      beside it read "the passphrase never touches the server". The web
 *      client was already sending a throwaway value purely to satisfy the
 *      schema, which is how obviously vestigial it had become.
 *
 * The server now stores only a public key that the client supplies, and never
 * sees a private key or a passphrase — the property the module always claimed.
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

/** Rough bounds for a base64 SPKI-encoded RSA-4096 public key (~736 chars). */
const MIN_PUBLIC_KEY_LEN = 300;
const MAX_PUBLIC_KEY_LEN = 4096;

const RegisterKeySchema = z.object({
  /**
   * The CLIENT's base64 SPKI public key. The matching private key must never
   * be sent — see the module header for what happened when the server made
   * its own pair instead.
   */
  publicKey: z
    .string()
    .min(MIN_PUBLIC_KEY_LEN)
    .max(MAX_PUBLIC_KEY_LEN)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/, "publicKey must be base64-encoded SPKI"),
  /**
   * Optional client-side-encrypted private key blob, for restoring access on
   * another device. The server stores it opaquely and cannot decrypt it: the
   * wrapping key is derived on the client and never transmitted. Omit it and
   * the key is single-device only.
   */
  encryptedPrivateKey: z.string().max(16_384).optional(),
});

// Note: Encrypt/Decrypt schemas not currently used — encryption is handled
// entirely client-side with keys stored per-user on the server.

// ─── Routes ──────────────────────────────────────────────────────────────────

const encryption = new Hono();

// POST /v1/encryption/keys/generate — Register the client's public key.
//
// Kept at this path so existing clients keep working; the behaviour is now
// registration, not generation. The server does no key generation at all.
encryption.post(
  "/keys/generate",
  requireScope("encryption:write"),
  validateBody(RegisterKeySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RegisterKeySchema>>(c);
    const auth = c.get("auth");

    // Upsert: exactly one registered key per account (re-registering replaces).
    const db = getDatabase();
    const now = new Date();
    await db
      .insert(encryptionKeys)
      .values({
        id: generateId(),
        accountId: auth.accountId,
        publicKey: input.publicKey,
        // Opaque to us. Empty string when the client keeps its private key
        // on-device only, which is the default.
        encryptedPrivateKey: input.encryptedPrivateKey ?? "",
        algorithm: ENCRYPTION_ALGORITHM,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: encryptionKeys.accountId,
        set: {
          publicKey: input.publicKey,
          encryptedPrivateKey: input.encryptedPrivateKey ?? "",
          algorithm: ENCRYPTION_ALGORITHM,
          updatedAt: now,
        },
      });

    return c.json(
      {
        data: {
          publicKey: input.publicKey,
          message:
            "Public key registered. Your private key stays on your device — it is never sent to us.",
          // Stated on the endpoint itself so no future UI can imply otherwise
          // without contradicting the API it is calling.
          messageEncryptionActive: false,
          notice:
            "Registering a key does not encrypt your mail. Message encryption is not implemented yet — there is no encryption step in the send path.",
        },
      },
      201,
    );
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
