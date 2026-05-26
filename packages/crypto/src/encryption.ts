/**
 * Content encryption (AES-256-GCM) and envelope encryption helpers
 * for S/MIME and PGP workflows.
 */
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

import { ok, err } from "@alecrae/shared";
import type { Result } from "@alecrae/shared";

import type {
  EncryptedPayload,
  EncryptionKey,
  EnvelopeEncryptOptions,
  EnvelopeEncryptedMessage,
} from "./types.js";

/** AES-256-GCM IV size in bytes. */
const IV_BYTES = 12;
/** AES-256-GCM auth tag length in bytes. */
const AUTH_TAG_BYTES = 16;
/** AES-256 key length in bytes. */
const KEY_BYTES = 32;

/**
 * Generate a new AES-256 encryption key with a random identifier.
 *
 * @returns An `EncryptionKey` ready for use with `encryptContent`
 */
export function generateEncryptionKey(): EncryptionKey {
  return {
    keyId: randomBytes(16).toString("hex"),
    key: randomBytes(KEY_BYTES),
    createdAt: new Date(),
  };
}

/**
 * Encrypt plaintext content using AES-256-GCM.
 *
 * @param plaintext  The data to encrypt
 * @param key        A 256-bit encryption key
 * @param aad        Optional additional authenticated data
 * @returns An `EncryptedPayload` containing ciphertext and GCM metadata
 */
export function encryptContent(
  plaintext: Buffer,
  key: Buffer,
  aad?: Buffer,
): Result<EncryptedPayload> {
  if (key.length !== KEY_BYTES) {
    return err(new Error(`Key must be exactly ${KEY_BYTES} bytes (got ${key.length})`));
  }

  try {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });

    if (aad) {
      cipher.setAAD(aad);
    }

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: encrypted.toString("base64"),
      ...(aad ? { aadId: aad.toString("utf8") } : {}),
    };
    return ok(payload);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Encryption failed: ${String(error)}`),
    );
  }
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 *
 * @param payload  The encrypted payload with IV and auth tag
 * @param key      The 256-bit key used for encryption
 * @param aad      The same AAD that was supplied during encryption (if any)
 * @returns Decrypted plaintext as a `Buffer`
 */
export function decryptContent(
  payload: EncryptedPayload,
  key: Buffer,
  aad?: Buffer,
): Result<Buffer> {
  if (key.length !== KEY_BYTES) {
    return err(new Error(`Key must be exactly ${KEY_BYTES} bytes (got ${key.length})`));
  }

  try {
    const iv = Buffer.from(payload.iv, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });

    decipher.setAuthTag(authTag);

    if (aad) {
      decipher.setAAD(aad);
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return ok(decrypted);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Decryption failed: ${String(error)}`),
    );
  }
}

/**
 * Prepare an email body for envelope encryption using S/MIME or PGP.
 *
 * This function wraps the plaintext in the appropriate envelope format.
 * Actual S/MIME CMS or PGP packet construction requires external libraries
 * (e.g. `node-forge` for S/MIME, `openpgp` for PGP). This implementation
 * provides the structural scaffolding and delegates to those libraries at
 * integration time.
 *
 * @param body     Raw email body to encrypt
 * @param options  Envelope encryption options (scheme + recipient key)
 * @returns An envelope-encrypted message
 */
export function envelopeEncrypt(
  body: string,
  options: EnvelopeEncryptOptions,
): Result<EnvelopeEncryptedMessage> {
  const { scheme, recipientKey } = options;

  if (!recipientKey.trim()) {
    return err(new Error("Recipient key must not be empty"));
  }

  try {
    if (scheme === "smime") {
      // In production, use node-forge or similar to build a CMS EnvelopedData
      // structure. Here we apply AES-256-GCM content encryption and wrap the
      // result in a PEM-like S/MIME envelope as a placeholder.
      const contentKey = randomBytes(KEY_BYTES);
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv("aes-256-gcm", contentKey, iv, {
        authTagLength: AUTH_TAG_BYTES,
      });
      const encrypted = Buffer.concat([
        cipher.update(Buffer.from(body, "utf8")),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      const envelope = Buffer.from(
        JSON.stringify({
          contentEncryption: "aes-256-gcm",
          iv: iv.toString("base64"),
          authTag: authTag.toString("base64"),
          encryptedContent: encrypted.toString("base64"),
          // In production the content key would be encrypted with the
          // recipient's public key using RSA-OAEP or ECDH.
          wrappedKey: contentKey.toString("base64"),
        }),
      ).toString("base64");

      return ok({
        scheme: "smime",
        encryptedBody: `-----BEGIN SMIME ENCRYPTED-----\n${envelope}\n-----END SMIME ENCRYPTED-----`,
      });
    }

    // PGP scheme
    // In production, use openpgp.js to create a proper PGP message.
    const contentKey = randomBytes(KEY_BYTES);
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", contentKey, iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(body, "utf8")),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const packet = Buffer.from(
      JSON.stringify({
        contentEncryption: "aes-256-gcm",
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        encryptedContent: encrypted.toString("base64"),
        wrappedKey: contentKey.toString("base64"),
      }),
    ).toString("base64");

    return ok({
      scheme: "pgp",
      encryptedBody: `-----BEGIN PGP MESSAGE-----\n${packet}\n-----END PGP MESSAGE-----`,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Envelope encryption failed: ${String(error)}`),
    );
  }
}
