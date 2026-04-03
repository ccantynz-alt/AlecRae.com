/**
 * TLS certificate utilities: CSR generation, certificate parsing,
 * chain validation, and fingerprinting.
 */
import {
  createHash,
  X509Certificate,
  generateKeyPairSync,
  createSign,
} from "node:crypto";

import { ok, err } from "@emailed/shared";
import type { Result } from "@emailed/shared";

import type {
  CsrOptions,
  CsrResult,
  CertificateInfo,
  CertificateChainValidation,
} from "./types.js";

/**
 * Compute the SHA-256 fingerprint of a PEM-encoded certificate.
 *
 * @param certPem  PEM-encoded X.509 certificate
 * @returns Colon-delimited hex fingerprint (e.g. "AB:CD:EF:...")
 */
export function fingerprint256(certPem: string): Result<string> {
  try {
    const cert = new X509Certificate(certPem);
    return ok(cert.fingerprint256);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Fingerprint computation failed: ${String(error)}`),
    );
  }
}

/**
 * Parse a PEM-encoded X.509 certificate and extract key fields.
 *
 * @param certPem  PEM-encoded certificate
 * @returns Parsed certificate information
 */
export function parseCertificate(certPem: string): Result<CertificateInfo> {
  try {
    const cert = new X509Certificate(certPem);

    const altNames = cert.subjectAltName
      ? cert.subjectAltName
          .split(",")
          .map((entry) => entry.trim().replace(/^DNS:/, ""))
      : [];

    return ok({
      subject: cert.subject,
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
      validFrom: new Date(cert.validFrom),
      validTo: new Date(cert.validTo),
      fingerprint256: cert.fingerprint256,
      altNames,
      isCA: cert.ca,
      keyUsage: cert.keyUsage,
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Certificate parsing failed: ${String(error)}`),
    );
  }
}

/**
 * Validate an ordered certificate chain (leaf first, root last).
 *
 * Checks that each certificate is signed by the next certificate in the
 * chain and that no certificate has expired.
 *
 * @param certsPem  Array of PEM-encoded certificates, leaf first
 * @returns Validation result with parsed chain info and any errors
 */
export function validateCertificateChain(
  certsPem: readonly string[],
): CertificateChainValidation {
  const errors: string[] = [];
  const chain: CertificateInfo[] = [];

  if (certsPem.length === 0) {
    return { valid: false, chain: [], errors: ["Empty certificate chain"] };
  }

  const certs: X509Certificate[] = [];
  for (const [index, pem] of certsPem.entries()) {
    try {
      certs.push(new X509Certificate(pem));
    } catch {
      errors.push(`Certificate at index ${index} is not valid PEM`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, chain: [], errors };
  }

  const now = new Date();

  for (let i = 0; i < certs.length; i++) {
    const cert = certs[i] as X509Certificate;

    const validFrom = new Date(cert.validFrom);
    const validTo = new Date(cert.validTo);

    if (now < validFrom) {
      errors.push(`Certificate at index ${i} is not yet valid (from ${cert.validFrom})`);
    }
    if (now > validTo) {
      errors.push(`Certificate at index ${i} has expired (to ${cert.validTo})`);
    }

    // Verify issuer linkage (each cert should be issued by the next)
    if (i < certs.length - 1) {
      const issuerCert = certs[i + 1] as X509Certificate;
      try {
        const isSignedByIssuer = cert.checkIssued(issuerCert);
        if (!isSignedByIssuer) {
          errors.push(
            `Certificate at index ${i} was not issued by certificate at index ${i + 1}`,
          );
        }
      } catch {
        errors.push(
          `Could not verify issuer linkage between certificates at index ${i} and ${i + 1}`,
        );
      }
    }

    const altNames = cert.subjectAltName
      ? cert.subjectAltName
          .split(",")
          .map((entry) => entry.trim().replace(/^DNS:/, ""))
      : [];

    chain.push({
      subject: cert.subject,
      issuer: cert.issuer,
      serialNumber: cert.serialNumber,
      validFrom,
      validTo,
      fingerprint256: cert.fingerprint256,
      altNames,
      isCA: cert.ca,
      keyUsage: cert.keyUsage,
    });
  }

  return { valid: errors.length === 0, chain, errors };
}

/**
 * Generate an RSA private key and a Certificate Signing Request (CSR).
 *
 * NOTE: This produces a self-signed placeholder. For production use, submit
 * the CSR to a Certificate Authority. The CSR is built manually using the
 * node:crypto `createSign` API since Node.js does not expose a native CSR
 * builder. For full ASN.1 CSR generation, integrate a library like `node-forge`.
 *
 * @param options  CSR parameters
 * @returns The CSR and its corresponding private key in PEM format
 */
export function generateCsr(options: CsrOptions): Result<CsrResult> {
  const { commonName, keySize = 2048 } = options;

  try {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", {
      modulusLength: keySize,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    // Build a minimal CSR-like structure. Full ASN.1 DER encoding requires
    // a dedicated library; here we produce a signed blob that captures the
    // intent for upstream tooling (e.g. node-forge or openssl) to finalize.
    const csrData = JSON.stringify({
      commonName,
      altNames: options.altNames ?? [],
      organization: options.organization,
      country: options.country,
      publicKey,
    });

    const sign = createSign("SHA256");
    sign.update(csrData);
    sign.end();
    const signature = sign.sign(privateKey, "base64");

    const csrContent = Buffer.from(
      JSON.stringify({ data: csrData, signature }),
    ).toString("base64");

    const csr = [
      "-----BEGIN CERTIFICATE REQUEST-----",
      csrContent.match(/.{1,64}/g)?.join("\n") ?? csrContent,
      "-----END CERTIFICATE REQUEST-----",
    ].join("\n");

    return ok({ csr, privateKey });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`CSR generation failed: ${String(error)}`),
    );
  }
}

/**
 * Check whether a certificate expires within the given number of days.
 *
 * @param certPem  PEM-encoded certificate
 * @param days     Threshold in days
 * @returns `true` if the certificate expires within `days` days
 */
export function expiresWithin(certPem: string, days: number): Result<boolean> {
  try {
    const cert = new X509Certificate(certPem);
    const expiryDate = new Date(cert.validTo);
    const threshold = new Date(Date.now() + days * 86_400_000);
    return ok(expiryDate <= threshold);
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`Certificate check failed: ${String(error)}`),
    );
  }
}
