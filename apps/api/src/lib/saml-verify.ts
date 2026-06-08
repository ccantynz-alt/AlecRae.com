/**
 * SAML Response Verification — XML Digital Signature (XML-DSig) validation.
 *
 * Security-critical: this is what stands between a forged SAML response and a
 * minted session JWT. We do NOT trust any certificate embedded in the incoming
 * assertion — we verify the signature against the IdP certificate that the
 * account explicitly configured (`config.certificate`). If the signature is
 * missing, malformed, computed with a key other than the configured cert, or
 * the assertion's time conditions / audience do not hold, verification fails.
 *
 * Uses the `xml-crypto` library (node-saml) — the standard for SAML XML-DSig.
 */

import { SignedXml } from "xml-crypto";

// ─── Result types ──────────────────────────────────────────────────────────────

export interface SamlVerifyOptions {
  /** PEM or bare-base64 X.509 certificate configured for the IdP. */
  certificate: string;
  /** Expected SP entityId (audience). When provided, the assertion's
   *  AudienceRestriction (if present) must contain this value. */
  expectedAudience?: string;
  /** Clock skew tolerance, in seconds, for NotBefore / NotOnOrAfter. */
  clockSkewSeconds?: number;
  /** Current time, injectable for testing. Defaults to `new Date()`. */
  now?: Date;
}

export type SamlVerifyResult =
  | { ok: true }
  | { ok: false; code: SamlVerifyErrorCode; message: string };

export type SamlVerifyErrorCode =
  | "no_certificate"
  | "no_signature"
  | "invalid_signature"
  | "no_signed_references"
  | "condition_not_yet_valid"
  | "condition_expired"
  | "audience_mismatch";

// ─── Certificate normalization ──────────────────────────────────────────────────

/**
 * Normalize a configured certificate into PEM form. IdP metadata often stores
 * the cert as bare base64 DER (no PEM armor); xml-crypto wants PEM.
 */
function toPem(cert: string): string {
  const trimmed = cert.trim();
  if (trimmed.includes("-----BEGIN CERTIFICATE-----")) {
    return trimmed;
  }
  const body = trimmed.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [body];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

// ─── Signature extraction ───────────────────────────────────────────────────────

/**
 * Extract the (first) `<Signature>` element XML from a SAML document via a
 * namespace-agnostic match. xml-crypto's `loadSignature` accepts this string.
 * We deliberately pull the signature out of the document rather than trusting
 * `findSignatures`, so we can fail closed when none is present.
 */
function extractSignatureXml(xml: string): string | null {
  const match = xml.match(
    /<(?:[\w-]+:)?Signature[\s>][\s\S]*?<\/(?:[\w-]+:)?Signature>/,
  );
  return match?.[0] ?? null;
}

// ─── Condition / audience validation ────────────────────────────────────────────

function parseInstant(value: string): number | null {
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function validateConditions(
  xml: string,
  nowMs: number,
  skewMs: number,
  expectedAudience: string | undefined,
): SamlVerifyResult {
  const conditionsMatch = xml.match(
    /<(?:[\w-]+:)?Conditions\b([^>]*)>([\s\S]*?)<\/(?:[\w-]+:)?Conditions>/,
  );
  const conditionsAttrs = conditionsMatch?.[1] ?? "";
  const conditionsBody = conditionsMatch?.[2] ?? "";

  const notBefore = conditionsAttrs.match(/NotBefore="([^"]+)"/)?.[1];
  const notOnOrAfter = conditionsAttrs.match(/NotOnOrAfter="([^"]+)"/)?.[1];

  if (notBefore) {
    const nb = parseInstant(notBefore);
    if (nb !== null && nowMs + skewMs < nb) {
      return {
        ok: false,
        code: "condition_not_yet_valid",
        message: "SAML assertion is not yet valid (NotBefore in the future)",
      };
    }
  }

  if (notOnOrAfter) {
    const na = parseInstant(notOnOrAfter);
    if (na !== null && nowMs - skewMs >= na) {
      return {
        ok: false,
        code: "condition_expired",
        message: "SAML assertion has expired (NotOnOrAfter in the past)",
      };
    }
  }

  // Audience: only enforced when both an expected audience is configured AND the
  // assertion declares an AudienceRestriction.
  if (expectedAudience && /<(?:[\w-]+:)?AudienceRestriction\b/.test(conditionsBody)) {
    const audiences = [...conditionsBody.matchAll(
      /<(?:[\w-]+:)?Audience\b[^>]*>([^<]+)<\/(?:[\w-]+:)?Audience>/g,
    )].map((m) => m[1]?.trim());
    if (!audiences.includes(expectedAudience)) {
      return {
        ok: false,
        code: "audience_mismatch",
        message: "SAML assertion audience does not match the configured SP entityId",
      };
    }
  }

  return { ok: true };
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Verify the XML-DSig signature of a decoded SAML Response/Assertion against the
 * configured IdP certificate, and validate its time conditions + audience.
 *
 * The signature is verified using ONLY `options.certificate` — any certificate
 * embedded in the incoming document is ignored, so an attacker cannot self-sign.
 */
export function verifySamlSignature(
  xml: string,
  options: SamlVerifyOptions,
): SamlVerifyResult {
  if (!options.certificate || options.certificate.trim().length === 0) {
    return {
      ok: false,
      code: "no_certificate",
      message: "No IdP certificate configured for signature verification",
    };
  }

  const signatureXml = extractSignatureXml(xml);
  if (!signatureXml) {
    return {
      ok: false,
      code: "no_signature",
      message: "SAML response is not signed (no Signature element)",
    };
  }

  const pem = toPem(options.certificate);

  const sig = new SignedXml({ publicCert: pem });
  // Pin verification to the configured cert only — never trust KeyInfo from the
  // incoming document.
  sig.getCertFromKeyInfo = (): string => pem;

  try {
    sig.loadSignature(signatureXml);
  } catch (err) {
    return {
      ok: false,
      code: "invalid_signature",
      message: `Failed to load SAML signature: ${(err as Error).message}`,
    };
  }

  let isValid: boolean;
  try {
    isValid = sig.checkSignature(xml);
  } catch (err) {
    return {
      ok: false,
      code: "invalid_signature",
      message: `SAML signature verification failed: ${(err as Error).message}`,
    };
  }

  if (!isValid) {
    return {
      ok: false,
      code: "invalid_signature",
      message: "SAML signature is invalid or does not match the configured IdP certificate",
    };
  }

  // Ensure the signature actually covered content (defends against
  // signature-wrapping where a valid-but-empty signature is attached).
  if (sig.getSignedReferences().length === 0) {
    return {
      ok: false,
      code: "no_signed_references",
      message: "SAML signature did not cover any document references",
    };
  }

  const nowMs = (options.now ?? new Date()).getTime();
  const skewMs = (options.clockSkewSeconds ?? 60) * 1000;
  return validateConditions(xml, nowMs, skewMs, options.expectedAudience);
}
