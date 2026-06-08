/**
 * SAML signature verification tests (Security fix S1).
 *
 * Proves that `verifySamlSignature` (used by POST /v1/sso/acs):
 *   1. ACCEPTS a SAML response validly signed by the configured IdP cert.
 *   2. REJECTS an unsigned SAML response.
 *   3. REJECTS a signed-then-tampered SAML response.
 *   4. REJECTS a response signed by a different (untrusted) key.
 *   5. REJECTS valid signatures whose assertion time conditions have expired.
 *   6. REJECTS an audience mismatch when an AudienceRestriction is present.
 *
 * Without this verification, anyone could POST a forged SAML response to
 * /v1/sso/acs and mint a session JWT for any email (auth bypass).
 */

import { describe, it, expect } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { SignedXml } from "xml-crypto";
import { verifySamlSignature } from "../src/lib/saml-verify.js";

// ── Test IdP key material (self-signed, for tests only) ──────────────────────

const IDP_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC0Bx4ssLqfnlq4
VjmytALB6NYHTmcqUIrP/qv5hFN35WT0GEzsniFxCRCbx6amHFgtOJkY4QCmKLcn
gNDrahom0dDxIZoGlu7h635ehRDoldMEy6zxfPHYVbTP6axTnRm6YBvmx6EiQOLk
98nT6kR6/FJaWAWBoduBzTABAw5CxbX2BkJ6XOREhShUjFg02JkVmhso0ZhA/Ad1
K+eT5fMdflM4t/GTqiflYpde/DYe1Pl18Kh1RfrE33GljEyKws2TmaQbZxDukybU
PEsKW7P3wE8Dgn8iTDxHLUU5Ipi/9ZlIj2bFhpy8oSdU21IToIOFWFNVQ1rZZzok
f7AuAp0bAgMBAAECggEAA3iFqOfpWS1040vqRds5mGJ0SeTFkWfHHVZ0G1XlRBD8
nsYfKYqs62B43P/+4wH14z1NmlCwMgPj8BOIM5mykmAGLrfun8TmKx3erFTVbB6D
WHrSxT8a7IhOeZmwNFZ5igHTV+IuZZoppa9vSTIhitt1fP9ob8TelgSOMd7MthXQ
coCnvke89/CjzRTG3BguU4hlO1amvezE7OEg6JLWA/2oeB9ggxclyuoYFUzdHN03
f9gcZOBlH1oS4vRfAEqsqAKoCcqqv8TDKQXDFER1128VsUMRDz6sDyTUTtZ832xw
WAfBQEFY+JCt+Qtesi2uPr1KZ90iCY6LKUQIQDZwkQKBgQDZL6kSZ43X0vlz5BGj
z/mlwfbu53zZiRHY3vSVWwsQFilTqv2VypOT0ws2BH/nVsbdp258rBTSzIS6KNZu
xYHY7xYN1zRLLMgAQCz/XTqpFcbAZT8MNQcgdl80nKM0dHaODYxRvqKouxdyaLpa
ceDZ5SC12E8K/izSR8GuvP+isQKBgQDUM3MfETEP9AF5iS6iyvqfgOBO2rtaAUIL
Z0zxOzyhAySu9WUiDDi9/+02UeKk8lWOkusTX6yMAqXWYTROFfV+R6eKbJPqpTkU
/qY4hgRZ0kmQKzqR9vLJY9KIOD8FFdeh4O5b1nI9+hyxopzQ0maHZpEj48WhRJHj
zEqdZyV3iwKBgQCGL18rYtWNMekzhAauCjH5CpTxWA6YLIrdTisZGC4Gm1qfOfcB
FC8H1w2HK1KG8ONfUTH/TyZycy/SAKczu02VZWpf1MWXaKyNExl6EPTMQQsSFbvV
Y/HqSZha3igroYUaER7P5pOC4k0DP9dbSB6fIWSLVYDIju/MX883kcfzkQKBgQCh
/2UzonxCIZW+ouvne+45NroHeRTucWdqLUKgJwjyIuQubUj35TysUGVXwsu0AQ0v
+xlbgP7JJHxWXX8A3eK8tRdCpgGGcPxS+tUK8cUAjXl7hoUASfavqHVhaQ8zYqlr
+7v8gIpWpkqhkfMFuJptY/AJ5ilKJH772UpdQBFqYQKBgDvwb96klrotg+BG7oJb
79c0m90BrHywiHIb1424BHPlMWbsRxUFwJiOEhZ18fj44rvDOObVCtFCaqIB8oL9
OGzVE5leEpk8EUt0kv1am/GmfVdoJqHlY1/t/W7r9MXUPwbo1fqx/Z0/GD48otAN
bfZjx5bL9BHA0dBq8jp4SJbG
-----END PRIVATE KEY-----`;

const IDP_CERT = `-----BEGIN CERTIFICATE-----
MIIDIzCCAgugAwIBAgIUf0nmpxVBBQoYqwZo7JZDnDLiPjYwDQYJKoZIhvcNAQEL
BQAwIDEeMBwGA1UEAwwVdGVzdC1pZHAuYWxlY3JhZS50ZXN0MCAXDTI2MDYwODA1
MTQwMFoYDzIxMjYwNTE1MDUxNDAwWjAgMR4wHAYDVQQDDBV0ZXN0LWlkcC5hbGVj
cmFlLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQC0Bx4ssLqf
nlq4VjmytALB6NYHTmcqUIrP/qv5hFN35WT0GEzsniFxCRCbx6amHFgtOJkY4QCm
KLcngNDrahom0dDxIZoGlu7h635ehRDoldMEy6zxfPHYVbTP6axTnRm6YBvmx6Ei
QOLk98nT6kR6/FJaWAWBoduBzTABAw5CxbX2BkJ6XOREhShUjFg02JkVmhso0ZhA
/Ad1K+eT5fMdflM4t/GTqiflYpde/DYe1Pl18Kh1RfrE33GljEyKws2TmaQbZxDu
kybUPEsKW7P3wE8Dgn8iTDxHLUU5Ipi/9ZlIj2bFhpy8oSdU21IToIOFWFNVQ1rZ
Zzokf7AuAp0bAgMBAAGjUzBRMB0GA1UdDgQWBBTPGBvuM7v5/0rMQB51W6q1sWu3
UDAfBgNVHSMEGDAWgBTPGBvuM7v5/0rMQB51W6q1sWu3UDAPBgNVHRMBAf8EBTAD
AQH/MA0GCSqGSIb3DQEBCwUAA4IBAQC0AS+WA2O2J9M5BQwa6BYFwHDpuQEWrxzu
QGjiwSVw6EDYhJVzESwjijPognt8KoGUBMIz8lQgBwBJ/lXH5jt4bwQqp/sUYGEb
LcYZyNqKmyZ9VfbxEFAie4qWmVqZkLoaon6AEeLPJhSHUqHHsjQb9hZ8iZtvixvA
tEwV0SyWO4owmgyuwDAcp43I2InsXN9u39fJKRDBH8/3JIrhgpTBtId/NHUcGINY
2EhCSIt2g8rrR/4NW8h0MBZIb2JAeMCpVUBoGR4b8enMa8N6oBVIq5xYXeJOwm42
VL2RwEJvj71P+WMM+eQW6p9yF2gH5GhvRWdvbY+5zBgfauHTsluM
-----END CERTIFICATE-----`;

// A second, untrusted RSA keypair (different modulus), generated at runtime —
// used for the "wrong key" case so the signature does NOT match the IdP cert.
let cachedUntrustedKey: string | null = null;
function untrustedPrivateKey(): string {
  if (cachedUntrustedKey) return cachedUntrustedKey;
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  cachedUntrustedKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return cachedUntrustedKey;
}

// ── SAML helpers ─────────────────────────────────────────────────────────────

const SP_AUDIENCE = "https://api.alecrae.com/v1/sso/metadata";

interface BuildAssertionOptions {
  notBefore?: string;
  notOnOrAfter?: string;
  audience?: string;
}

function isoOffset(deltaMs: number): string {
  return new Date(Date.now() + deltaMs).toISOString();
}

/**
 * Build an unsigned SAML Response with an Assertion. The Response element carries
 * an ID so it can be referenced by the enveloped signature.
 */
function buildUnsignedResponse(opts: BuildAssertionOptions = {}): string {
  const notBefore = opts.notBefore ?? isoOffset(-5 * 60_000);
  const notOnOrAfter = opts.notOnOrAfter ?? isoOffset(5 * 60_000);
  const audience = opts.audience ?? SP_AUDIENCE;

  return [
    `<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    ` xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp1" Version="2.0">`,
    `<saml:Issuer>https://test-idp.alecrae.test</saml:Issuer>`,
    `<saml:Assertion ID="_assert1" Version="2.0">`,
    `<saml:Issuer>https://test-idp.alecrae.test</saml:Issuer>`,
    `<saml:Subject><saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">user@example.com</saml:NameID></saml:Subject>`,
    `<saml:Conditions NotBefore="${notBefore}" NotOnOrAfter="${notOnOrAfter}">`,
    `<saml:AudienceRestriction><saml:Audience>${audience}</saml:Audience></saml:AudienceRestriction>`,
    `</saml:Conditions>`,
    `<saml:AuthnStatement SessionIndex="sess-123"/>`,
    `</saml:Assertion>`,
    `</samlp:Response>`,
  ].join("");
}

/**
 * Sign the Response element (enveloped, exclusive-c14n, rsa-sha256) with the
 * given private key, optionally embedding a cert in KeyInfo.
 */
function signResponse(xml: string, privateKey: string, cert?: string): string {
  const sig = new SignedXml({
    privateKey,
    ...(cert ? { publicCert: cert } : {}),
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    canonicalizationAlgorithm: "http://www.w3.org/2001/10/xml-exc-c14n#",
  });
  sig.addReference({
    xpath: "//*[local-name(.)='Response']",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    ],
    digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
  });
  sig.computeSignature(xml);
  return sig.getSignedXml();
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("verifySamlSignature (S1 — SAML signature verification)", () => {
  it("accepts a validly-signed SAML response", () => {
    const signed = signResponse(buildUnsignedResponse(), IDP_PRIVATE_KEY, IDP_CERT);
    const result = verifySamlSignature(signed, {
      certificate: IDP_CERT,
      expectedAudience: SP_AUDIENCE,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts a cert provided as bare base64 (no PEM armor)", () => {
    const signed = signResponse(buildUnsignedResponse(), IDP_PRIVATE_KEY, IDP_CERT);
    const bare = IDP_CERT
      .replace(/-----BEGIN CERTIFICATE-----/, "")
      .replace(/-----END CERTIFICATE-----/, "")
      .replace(/\s+/g, "");
    const result = verifySamlSignature(signed, { certificate: bare });
    expect(result.ok).toBe(true);
  });

  it("rejects an unsigned SAML response", () => {
    const result = verifySamlSignature(buildUnsignedResponse(), {
      certificate: IDP_CERT,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_signature");
  });

  it("rejects a tampered SAML response (signed, then NameID swapped)", () => {
    const signed = signResponse(buildUnsignedResponse(), IDP_PRIVATE_KEY, IDP_CERT);
    const tampered = signed.replace("user@example.com", "attacker@evil.com");
    const result = verifySamlSignature(tampered, { certificate: IDP_CERT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_signature");
  });

  it("rejects a response signed by an untrusted key (cert mismatch)", () => {
    // Sign with a different private key (with the TRUSTED cert embedded in
    // KeyInfo to simulate an attacker spoofing the cert). Verification pins to
    // the configured cert's public key, so the signature must not validate.
    const signed = signResponse(buildUnsignedResponse(), untrustedPrivateKey(), IDP_CERT);
    const result = verifySamlSignature(signed, { certificate: IDP_CERT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_signature");
  });

  it("rejects when the assertion has expired (NotOnOrAfter in the past)", () => {
    const expired = buildUnsignedResponse({
      notBefore: isoOffset(-10 * 60_000),
      notOnOrAfter: isoOffset(-5 * 60_000),
    });
    const signed = signResponse(expired, IDP_PRIVATE_KEY, IDP_CERT);
    const result = verifySamlSignature(signed, { certificate: IDP_CERT });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("condition_expired");
  });

  it("rejects an audience mismatch", () => {
    const signed = signResponse(
      buildUnsignedResponse({ audience: "https://someone-else.example/sso" }),
      IDP_PRIVATE_KEY,
      IDP_CERT,
    );
    const result = verifySamlSignature(signed, {
      certificate: IDP_CERT,
      expectedAudience: SP_AUDIENCE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("audience_mismatch");
  });

  it("rejects when no certificate is configured", () => {
    const signed = signResponse(buildUnsignedResponse(), IDP_PRIVATE_KEY, IDP_CERT);
    const result = verifySamlSignature(signed, { certificate: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("no_certificate");
  });
});

