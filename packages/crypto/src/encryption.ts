/**
 * Email encryption utilities.
 *
 * Provides AES-256-GCM message encryption/decryption, key derivation (HKDF),
 * envelope encryption pattern, and type definitions for S/MIME and PGP support.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdf,
} from "node:crypto";
import { type Result, ok, err } from "@emailed/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An AES-256-GCM encrypted payload with all components needed for decryption. */
export interface EncryptedPayload {
  /** Base64-encoded ciphertext. */
  readonly ciphertext: string;
  /** Base64-encoded 12-byte initialization vector. */
  readonly iv: string;
  /** Base64-encoded 16-byte authentication tag. */
  readonly authTag: string;
  /** Algorithm identifier. */
  readonly algorithm: "aes-256-gcm";
  /** Optional base64-encoded additional authenticated data. */
  readonly aad?: string;
}

/** An envelope-encrypted payload where the data encryption key (DEK) is itself encrypted. */
export interface EnvelopeEncryptedPayload {
  /** The encrypted content. */
  readonly payload: EncryptedPayload;
  /** The data encryption key, encrypted with the key encryption key (KEK). */
  readonly encryptedDek: EncryptedPayload;
  /** Identifier for the KEK used (for key rotation). */
  readonly kekId: string;
  /** Timestamp when encryption was performed. */
  readonly encryptedAt: string;
}

/** Parameters for HKDF key derivation. */
export interface HkdfParams {
  /** The input key material. */
  readonly ikm: Buffer;
  /** Application-specific salt (can be empty Buffer). */
  readonly salt: Buffer;
  /** Context and application-specific info string. */
  readonly info: string;
  /** Desired output key length in bytes (default 32 for AES-256). */
  readonly length?: number;
  /** Hash algorithm (default "sha256"). */
  readonly hash?: "sha256" | "sha384" | "sha512";
}

/** Derived key material from HKDF. */
export interface DerivedKey {
  /** The derived key bytes. */
  readonly key: Buffer;
  /** The salt that was used (may be auto-generated). */
  readonly salt: Buffer;
  /** The info string used. */
  readonly info: string;
  /** The hash algorithm used. */
  readonly hash: string;
}

/** S/MIME signature information (type-only, actual implementation requires CMS library). */
export interface SmimeSignatureInfo {
  readonly signerCertificate: string;
  readonly signatureAlgorithm: "sha256WithRSAEncryption" | "sha384WithRSAEncryption" | "sha512WithRSAEncryption" | "ecdsa-with-SHA256" | "ecdsa-with-SHA384";
  readonly signedAt: Date;
  readonly contentType: "multipart/signed" | "application/pkcs7-mime";
  readonly isValid: boolean;
  readonly signerEmail: string;
  readonly certificateChain: readonly string[];
}

/** S/MIME encryption parameters (type-only, actual implementation requires CMS library). */
export interface SmimeEncryptionParams {
  readonly recipientCertificates: readonly string[];
  readonly encryptionAlgorithm: "aes128-cbc" | "aes192-cbc" | "aes256-cbc";
  readonly contentType: "application/pkcs7-mime";
  readonly smimeType: "enveloped-data";
}

/** PGP public key metadata (type-only, actual implementation requires OpenPGP library). */
export interface PgpPublicKey {
  readonly keyId: string;
  readonly fingerprint: string;
  readonly algorithm: "rsa" | "ecdsa" | "eddsa" | "elgamal";
  readonly bitLength: number;
  readonly userId: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly expiresAt?: Date;
  readonly isRevoked: boolean;
  readonly armoredPublicKey: string;
}

/** PGP encryption options (type-only). */
export interface PgpEncryptionOptions {
  readonly recipientKeys: readonly PgpPublicKey[];
  readonly signerKey?: {
    readonly armoredPrivateKey: string;
    readonly passphrase?: string;
  };
  readonly compress: boolean;
  readonly armor: boolean;
}

/** Key rotation metadata for envelope encryption. */
export interface KeyRotationInfo {
  readonly kekId: string;
  readonly createdAt: Date;
  readonly rotatedAt?: Date;
  readonly status: "active" | "rotated" | "retired";
  readonly algorithm: "aes-256-gcm";
}

// ---------------------------------------------------------------------------
// AES-256-GCM Encryption / Decryption
// ---------------------------------------------------------------------------

const AES_KEY_LENGTH = 32; // 256 bits
const AES_IV_LENGTH = 12;  // 96 bits (recommended for GCM)
const AES_TAG_LENGTH = 16; // 128 bits

/**
 * Encrypt data using AES-256-GCM.
 *
 * @param plaintext - The data to encrypt (Buffer or UTF-8 string)
 * @param key - 32-byte encryption key
 * @param aad - Optional additional authenticated data
 * @returns Encrypted payload containing ciphertext, IV, and auth tag
 */
export function encrypt(
  plaintext: Buffer | string,
  key: Buffer,
  aad?: Buffer,
): Result<EncryptedPayload, Error> {
  if (key.length !== AES_KEY_LENGTH) {
    return err(new Error(`Encryption key must be ${AES_KEY_LENGTH} bytes, got ${key.length}`));
  }

  try {
    const iv = randomBytes(AES_IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv, {
      authTagLength: AES_TAG_LENGTH,
    });

    if (aad) {
      cipher.setAAD(aad);
    }

    const plaintextBuffer = typeof plaintext === "string"
      ? Buffer.from(plaintext, "utf-8")
      : plaintext;

    const encrypted = Buffer.concat([
      cipher.update(plaintextBuffer),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      ciphertext: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      algorithm: "aes-256-gcm",
      ...(aad ? { aad: aad.toString("base64") } : {}),
    };

    return ok(payload);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

/**
 * Decrypt an AES-256-GCM encrypted payload.
 *
 * @param payload - The encrypted payload from encrypt()
 * @param key - The same 32-byte key used for encryption
 * @returns Decrypted data as a Buffer
 */
export function decrypt(
  payload: EncryptedPayload,
  key: Buffer,
): Result<Buffer, Error> {
  if (key.length !== AES_KEY_LENGTH) {
    return err(new Error(`Decryption key must be ${AES_KEY_LENGTH} bytes, got ${key.length}`));
  }

  try {
    const iv = Buffer.from(payload.iv, "base64");
    const ciphertext = Buffer.from(payload.ciphertext, "base64");
    const authTag = Buffer.from(payload.authTag, "base64");

    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: AES_TAG_LENGTH,
    });

    decipher.setAuthTag(authTag);

    if (payload.aad) {
      decipher.setAAD(Buffer.from(payload.aad, "base64"));
    }

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return ok(decrypted);
  } catch (e) {
    // GCM auth failures throw with a generic message — provide a clearer one
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unsupported state") || message.includes("unable to authenticate")) {
      return err(new Error("Decryption failed: authentication tag verification failed. Data may be tampered."));
    }
    return err(e instanceof Error ? e : new Error(message));
  }
}

// ---------------------------------------------------------------------------
// Key Derivation (HKDF)
// ---------------------------------------------------------------------------

/**
 * Derive a cryptographic key using HKDF (RFC 5869).
 *
 * @param params - HKDF parameters including input key material, salt, and info
 * @returns Derived key material
 */
export function deriveKey(params: HkdfParams): Promise<Result<DerivedKey, Error>> {
  const {
    ikm,
    salt,
    info,
    length = AES_KEY_LENGTH,
    hash = "sha256",
  } = params;

  return new Promise((resolve) => {
    hkdf(hash, ikm, salt, info, length, (error, derivedKeyBuffer) => {
      if (error) {
        resolve(err(error));
        return;
      }

      resolve(ok({
        key: Buffer.from(derivedKeyBuffer),
        salt,
        info,
        hash,
      }));
    });
  });
}

/**
 * Generate a random encryption key suitable for AES-256-GCM.
 *
 * @returns A cryptographically random 32-byte key
 */
export function generateEncryptionKey(): Buffer {
  return randomBytes(AES_KEY_LENGTH);
}

/**
 * Generate a random salt for HKDF key derivation.
 *
 * @param length - Salt length in bytes (default 32)
 * @returns A cryptographically random salt
 */
export function generateSalt(length: number = 32): Buffer {
  return randomBytes(length);
}

// ---------------------------------------------------------------------------
// Envelope Encryption
// ---------------------------------------------------------------------------

/**
 * Encrypt data using the envelope encryption pattern.
 *
 * A random data encryption key (DEK) is generated for each encryption operation.
 * The DEK encrypts the data, and then the DEK itself is encrypted with the
 * key encryption key (KEK). This enables key rotation without re-encrypting data.
 *
 * @param plaintext - Data to encrypt
 * @param kek - Key encryption key (32 bytes)
 * @param kekId - Identifier for the KEK (for rotation tracking)
 * @returns Envelope encrypted payload
 */
export function envelopeEncrypt(
  plaintext: Buffer | string,
  kek: Buffer,
  kekId: string,
): Result<EnvelopeEncryptedPayload, Error> {
  // Generate a random DEK
  const dek = generateEncryptionKey();

  // Encrypt the data with the DEK
  const dataResult = encrypt(plaintext, dek);
  if (!dataResult.ok) {
    return dataResult;
  }

  // Encrypt the DEK with the KEK
  const dekResult = encrypt(dek, kek);
  if (!dekResult.ok) {
    return dekResult;
  }

  return ok({
    payload: dataResult.value,
    encryptedDek: dekResult.value,
    kekId,
    encryptedAt: new Date().toISOString(),
  });
}

/**
 * Decrypt an envelope-encrypted payload.
 *
 * @param envelope - The envelope encrypted payload
 * @param kek - Key encryption key that was used to encrypt the DEK
 * @returns Decrypted data as a Buffer
 */
export function envelopeDecrypt(
  envelope: EnvelopeEncryptedPayload,
  kek: Buffer,
): Result<Buffer, Error> {
  // Decrypt the DEK using the KEK
  const dekResult = decrypt(envelope.encryptedDek, kek);
  if (!dekResult.ok) {
    return err(new Error(`Failed to decrypt DEK: ${dekResult.error.message}`));
  }

  // Decrypt the data using the DEK
  const dataResult = decrypt(envelope.payload, dekResult.value);
  if (!dataResult.ok) {
    return err(new Error(`Failed to decrypt payload: ${dataResult.error.message}`));
  }

  return dataResult;
}

/**
 * Re-encrypt an envelope payload with a new KEK (key rotation).
 *
 * This decrypts the DEK with the old KEK and re-encrypts it with the new KEK.
 * The actual data payload is NOT re-encrypted (that is the point of envelope encryption).
 *
 * @param envelope - The existing envelope encrypted payload
 * @param oldKek - The current KEK
 * @param newKek - The new KEK to encrypt the DEK with
 * @param newKekId - Identifier for the new KEK
 * @returns Updated envelope with DEK encrypted under the new KEK
 */
export function rotateEnvelopeKey(
  envelope: EnvelopeEncryptedPayload,
  oldKek: Buffer,
  newKek: Buffer,
  newKekId: string,
): Result<EnvelopeEncryptedPayload, Error> {
  // Decrypt the DEK with the old KEK
  const dekResult = decrypt(envelope.encryptedDek, oldKek);
  if (!dekResult.ok) {
    return err(new Error(`Failed to decrypt DEK with old KEK: ${dekResult.error.message}`));
  }

  // Re-encrypt the DEK with the new KEK
  const newDekResult = encrypt(dekResult.value, newKek);
  if (!newDekResult.ok) {
    return err(new Error(`Failed to re-encrypt DEK with new KEK: ${newDekResult.error.message}`));
  }

  return ok({
    payload: envelope.payload,
    encryptedDek: newDekResult.value,
    kekId: newKekId,
    encryptedAt: new Date().toISOString(),
  });
}
