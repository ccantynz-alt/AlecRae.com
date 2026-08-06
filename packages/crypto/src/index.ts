// Types
export type {
  DkimAlgorithm,
  DkimRsaKeySize,
  DkimKeyPair,
  DkimKeyGenOptions,
  DkimRotationPlan,
  TlsVersion,
  CsrResult,
  CsrOptions,
  CertificateInfo,
  CertificateChainValidation,
  EncryptionAlgorithm,
  EnvelopeScheme,
  EncryptedPayload,
  EncryptionKey,
  EnvelopeEncryptOptions,
  EnvelopeEncryptedMessage,
  HashAlgorithm,
  HmacAlgorithm,
  Argon2Params,
  HashedPassword,
} from "./types.js";

// DKIM
export {
  generateDkimKeyPair,
  formatDkimDnsRecord,
  dkimDnsName,
  createRotationPlan,
  generateSelector,
} from "./dkim.js";

// TLS
export {
  fingerprint256,
  parseCertificate,
  validateCertificateChain,
  generateCsr,
  expiresWithin,
} from "./tls.js";

// Encryption
export {
  generateEncryptionKey,
  encryptContent,
  decryptContent,
  envelopeEncrypt,
} from "./encryption.js";

// Secrets at rest (single implementation — see secret-box.ts)
export {
  sealSecret,
  sealSecretOrNull,
  openSecret,
  openSecretOrNull,
  openSecretSafe,
  isSealed,
} from "./secret-box.js";

// Hashing
export {
  hash,
  sha256,
  sha512,
  hmac,
  hmacRaw,
  constantTimeEqual,
  hashPassword,
  verifyPassword,
  generateToken,
} from "./hashing.js";
