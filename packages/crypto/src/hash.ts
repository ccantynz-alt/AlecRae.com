/**
 * Hashing utilities for the Emailed platform.
 *
 * Provides SHA-256/SHA-512 hashing, HMAC generation/verification,
 * content fingerprinting, and password hashing via Argon2id.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  scrypt,
} from "node:crypto";
import { type Result, ok, err } from "@emailed/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Supported hash algorithms. */
export type HashAlgorithm = "sha256" | "sha512";

/** Encoding format for hash output. */
export type HashEncoding = "hex" | "base64" | "base64url";

/** Result of an HMAC computation. */
export interface HmacResult {
  /** The HMAC value in the specified encoding. */
  readonly mac: string;
  /** The algorithm used. */
  readonly algorithm: HashAlgorithm;
  /** The encoding used. */
  readonly encoding: HashEncoding;
}

/** A content fingerprint combining multiple hash properties. */
export interface ContentFingerprint {
  /** SHA-256 hex digest of the content. */
  readonly sha256: string;
  /** Content size in bytes. */
  readonly sizeBytes: number;
  /** Short fingerprint for display (first 16 chars of SHA-256). */
  readonly short: string;
  /** Composite fingerprint: "sha256:{hash}:{size}" */
  readonly composite: string;
}

/** Argon2id password hash parameters. */
export interface Argon2idParams {
  /** Memory cost in KiB (default 65536 = 64 MiB). */
  readonly memoryCost?: number;
  /** Time cost / iterations (default 3). */
  readonly timeCost?: number;
  /** Degree of parallelism (default 4). */
  readonly parallelism?: number;
  /** Output hash length in bytes (default 32). */
  readonly hashLength?: number;
  /** Salt length in bytes (default 16). */
  readonly saltLength?: number;
}

/** A stored password hash with all parameters needed for verification. */
export interface PasswordHash {
  /** The algorithm identifier. */
  readonly algorithm: "argon2id" | "scrypt";
  /** Base64-encoded hash. */
  readonly hash: string;
  /** Base64-encoded salt. */
  readonly salt: string;
  /** Parameters used for hashing (for future verification). */
  readonly params: {
    readonly memoryCost: number;
    readonly timeCost: number;
    readonly parallelism: number;
    readonly hashLength: number;
  };
  /** PHC string format: $algorithm$params$salt$hash */
  readonly phcString: string;
}

// ---------------------------------------------------------------------------
// SHA-256 / SHA-512
// ---------------------------------------------------------------------------

/**
 * Compute a SHA-256 hash of the input data.
 *
 * @param data - String or Buffer to hash
 * @param encoding - Output encoding (default "hex")
 * @returns The hash digest in the specified encoding
 */
export function sha256(
  data: string | Buffer,
  encoding: HashEncoding = "hex",
): string {
  return createHash("sha256").update(data).digest(encoding);
}

/**
 * Compute a SHA-512 hash of the input data.
 *
 * @param data - String or Buffer to hash
 * @param encoding - Output encoding (default "hex")
 * @returns The hash digest in the specified encoding
 */
export function sha512(
  data: string | Buffer,
  encoding: HashEncoding = "hex",
): string {
  return createHash("sha512").update(data).digest(encoding);
}

/**
 * Compute a hash using the specified algorithm.
 *
 * @param algorithm - Hash algorithm to use
 * @param data - Data to hash
 * @param encoding - Output encoding (default "hex")
 */
export function hash(
  algorithm: HashAlgorithm,
  data: string | Buffer,
  encoding: HashEncoding = "hex",
): string {
  return createHash(algorithm).update(data).digest(encoding);
}

// ---------------------------------------------------------------------------
// HMAC
// ---------------------------------------------------------------------------

/**
 * Generate an HMAC for the given data.
 *
 * @param key - The secret key (string or Buffer)
 * @param data - The data to authenticate
 * @param algorithm - Hash algorithm (default "sha256")
 * @param encoding - Output encoding (default "hex")
 */
export function hmacSign(
  key: string | Buffer,
  data: string | Buffer,
  algorithm: HashAlgorithm = "sha256",
  encoding: HashEncoding = "hex",
): HmacResult {
  const mac = createHmac(algorithm, key).update(data).digest(encoding);
  return { mac, algorithm, encoding };
}

/**
 * Verify an HMAC using constant-time comparison to prevent timing attacks.
 *
 * @param key - The secret key
 * @param data - The data that was authenticated
 * @param expectedMac - The expected HMAC value
 * @param algorithm - Hash algorithm (default "sha256")
 * @param encoding - Encoding of the expected MAC (default "hex")
 * @returns true if the HMAC is valid
 */
export function hmacVerify(
  key: string | Buffer,
  data: string | Buffer,
  expectedMac: string,
  algorithm: HashAlgorithm = "sha256",
  encoding: HashEncoding = "hex",
): boolean {
  const computed = createHmac(algorithm, key).update(data).digest(encoding);

  // Constant-time comparison to prevent timing attacks
  const computedBuf = Buffer.from(computed, "utf-8");
  const expectedBuf = Buffer.from(expectedMac, "utf-8");

  if (computedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(computedBuf, expectedBuf);
}

// ---------------------------------------------------------------------------
// Content Fingerprinting
// ---------------------------------------------------------------------------

/**
 * Generate a content fingerprint for deduplication and integrity checking.
 *
 * Useful for identifying duplicate emails, attachments, or content blocks.
 *
 * @param content - The content to fingerprint (string or Buffer)
 * @returns A composite fingerprint with SHA-256, size, and short form
 */
export function fingerprint(content: string | Buffer): ContentFingerprint {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const sha256Hash = createHash("sha256").update(buffer).digest("hex");
  const sizeBytes = buffer.length;
  const shortId = sha256Hash.slice(0, 16);

  return {
    sha256: sha256Hash,
    sizeBytes,
    short: shortId,
    composite: `sha256:${sha256Hash}:${sizeBytes}`,
  };
}

/**
 * Parse a composite fingerprint string back into its components.
 *
 * @param compositeStr - A string in the format "sha256:{hash}:{size}"
 */
export function parseFingerprint(compositeStr: string): Result<ContentFingerprint, Error> {
  const parts = compositeStr.split(":");
  if (parts.length !== 3 || parts[0] !== "sha256") {
    return err(new Error(`Invalid fingerprint format: expected "sha256:{hash}:{size}", got "${compositeStr}"`));
  }

  const sha256Hash = parts[1]!;
  const sizeBytes = parseInt(parts[2]!, 10);

  if (sha256Hash.length !== 64) {
    return err(new Error(`Invalid SHA-256 hash length: expected 64 hex chars, got ${sha256Hash.length}`));
  }

  if (isNaN(sizeBytes) || sizeBytes < 0) {
    return err(new Error(`Invalid size in fingerprint: ${parts[2]}`));
  }

  return ok({
    sha256: sha256Hash,
    sizeBytes,
    short: sha256Hash.slice(0, 16),
    composite: compositeStr,
  });
}

/**
 * Compare two fingerprints for equality.
 */
export function fingerprintsMatch(a: ContentFingerprint, b: ContentFingerprint): boolean {
  return a.sha256 === b.sha256 && a.sizeBytes === b.sizeBytes;
}

// ---------------------------------------------------------------------------
// Password Hashing (scrypt-based Argon2id-compatible)
// ---------------------------------------------------------------------------

// Note: Node.js does not have native Argon2id support. We use scrypt as the
// underlying KDF, which provides comparable security properties. In production,
// the `argon2` npm package should be added for true Argon2id. The interface
// is designed to be Argon2id-compatible for future migration.

const DEFAULT_SCRYPT_COST = 16384;  // N (CPU/memory cost)
const DEFAULT_SCRYPT_BLOCK_SIZE = 8; // r
const DEFAULT_SCRYPT_PARALLELISM = 1; // p
const DEFAULT_HASH_LENGTH = 32;
const DEFAULT_SALT_LENGTH = 16;

/**
 * Hash a password using scrypt (Argon2id-compatible interface).
 *
 * The output includes all parameters needed for future verification,
 * stored in PHC string format for interoperability.
 *
 * @param password - The password to hash
 * @param params - Optional hashing parameters
 * @returns Password hash with parameters for verification
 */
export async function hashPassword(
  password: string,
  params?: Argon2idParams,
): Promise<Result<PasswordHash, Error>> {
  const memoryCost = params?.memoryCost ?? DEFAULT_SCRYPT_COST;
  const timeCost = params?.timeCost ?? DEFAULT_SCRYPT_BLOCK_SIZE;
  const parallelism = params?.parallelism ?? DEFAULT_SCRYPT_PARALLELISM;
  const hashLength = params?.hashLength ?? DEFAULT_HASH_LENGTH;
  const saltLength = params?.saltLength ?? DEFAULT_SALT_LENGTH;

  const salt = randomBytes(saltLength);

  return new Promise((resolve) => {
    scrypt(
      password,
      salt,
      hashLength,
      { N: memoryCost, r: timeCost, p: parallelism, maxmem: memoryCost * 256 },
      (error, derivedKey) => {
        if (error) {
          resolve(err(error));
          return;
        }

        const hashBase64 = derivedKey.toString("base64");
        const saltBase64 = salt.toString("base64");

        // PHC string format for interoperability
        const phcString = `$scrypt$n=${memoryCost},r=${timeCost},p=${parallelism}$${saltBase64}$${hashBase64}`;

        resolve(ok({
          algorithm: "scrypt",
          hash: hashBase64,
          salt: saltBase64,
          params: {
            memoryCost,
            timeCost,
            parallelism,
            hashLength,
          },
          phcString,
        }));
      },
    );
  });
}

/**
 * Verify a password against a stored hash.
 *
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param password - The password to verify
 * @param storedHash - The stored password hash from hashPassword()
 * @returns true if the password matches
 */
export async function verifyPassword(
  password: string,
  storedHash: PasswordHash,
): Promise<Result<boolean, Error>> {
  const salt = Buffer.from(storedHash.salt, "base64");
  const expectedHash = Buffer.from(storedHash.hash, "base64");

  const { memoryCost, timeCost, parallelism, hashLength } = storedHash.params;

  return new Promise((resolve) => {
    scrypt(
      password,
      salt,
      hashLength,
      { N: memoryCost, r: timeCost, p: parallelism, maxmem: memoryCost * 256 },
      (error, derivedKey) => {
        if (error) {
          resolve(err(error));
          return;
        }

        if (derivedKey.length !== expectedHash.length) {
          resolve(ok(false));
          return;
        }

        resolve(ok(timingSafeEqual(derivedKey, expectedHash)));
      },
    );
  });
}

/**
 * Parse a PHC string format password hash.
 *
 * @param phcString - Password hash in PHC format: $scrypt$n=N,r=R,p=P$salt$hash
 */
export function parsePhcString(phcString: string): Result<PasswordHash, Error> {
  const parts = phcString.split("$").filter((p) => p.length > 0);

  if (parts.length !== 4) {
    return err(new Error(`Invalid PHC string: expected 4 parts, got ${parts.length}`));
  }

  const algorithm = parts[0]!;
  if (algorithm !== "scrypt" && algorithm !== "argon2id") {
    return err(new Error(`Unsupported algorithm: ${algorithm}`));
  }

  const paramsStr = parts[1]!;
  const paramMap = new Map<string, number>();
  for (const param of paramsStr.split(",")) {
    const [key, value] = param.split("=");
    if (key && value) {
      paramMap.set(key, parseInt(value, 10));
    }
  }

  const n = paramMap.get("n");
  const r = paramMap.get("r");
  const p = paramMap.get("p");

  if (n === undefined || r === undefined || p === undefined) {
    return err(new Error("Missing required parameters (n, r, p) in PHC string"));
  }

  const saltBase64 = parts[2]!;
  const hashBase64 = parts[3]!;
  const hashLength = Buffer.from(hashBase64, "base64").length;

  return ok({
    algorithm: algorithm as "scrypt" | "argon2id",
    hash: hashBase64,
    salt: saltBase64,
    params: {
      memoryCost: n,
      timeCost: r,
      parallelism: p,
      hashLength,
    },
    phcString,
  });
}
