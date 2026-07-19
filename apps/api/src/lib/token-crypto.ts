/**
 * AES-256-GCM encryption for secrets stored in `connected_accounts` — OAuth
 * access/refresh tokens and IMAP/SMTP passwords, all previously stored as
 * bare plaintext columns (issue #80). Key is derived from JWT_SECRET
 * (sha256), the same approach routes/meeting-link.ts already used for
 * meeting-provider tokens — reusing it avoids provisioning a second secret
 * to rotate.
 *
 * decryptSecret() falls back to treating the stored value as legacy
 * plaintext if it isn't valid encrypted JSON — the same transparent-upgrade
 * pattern routes/auth.ts uses for Argon2-vs-legacy-SHA-256 password hashes.
 * Existing connected accounts keep working with no data migration required;
 * every write from here on (connect, manual sync, background re-sync, token
 * refresh) stores the encrypted form, so data self-heals as accounts are
 * naturally touched.
 */

import { encryptContent, decryptContent, sha256 } from "@alecrae/crypto";
import type { EncryptedPayload } from "@alecrae/crypto";

function getSecretEncryptionKey(): Buffer {
  const secret = process.env["JWT_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "[token-crypto] JWT_SECRET must be set (>= 32 characters) to encrypt stored account secrets.",
    );
  }
  return sha256(secret);
}

export function encryptSecret(value: string): string {
  const result = encryptContent(Buffer.from(value, "utf8"), getSecretEncryptionKey());
  if (!result.ok) throw result.error;
  return JSON.stringify(result.value);
}

function looksEncrypted(value: string): boolean {
  if (!value.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedPayload>;
    return typeof parsed.iv === "string" && typeof parsed.ciphertext === "string" && typeof parsed.authTag === "string";
  } catch {
    return false;
  }
}

export function decryptSecret(stored: string): string {
  if (!looksEncrypted(stored)) return stored; // legacy plaintext row
  const payload = JSON.parse(stored) as EncryptedPayload;
  const result = decryptContent(payload, getSecretEncryptionKey());
  if (!result.ok) throw result.error;
  return result.value.toString("utf8");
}

/** Encrypt only when non-null/non-empty — most of these fields are optional. */
export function encryptSecretOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return encryptSecret(value);
}

export function decryptSecretOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return decryptSecret(value);
}
