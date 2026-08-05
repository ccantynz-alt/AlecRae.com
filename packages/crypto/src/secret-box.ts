/**
 * At-rest encryption for secrets stored in ordinary Postgres columns.
 *
 * This is the single implementation. `apps/api/src/lib/token-crypto.ts`
 * (OAuth tokens + IMAP/SMTP passwords, issue #80) delegates here rather than
 * keeping its own copy, and `services/dns` + `services/mta` use it for DKIM
 * private keys (issue #160). A second private copy of a crypto boundary is
 * exactly how issue #124's header-injection fix stayed half-applied for two
 * days, and how issue #111 accumulated eight divergent Redis clients — so
 * there is one here, in the package both sides already depend on.
 *
 * Key derivation is sha256(JWT_SECRET), matching the scheme
 * `routes/meeting-link.ts` and `token-crypto.ts` already used, so no second
 * secret needs provisioning or rotating.
 *
 * ROTATION CAVEAT: rotating JWT_SECRET makes every value encrypted under the
 * old one undecryptable. For OAuth tokens that means users reconnect
 * (documented in the incident-response runbook, issue #115c). For DKIM keys
 * it means the affected domains cannot sign until their keys are
 * regenerated and the DNS record republished — messages are HELD, not sent
 * unsigned (issue #144), so nothing leaks, but mail stops. Plan a rotation
 * accordingly.
 */

import { encryptContent, decryptContent } from "./encryption.js";
import { sha256 } from "./hashing.js";
import type { EncryptedPayload } from "./types.js";

function secretKey(): Buffer {
  const secret = process.env["JWT_SECRET"];
  if (!secret || secret.length < 32) {
    throw new Error(
      "[secret-box] JWT_SECRET must be set (>= 32 characters) to encrypt secrets at rest.",
    );
  }
  return sha256(secret);
}

/** Encrypt a secret for storage. Returns a JSON envelope string. */
export function sealSecret(value: string): string {
  const result = encryptContent(Buffer.from(value, "utf8"), secretKey());
  if (!result.ok) throw result.error;
  return JSON.stringify(result.value);
}

/**
 * Is this stored value one of our envelopes, or a legacy plaintext row?
 *
 * Deliberately structural rather than a prefix marker: rows written before
 * encryption existed carry raw values (a PEM key, an OAuth token) and must
 * keep working until they are naturally rewritten.
 */
export function isSealed(value: string): boolean {
  if (!value.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedPayload>;
    return (
      typeof parsed.iv === "string" &&
      typeof parsed.ciphertext === "string" &&
      typeof parsed.authTag === "string"
    );
  } catch {
    return false;
  }
}

/**
 * Decrypt a stored secret, passing legacy plaintext through unchanged.
 * Throws if the value IS an envelope but cannot be decrypted — a wrong key
 * must be loud, never silently treated as plaintext (which would hand a
 * caller a JSON blob where it expected a PEM and produce a confusing
 * downstream failure instead of the real one).
 */
export function openSecret(stored: string): string {
  if (!isSealed(stored)) return stored;
  const payload = JSON.parse(stored) as EncryptedPayload;
  const result = decryptContent(payload, secretKey());
  if (!result.ok) throw result.error;
  return result.value.toString("utf8");
}

/** {@link sealSecret} for optional columns — null/empty stay null. */
export function sealSecretOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return sealSecret(value);
}

/** {@link openSecret} for optional columns — null/empty stay null. */
export function openSecretOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  return openSecret(value);
}

/**
 * Decrypt for a caller that must not crash on failure — returns null instead.
 *
 * The MTA's signing path uses this: a key it cannot decrypt is a key it does
 * not have, which routes into the issue-#144 hold-don't-send-unsigned branch.
 * That is strictly safer than throwing (which would fail the job and retry
 * into the DLQ) and than sending unsigned (which #144 exists to prevent).
 */
export function openSecretSafe(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return openSecret(value);
  } catch {
    return null;
  }
}
