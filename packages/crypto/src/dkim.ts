/**
 * DKIM key generation, DNS record formatting, and key rotation helpers.
 *
 * Supports RSA-SHA256 and Ed25519-SHA256 per RFC 6376 and RFC 8463.
 */
import { generateKeyPair as nodeGenerateKeyPair } from "node:crypto";
import { promisify } from "node:util";

import { ok, err } from "@emailed/shared";
import type { Result } from "@emailed/shared";

import type {
  DkimAlgorithm,
  DkimKeyGenOptions,
  DkimKeyPair,
  DkimRotationPlan,
} from "./types.js";

const generateKeyPairAsync = promisify(nodeGenerateKeyPair);

/**
 * Strip PEM headers/footers and collapse to a single line for DNS TXT records.
 */
function pemToBase64(pem: string): string {
  return pem
    .replace(/-----BEGIN [A-Z ]+-----/g, "")
    .replace(/-----END [A-Z ]+-----/g, "")
    .replace(/\s+/g, "");
}

/**
 * Build the DNS TXT record name for a DKIM selector.
 *
 * @returns `<selector>._domainkey.<domain>`
 */
export function dkimDnsName(selector: string, domain: string): string {
  return `${selector}._domainkey.${domain}`;
}

/**
 * Format a public key into a DKIM DNS TXT record value.
 *
 * @param publicKeyPem  PEM-encoded public key
 * @param algorithm     DKIM algorithm identifier
 * @returns DNS TXT record value (e.g. `v=DKIM1; k=rsa; p=MIGfMA0...`)
 */
export function formatDkimDnsRecord(
  publicKeyPem: string,
  algorithm: DkimAlgorithm,
): string {
  const keyType = algorithm === "ed25519-sha256" ? "ed25519" : "rsa";
  const base64Key = pemToBase64(publicKeyPem);
  return `v=DKIM1; k=${keyType}; p=${base64Key}`;
}

/**
 * Generate a DKIM key pair.
 *
 * @param options  Key generation parameters
 * @returns A `Result` containing the key pair or an error
 */
export async function generateDkimKeyPair(
  options: DkimKeyGenOptions,
): Promise<Result<DkimKeyPair>> {
  const {
    selector,
    domain,
    algorithm = "rsa-sha256",
    rsaKeySize = 2048,
  } = options;

  try {
    let privateKey: string;
    let publicKey: string;

    if (algorithm === "ed25519-sha256") {
      const pair = await generateKeyPairAsync("ed25519", {
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      privateKey = pair.privateKey;
      publicKey = pair.publicKey;
    } else {
      const pair = await generateKeyPairAsync("rsa", {
        modulusLength: rsaKeySize,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      privateKey = pair.privateKey;
      publicKey = pair.publicKey;
    }

    const dnsRecord = formatDkimDnsRecord(publicKey, algorithm);
    const dnsName = dkimDnsName(selector, domain);

    return ok({
      selector,
      domain,
      algorithm,
      privateKey,
      publicKey,
      dnsRecord,
      dnsName,
      createdAt: new Date(),
    });
  } catch (error) {
    return err(
      error instanceof Error
        ? error
        : new Error(`DKIM key generation failed: ${String(error)}`),
    );
  }
}

/**
 * Create a rotation plan for transitioning from one DKIM selector to another.
 *
 * During the overlap period both selectors are valid, allowing DNS caches to
 * update before the old key is removed.
 *
 * @param currentSelector  The currently active selector
 * @param domain           The signing domain
 * @param algorithm        Key algorithm for the new selector
 * @param overlapSeconds   Seconds both selectors remain valid (default 86400 = 24h)
 * @returns A rotation plan with timing information
 */
export function createRotationPlan(
  currentSelector: string,
  domain: string,
  algorithm: DkimAlgorithm = "rsa-sha256",
  overlapSeconds: number = 86400,
): DkimRotationPlan {
  const timestamp = Math.floor(Date.now() / 1000);
  const nextSelector = `${domain.replace(/\./g, "")}-${timestamp}`;

  return {
    currentSelector,
    nextSelector,
    domain,
    algorithm,
    overlapSeconds,
    rotateAt: new Date(Date.now() + overlapSeconds * 1000),
  };
}

/**
 * Generate a new selector name based on the current date.
 *
 * Format: `YYYYMM` (e.g. "202604").
 */
export function generateSelector(prefix?: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const base = `${year}${month}`;
  return prefix ? `${prefix}-${base}` : base;
}
