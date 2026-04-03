// ─── DKIM Types ──────────────────────────────────────────────────────────────

/** Supported DKIM key algorithms. */
export type DkimAlgorithm = "rsa-sha256" | "ed25519-sha256";

/** Supported RSA key sizes for DKIM signing. */
export type DkimRsaKeySize = 1024 | 2048 | 4096;

/** A DKIM key pair with metadata for DNS publishing. */
export interface DkimKeyPair {
  /** DKIM selector (e.g. "s1", "202401") */
  readonly selector: string;
  /** Signing domain */
  readonly domain: string;
  /** Algorithm used to generate the key pair */
  readonly algorithm: DkimAlgorithm;
  /** PEM-encoded private key */
  readonly privateKey: string;
  /** PEM-encoded public key */
  readonly publicKey: string;
  /** Public key formatted for a DNS TXT record value */
  readonly dnsRecord: string;
  /** Full DNS record name: <selector>._domainkey.<domain> */
  readonly dnsName: string;
  /** Timestamp of key generation */
  readonly createdAt: Date;
}

/** Options for DKIM key generation. */
export interface DkimKeyGenOptions {
  readonly selector: string;
  readonly domain: string;
  readonly algorithm?: DkimAlgorithm;
  /** RSA key size in bits. Ignored for Ed25519. Default: 2048 */
  readonly rsaKeySize?: DkimRsaKeySize;
}

/** Parameters for scheduling a key rotation. */
export interface DkimRotationPlan {
  readonly currentSelector: string;
  readonly nextSelector: string;
  readonly domain: string;
  readonly algorithm: DkimAlgorithm;
  /** How long both selectors should remain valid (overlap period). */
  readonly overlapSeconds: number;
  readonly rotateAt: Date;
}

// ─── TLS Types ───────────────────────────────────────────────────────────────

/** Supported TLS protocol versions. */
export type TlsVersion = "TLSv1.2" | "TLSv1.3";

/** A Certificate Signing Request along with its private key. */
export interface CsrResult {
  /** PEM-encoded CSR */
  readonly csr: string;
  /** PEM-encoded private key */
  readonly privateKey: string;
}

/** Options for generating a CSR. */
export interface CsrOptions {
  /** Common name (e.g. "mail.example.com") */
  readonly commonName: string;
  /** Subject Alternative Names */
  readonly altNames?: readonly string[];
  /** Organization name */
  readonly organization?: string;
  /** Country code (2-letter ISO) */
  readonly country?: string;
  /** RSA key size. Default: 2048 */
  readonly keySize?: number;
}

/** Information extracted from a parsed X.509 certificate. */
export interface CertificateInfo {
  readonly subject: string;
  readonly issuer: string;
  readonly serialNumber: string;
  readonly validFrom: Date;
  readonly validTo: Date;
  readonly fingerprint256: string;
  readonly altNames: readonly string[];
  readonly isCA: boolean;
  readonly keyUsage?: readonly string[];
}

/** Result of a certificate chain validation. */
export interface CertificateChainValidation {
  readonly valid: boolean;
  readonly chain: readonly CertificateInfo[];
  readonly errors: readonly string[];
}

// ─── Encryption Types ────────────────────────────────────────────────────────

/** Supported content encryption algorithms. */
export type EncryptionAlgorithm = "aes-256-gcm";

/** Supported envelope encryption schemes. */
export type EnvelopeScheme = "smime" | "pgp";

/** An encrypted payload with the metadata needed for decryption. */
export interface EncryptedPayload {
  /** The encryption algorithm used */
  readonly algorithm: EncryptionAlgorithm;
  /** Base64-encoded initialization vector */
  readonly iv: string;
  /** Base64-encoded authentication tag (GCM) */
  readonly authTag: string;
  /** Base64-encoded ciphertext */
  readonly ciphertext: string;
  /** Optional additional authenticated data identifier */
  readonly aadId?: string;
}

/** An AES-256 key with its identifier for key management. */
export interface EncryptionKey {
  /** Unique key identifier */
  readonly keyId: string;
  /** Raw 256-bit key */
  readonly key: Buffer;
  readonly createdAt: Date;
}

/** Options for envelope encryption (S/MIME or PGP). */
export interface EnvelopeEncryptOptions {
  readonly scheme: EnvelopeScheme;
  /** PEM-encoded recipient certificate (S/MIME) or armored public key (PGP) */
  readonly recipientKey: string;
}

/** An envelope-encrypted email payload. */
export interface EnvelopeEncryptedMessage {
  readonly scheme: EnvelopeScheme;
  /** The encrypted message body (PEM for S/MIME, ASCII-armored for PGP) */
  readonly encryptedBody: string;
}

// ─── Hashing Types ───────────────────────────────────────────────────────────

/** Supported hash algorithms. */
export type HashAlgorithm = "sha256" | "sha512";

/** Supported HMAC algorithms. */
export type HmacAlgorithm = "sha256" | "sha512";

/** Parameters for Argon2 password hashing. */
export interface Argon2Params {
  /** Argon2 variant. Default: argon2id */
  readonly variant: "argon2id" | "argon2i" | "argon2d";
  /** Memory cost in KiB. Default: 65536 (64 MiB) */
  readonly memoryCost: number;
  /** Time cost (iterations). Default: 3 */
  readonly timeCost: number;
  /** Parallelism factor. Default: 4 */
  readonly parallelism: number;
  /** Output hash length in bytes. Default: 32 */
  readonly hashLength: number;
}

/** A hashed password with its parameters for verification. */
export interface HashedPassword {
  /** The full encoded hash string (includes salt + params) */
  readonly hash: string;
  readonly params: Argon2Params;
}
