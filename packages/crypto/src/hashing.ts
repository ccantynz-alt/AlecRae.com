/**
 * Secure hashing utilities: SHA-256, SHA-512, HMAC, password hashing
 * with Argon2 parameters, and constant-time comparison.
 */
import {
  createHash,
  createHmac,
  timingSafeEqual,
  randomBytes,
  scrypt,
} from "node:crypto";
import { promisify } from "node:util";

import { ok, err } from "@emailed/shared";
import type { Result } from "@emailed/shared";

import type { HashAlgorithm, HmacAlgorithm, Argon2Params, HashedPassword } from "./types.js";

const scryptAsync = promisify(scrypt);

/** Default Argon2 parameters (used as scrypt stand-in; see note below). */
const DEFAULT_ARGON2_PARAMS: Argon2Params = {
  variant: "argon2id",
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  hashLength: 32,
};

/**
 * Compute a hex-encoded hash digest of the given data.
 *
 * @param data       Input data (string or Buffer)
 * @param algorithm  Hash algorithm to use
 * @returns Hex-encoded digest string
 */
export function hash(data: string | Buffer, algorithm: HashAlgorithm = "sha256"): string {
  return createHash(algorithm).update(data).digest("hex");
}

/**
 * Compute a SHA-256 hash and return it as a `Buffer`.
 *
 * @param data  Input data
 * @returns Raw digest bytes
 */
export function sha256(data: string | Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

/**
 * Compute a SHA-512 hash and return it as a `Buffer`.
 *
 * @param data  Input data
 * @returns Raw digest bytes
 */
export function sha512(data: string | Buffer): Buffer {
  return createHash("sha512").update(data).digest();
}

/**
 * Compute an HMAC digest.
 *
 * @param data       Input data
 * @param key        HMAC secret key
 * @param algorithm  Hash algorithm for HMAC
 * @returns Hex-encoded HMAC string
 */
export function hmac(
  data: string | Buffer,
  key: string | Buffer,
  algorithm: HmacAlgorithm = "sha256",
): string {
  return createHmac(algorithm, key).update(data).digest("hex");
}

/**
 * Compute an HMAC and return the raw `Buffer`.
 *
 * @param data       Input data
 * @param key        HMAC secret key
 * @param algorithm  Hash algorithm for HMAC
 * @returns Raw HMAC bytes
 */
export function hmacRaw(
  data: string | Buffer,
  key: string | Buffer,
  algorithm: HmacAlgorithm = "sha256",
): Buffer {
  return createHmac(algorithm, key).update(data).digest();
}

/**
 * Constant-time comparison of two strings or Buffers.
 *
 * Prevents timing side-channel attacks when comparing secrets such as
 * HMAC digests, API keys, or webhook signatures.
 *
 * @returns `true` if both values are identical
 */
export function constantTimeEqual(
  a: string | Buffer,
  b: string | Buffer,
): boolean {
  const bufA = typeof a === "string" ? Buffer.from(a, "utf8") : a;
  const bufB = typeof b === "string" ? Buffer.from(b, "utf8") : b;

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Hash a password using scrypt (Node.js native).
 *
 * NOTE: The Argon2 parameter set is stored alongside the hash for future
 * migration. When a native Argon2 binding is available, this function
 * will switch transparently. The scrypt cost parameters are derived from
 * the Argon2 params to maintain a comparable security margin.
 *
 * @param password  Plaintext password
 * @param params    Argon2-compatible parameter set (optional)
 * @returns A `HashedPassword` containing the encoded hash and parameters
 */
export async function hashPassword(
  password: string,
  params: Partial<Argon2Params> = {},
): Promise<Result<HashedPassword>> {
  const fullParams: Argon2Params = { ...DEFAULT_ARGON2_PARAMS, ...params };

  try {
    const salt = randomBytes(16);
    const derivedKey = (await scryptAsync(
      password,
      salt,
      fullParams.hashLength,
      {
        N: Math.pow(2, Math.ceil(Math.log2(fullParams.memoryCost / 8))),
        r: 8,
        p: fullParams.parallelism,
        maxmem: fullParams.memoryCost * 1024 * 2,
      },
    )) as Buffer;

    const hashString = [
      fullParams.variant,
      salt.toString("base64"),
      derivedKey.toString("base64"),
    ].join("$");

    return ok({ hash: hashString, params: fullParams });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Password hashing failed: ${String(error)}`),
    );
  }
}

/**
 * Verify a password against a previously hashed value.
 *
 * @param password  Plaintext password to check
 * @param hashed    The stored `HashedPassword`
 * @returns `true` if the password matches
 */
export async function verifyPassword(
  password: string,
  hashed: HashedPassword,
): Promise<Result<boolean>> {
  const parts = hashed.hash.split("$");
  if (parts.length !== 3) {
    return err(new Error("Invalid hash format"));
  }

  const [, saltB64, expectedB64] = parts as [string, string, string];
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(expectedB64, "base64");

  try {
    const derivedKey = (await scryptAsync(
      password,
      salt,
      hashed.params.hashLength,
      {
        N: Math.pow(2, Math.ceil(Math.log2(hashed.params.memoryCost / 8))),
        r: 8,
        p: hashed.params.parallelism,
        maxmem: hashed.params.memoryCost * 1024 * 2,
      },
    )) as Buffer;

    return ok(constantTimeEqual(derivedKey, expected));
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Password verification failed: ${String(error)}`),
    );
  }
}

/**
 * Generate a cryptographically secure random token as a hex string.
 *
 * @param bytes  Number of random bytes (default 32 = 256 bits)
 * @returns Hex-encoded random token
 */
export function generateToken(bytes: number = 32): string {
  return randomBytes(bytes).toString("hex");
}
