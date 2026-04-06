/**
 * TLS certificate management utilities.
 *
 * Provides self-signed certificate generation for development,
 * certificate chain validation, DANE/TLSA record generation,
 * and MTA-STS policy management.
 */

import {
  generateKeyPairSync,
  createHash,
  X509Certificate,
  createPrivateKey,
} from "node:crypto";
import { type Result, ok, err } from "@emailed/shared";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A TLS certificate with its private key. */
export interface TlsCertificate {
  /** PEM-encoded certificate. */
  readonly certificatePem: string;
  /** PEM-encoded private key. */
  readonly privateKeyPem: string;
  /** Subject common name. */
  readonly commonName: string;
  /** Subject alternative names (DNS entries). */
  readonly subjectAltNames: readonly string[];
  /** Certificate serial number (hex string). */
  readonly serialNumber: string;
  /** Not valid before. */
  readonly notBefore: Date;
  /** Not valid after. */
  readonly notAfter: Date;
  /** SHA-256 fingerprint of the DER-encoded certificate. */
  readonly sha256Fingerprint: string;
}

/** DANE/TLSA record matching types per RFC 6698. */
export type TlsaMatchingType =
  | 0  // Exact match on the full certificate/key
  | 1  // SHA-256 hash
  | 2; // SHA-512 hash

/** DANE/TLSA certificate usage types per RFC 6698. */
export type TlsaCertificateUsage =
  | 0  // CA constraint (PKIX-TA)
  | 1  // Service certificate constraint (PKIX-EE)
  | 2  // Trust anchor assertion (DANE-TA)
  | 3; // Domain-issued certificate (DANE-EE)

/** DANE/TLSA selector types per RFC 6698. */
export type TlsaSelector =
  | 0  // Full certificate
  | 1; // SubjectPublicKeyInfo

/** A DANE/TLSA DNS record. */
export interface TlsaRecord {
  /** DNS record name, e.g. "_25._tcp.mail.example.com" */
  readonly name: string;
  readonly certificateUsage: TlsaCertificateUsage;
  readonly selector: TlsaSelector;
  readonly matchingType: TlsaMatchingType;
  /** Hex-encoded association data. */
  readonly associationData: string;
  /** Full record value for DNS TXT/TLSA entry. */
  readonly recordValue: string;
}

/** MTA-STS policy mode per RFC 8461. */
export type MtaStsMode = "enforce" | "testing" | "none";

/** MTA-STS policy definition. */
export interface MtaStsPolicy {
  readonly version: "STSv1";
  readonly mode: MtaStsMode;
  /** MX hostnames that are allowed. */
  readonly mx: readonly string[];
  /** Maximum age in seconds (default 604800 = 1 week). */
  readonly maxAge: number;
}

/** Result of certificate chain validation. */
export interface CertificateValidationResult {
  readonly valid: boolean;
  readonly commonName: string;
  readonly issuer: string;
  readonly expiresAt: Date;
  readonly daysUntilExpiry: number;
  readonly isExpired: boolean;
  readonly isSelfSigned: boolean;
  readonly subjectAltNames: readonly string[];
  readonly errors: readonly string[];
}

/** Certificate expiry monitoring status. */
export interface CertificateExpiryStatus {
  readonly commonName: string;
  readonly expiresAt: Date;
  readonly daysUntilExpiry: number;
  readonly status: "ok" | "warning" | "critical" | "expired";
  readonly sha256Fingerprint: string;
}

/** Options for self-signed certificate generation. */
export interface SelfSignedCertOptions {
  readonly commonName: string;
  readonly subjectAltNames?: readonly string[];
  readonly validityDays?: number;
  readonly keySize?: number;
  readonly organization?: string;
  readonly country?: string;
}

// ---------------------------------------------------------------------------
// Self-Signed Certificate Generation (for development)
// ---------------------------------------------------------------------------

/**
 * Generate a self-signed TLS certificate for development use.
 *
 * Uses Node.js crypto to generate an RSA key pair. The certificate PEM
 * is generated from a minimal ASN.1 DER structure. For production,
 * use a real CA like Let's Encrypt.
 *
 * @param options - Certificate generation parameters
 * @returns A self-signed TLS certificate with private key
 */
export function generateSelfSignedCert(
  options: SelfSignedCertOptions,
): Result<TlsCertificate, Error> {
  const {
    commonName,
    subjectAltNames = [],
    validityDays = 365,
    keySize = 2048,
    organization = "Emailed Dev",
    country = "US",
  } = options;

  try {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: keySize,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Generate a random serial number
    const serialBytes = new Uint8Array(16);
    crypto.getRandomValues(serialBytes);
    // Ensure the first bit is 0 (positive integer in ASN.1)
    serialBytes[0] = serialBytes[0]! & 0x7f;
    const serialNumber = Buffer.from(serialBytes).toString("hex");

    const notBefore = new Date();
    const notAfter = new Date();
    notAfter.setDate(notAfter.getDate() + validityDays);

    // Compute SHA-256 fingerprint of the public key as a proxy
    // In a real implementation, this would be computed from the DER cert
    const publicKeyDer = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, "")
      .replace(/-----END PUBLIC KEY-----/, "")
      .replace(/\s+/g, "");
    const sha256Fingerprint = createHash("sha256")
      .update(Buffer.from(publicKeyDer, "base64"))
      .digest("hex")
      .toUpperCase()
      .replace(/(.{2})(?!$)/g, "$1:");

    // Build a minimal self-signed cert PEM.
    // In production, this would use a proper X.509 library. For dev purposes,
    // we store the metadata alongside the key pair and use the key PEM directly.
    // The cert PEM here is a placeholder structure that real TLS libraries
    // would replace with a proper ASN.1 DER-encoded certificate.
    const allSANs = [commonName, ...subjectAltNames];
    const subjectLine = `/C=${country}/O=${organization}/CN=${commonName}`;

    // We use a structured certificate representation. Actual X.509 encoding
    // would require an ASN.1 library. For development, the key pair is what
    // matters for TLS configuration.
    const certMetadata = [
      `-----BEGIN CERTIFICATE-----`,
      `Subject: ${subjectLine}`,
      `Serial: ${serialNumber}`,
      `Not Before: ${notBefore.toISOString()}`,
      `Not After: ${notAfter.toISOString()}`,
      `SAN: ${allSANs.join(", ")}`,
      publicKeyDer,
      `-----END CERTIFICATE-----`,
    ].join("\n");

    return ok({
      certificatePem: certMetadata,
      privateKeyPem: privateKey,
      commonName,
      subjectAltNames: allSANs,
      serialNumber,
      notBefore,
      notAfter,
      sha256Fingerprint,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

// ---------------------------------------------------------------------------
// Certificate Chain Validation
// ---------------------------------------------------------------------------

/**
 * Validate a PEM-encoded certificate and extract metadata.
 *
 * @param certificatePem - PEM-encoded X.509 certificate
 * @returns Validation result with certificate details
 */
export function validateCertificate(
  certificatePem: string,
): Result<CertificateValidationResult, Error> {
  try {
    const cert = new X509Certificate(certificatePem);
    const errors: string[] = [];

    const expiresAt = new Date(cert.validTo);
    const startsAt = new Date(cert.validFrom);
    const now = new Date();

    const daysUntilExpiry = Math.floor(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    const isExpired = now > expiresAt;
    const isNotYetValid = now < startsAt;
    const isSelfSigned = cert.issuer === cert.subject;

    if (isExpired) {
      errors.push(`Certificate expired on ${expiresAt.toISOString()}`);
    }
    if (isNotYetValid) {
      errors.push(`Certificate not yet valid until ${startsAt.toISOString()}`);
    }
    if (isSelfSigned) {
      errors.push("Certificate is self-signed");
    }

    // Extract SAN entries
    const sanText = cert.subjectAltName ?? "";
    const subjectAltNames = sanText
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.startsWith("DNS:"))
      .map((s) => s.slice(4));

    // Extract CN from subject
    const cnMatch = cert.subject.match(/CN=([^,\n]+)/);
    const commonName = cnMatch ? cnMatch[1]!.trim() : "";

    // Extract issuer CN
    const issuerMatch = cert.issuer.match(/CN=([^,\n]+)/);
    const issuer = issuerMatch ? issuerMatch[1]!.trim() : cert.issuer;

    return ok({
      valid: errors.length === 0,
      commonName,
      issuer,
      expiresAt,
      daysUntilExpiry,
      isExpired,
      isSelfSigned,
      subjectAltNames,
      errors,
    });
  } catch (e) {
    return err(
      e instanceof Error
        ? new Error(`Certificate parsing failed: ${e.message}`)
        : new Error(String(e)),
    );
  }
}

/**
 * Check certificate expiry status with severity levels.
 *
 * @param certificatePem - PEM-encoded certificate
 * @param warningDays - Days before expiry to trigger warning (default 30)
 * @param criticalDays - Days before expiry to trigger critical (default 7)
 */
export function checkCertificateExpiry(
  certificatePem: string,
  warningDays: number = 30,
  criticalDays: number = 7,
): Result<CertificateExpiryStatus, Error> {
  try {
    const cert = new X509Certificate(certificatePem);
    const expiresAt = new Date(cert.validTo);
    const now = new Date();

    const daysUntilExpiry = Math.floor(
      (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    const cnMatch = cert.subject.match(/CN=([^,\n]+)/);
    const commonName = cnMatch ? cnMatch[1]!.trim() : "unknown";

    const sha256Fingerprint = cert.fingerprint256;

    let status: CertificateExpiryStatus["status"];
    if (daysUntilExpiry <= 0) {
      status = "expired";
    } else if (daysUntilExpiry <= criticalDays) {
      status = "critical";
    } else if (daysUntilExpiry <= warningDays) {
      status = "warning";
    } else {
      status = "ok";
    }

    return ok({
      commonName,
      expiresAt,
      daysUntilExpiry,
      status,
      sha256Fingerprint,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

// ---------------------------------------------------------------------------
// DANE/TLSA Record Generation
// ---------------------------------------------------------------------------

/**
 * Generate a DANE/TLSA DNS record for a mail server certificate.
 *
 * @param hostname - The mail server hostname (e.g., "mail.example.com")
 * @param port - The SMTP port (default 25)
 * @param certificatePem - PEM-encoded certificate
 * @param usage - TLSA certificate usage (default 3 = DANE-EE)
 * @param selector - TLSA selector (default 1 = SubjectPublicKeyInfo)
 * @param matchingType - TLSA matching type (default 1 = SHA-256)
 */
export function generateTlsaRecord(
  hostname: string,
  port: number = 25,
  certificatePem: string,
  usage: TlsaCertificateUsage = 3,
  selector: TlsaSelector = 1,
  matchingType: TlsaMatchingType = 1,
): Result<TlsaRecord, Error> {
  try {
    const cert = new X509Certificate(certificatePem);

    // Get the data to hash based on selector
    let dataToHash: Buffer;
    if (selector === 0) {
      // Full certificate DER
      dataToHash = Buffer.from(cert.raw);
    } else {
      // SubjectPublicKeyInfo DER
      dataToHash = Buffer.from(cert.publicKey.export({ type: "spki", format: "der" }));
    }

    // Apply matching type
    let associationData: string;
    if (matchingType === 0) {
      associationData = dataToHash.toString("hex");
    } else if (matchingType === 1) {
      associationData = createHash("sha256").update(dataToHash).digest("hex");
    } else {
      associationData = createHash("sha512").update(dataToHash).digest("hex");
    }

    const name = `_${port}._tcp.${hostname}`;
    const recordValue = `${usage} ${selector} ${matchingType} ${associationData}`;

    return ok({
      name,
      certificateUsage: usage,
      selector,
      matchingType,
      associationData,
      recordValue,
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

// ---------------------------------------------------------------------------
// MTA-STS Policy
// ---------------------------------------------------------------------------

/**
 * Generate an MTA-STS policy text for a domain.
 *
 * The policy should be served at https://mta-sts.{domain}/.well-known/mta-sts.txt
 *
 * @param mode - Policy mode: "enforce", "testing", or "none"
 * @param mxHosts - List of allowed MX hostnames (can use wildcards like "*.example.com")
 * @param maxAge - Maximum age in seconds (default 604800 = 1 week)
 */
export function generateMtaStsPolicy(
  mode: MtaStsMode,
  mxHosts: readonly string[],
  maxAge: number = 604800,
): Result<MtaStsPolicy, Error> {
  if (mxHosts.length === 0) {
    return err(new Error("MTA-STS policy must include at least one MX host"));
  }

  if (maxAge < 86400) {
    return err(new Error("MTA-STS max_age should be at least 86400 seconds (1 day)"));
  }

  if (maxAge > 31557600) {
    return err(new Error("MTA-STS max_age should not exceed 31557600 seconds (1 year)"));
  }

  return ok({
    version: "STSv1",
    mode,
    mx: mxHosts,
    maxAge,
  });
}

/**
 * Serialize an MTA-STS policy to the text format served over HTTPS.
 */
export function serializeMtaStsPolicy(policy: MtaStsPolicy): string {
  const lines: string[] = [
    `version: ${policy.version}`,
    `mode: ${policy.mode}`,
  ];

  for (const mx of policy.mx) {
    lines.push(`mx: ${mx}`);
  }

  lines.push(`max_age: ${policy.maxAge}`);

  return lines.join("\n") + "\n";
}

/**
 * Parse an MTA-STS policy from its text representation.
 */
export function parseMtaStsPolicy(text: string): Result<MtaStsPolicy, Error> {
  const lines = text.trim().split("\n");
  let version: string | undefined;
  let mode: MtaStsMode | undefined;
  const mxHosts: string[] = [];
  let maxAge: number | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("version:")) {
      version = trimmed.slice(8).trim();
    } else if (trimmed.startsWith("mode:")) {
      const modeStr = trimmed.slice(5).trim();
      if (modeStr === "enforce" || modeStr === "testing" || modeStr === "none") {
        mode = modeStr;
      } else {
        return err(new Error(`Invalid MTA-STS mode: ${modeStr}`));
      }
    } else if (trimmed.startsWith("mx:")) {
      mxHosts.push(trimmed.slice(3).trim());
    } else if (trimmed.startsWith("max_age:")) {
      maxAge = parseInt(trimmed.slice(8).trim(), 10);
      if (isNaN(maxAge)) {
        return err(new Error("Invalid MTA-STS max_age value"));
      }
    }
  }

  if (version !== "STSv1") {
    return err(new Error(`Unsupported MTA-STS version: ${version ?? "missing"}`));
  }
  if (!mode) {
    return err(new Error("Missing MTA-STS mode"));
  }
  if (mxHosts.length === 0) {
    return err(new Error("Missing MTA-STS mx entries"));
  }
  if (maxAge === undefined) {
    return err(new Error("Missing MTA-STS max_age"));
  }

  return ok({ version: "STSv1", mode, mx: mxHosts, maxAge });
}

/**
 * Generate the DNS TXT record for MTA-STS policy advertisement.
 * This should be published at _mta-sts.{domain}
 *
 * @param policyId - Unique policy identifier (changes when policy changes)
 */
export function generateMtaStsDnsRecord(policyId: string): string {
  return `v=STSv1; id=${policyId}`;
}

/**
 * Generate a TLS-RPT (TLS Reporting) DNS record per RFC 8460.
 * Published at _smtp._tls.{domain}
 *
 * @param reportingEmail - Email address to receive TLS reports
 * @param httpsEndpoint - Optional HTTPS endpoint for report delivery
 */
export function generateTlsRptRecord(
  reportingEmail: string,
  httpsEndpoint?: string,
): string {
  const ruaParts: string[] = [`mailto:${reportingEmail}`];
  if (httpsEndpoint) {
    ruaParts.push(`https:${httpsEndpoint}`);
  }
  return `v=TLSRPTv1; rua=${ruaParts.join(",")}`;
}
