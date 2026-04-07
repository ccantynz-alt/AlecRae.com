/**
 * @vienna/crypto — Shared cryptography utilities for the Emailed platform.
 *
 * Provides DKIM signing/verification, TLS certificate management,
 * AES-256-GCM encryption, hashing, and key derivation.
 */

// DKIM
export {
  signMessage,
  verifySignature,
  generateKeyPair,
  parseSignatureHeader,
  validateKeyPair,
  canonicalizeHeader,
  canonicalizeBody,
  dkimRecordName,
} from "./dkim.js";

export type {
  DkimAlgorithm,
  CanonicalizationMethod,
  Canonicalization,
  DkimSignOptions,
  DkimSignature,
  DkimVerifyResult,
  DkimKeyPair,
} from "./dkim.js";

// TLS
export {
  generateSelfSignedCert,
  validateCertificate,
  checkCertificateExpiry,
  generateTlsaRecord,
  generateMtaStsPolicy,
  serializeMtaStsPolicy,
  parseMtaStsPolicy,
  generateMtaStsDnsRecord,
  generateTlsRptRecord,
} from "./tls.js";

export type {
  TlsCertificate,
  TlsaMatchingType,
  TlsaCertificateUsage,
  TlsaSelector,
  TlsaRecord,
  MtaStsMode,
  MtaStsPolicy,
  CertificateValidationResult,
  CertificateExpiryStatus,
  SelfSignedCertOptions,
} from "./tls.js";

// Encryption
export {
  encrypt,
  decrypt,
  deriveKey,
  generateEncryptionKey,
  generateSalt,
  envelopeEncrypt,
  envelopeDecrypt,
  rotateEnvelopeKey,
} from "./encryption.js";

export type {
  EncryptedPayload,
  EnvelopeEncryptedPayload,
  HkdfParams,
  DerivedKey,
  SmimeSignatureInfo,
  SmimeEncryptionParams,
  PgpPublicKey,
  PgpEncryptionOptions,
  KeyRotationInfo,
} from "./encryption.js";

// Hashing
export {
  sha256,
  sha512,
  hash,
  hmacSign,
  hmacVerify,
  fingerprint,
  parseFingerprint,
  fingerprintsMatch,
  hashPassword,
  verifyPassword,
  parsePhcString,
} from "./hash.js";

export type {
  HashAlgorithm,
  HashEncoding,
  HmacResult,
  ContentFingerprint,
  Argon2idParams,
  PasswordHash,
} from "./hash.js";
