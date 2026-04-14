/**
 * WebAuthn / Passkey Browser Utilities
 *
 * Handles the browser-side WebAuthn ceremony (credential creation and retrieval)
 * and serializes the results for transport to the backend API.
 */

import type {
  PasskeyRegisterChallengeResponse,
  PasskeyLoginChallengeResponse,
  PublicKeyCredentialJSON,
  PublicKeyCredentialAssertionJSON,
} from "./api";

// ─── Base64URL helpers ────────────────────────────────────────────────────────

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ─── Feature detection ────────────────────────────────────────────────────────

/** Check whether WebAuthn / passkeys are supported by this browser. */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials !== "undefined"
  );
}

/**
 * Check whether the browser supports platform authenticators
 * (Touch ID, Face ID, Windows Hello, etc.).
 */
export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ─── Registration (create credential) ─────────────────────────────────────────

/**
 * Run the WebAuthn registration ceremony in the browser.
 * Converts server challenge options into the format expected by
 * `navigator.credentials.create()` and serializes the result.
 */
export async function createPasskeyCredential(
  options: PasskeyRegisterChallengeResponse["publicKey"],
): Promise<PublicKeyCredentialJSON> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge: base64UrlToArrayBuffer(options.challenge),
    rp: options.rp,
    user: {
      id: base64UrlToArrayBuffer(options.user.id),
      name: options.user.name,
      displayName: options.user.displayName,
    },
    pubKeyCredParams: options.pubKeyCredParams.map((p) => ({
      alg: p.alg,
      type: p.type,
    })),
    timeout: options.timeout,
    authenticatorSelection: {
      authenticatorAttachment: options.authenticatorSelection.authenticatorAttachment,
      residentKey: options.authenticatorSelection.residentKey,
      userVerification: options.authenticatorSelection.userVerification,
    },
    attestation: options.attestation,
  };

  const credential = (await navigator.credentials.create({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey creation was cancelled or failed");
  }

  const attestationResponse = credential.response as AuthenticatorAttestationResponse;

  const result: PublicKeyCredentialJSON = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: arrayBufferToBase64Url(attestationResponse.clientDataJSON),
      attestationObject: arrayBufferToBase64Url(attestationResponse.attestationObject),
    },
  };

  // Add optional fields if the browser supports them
  if (typeof attestationResponse.getPublicKey === "function") {
    const publicKey = attestationResponse.getPublicKey();
    if (publicKey) {
      result.response.publicKey = arrayBufferToBase64Url(publicKey);
    }
  }

  if (typeof attestationResponse.getPublicKeyAlgorithm === "function") {
    result.response.publicKeyAlgorithm = attestationResponse.getPublicKeyAlgorithm();
  }

  if (typeof attestationResponse.getTransports === "function") {
    result.response.transports = attestationResponse.getTransports();
  }

  if (typeof attestationResponse.getAuthenticatorData === "function") {
    const authData = attestationResponse.getAuthenticatorData();
    result.response.authenticatorData = arrayBufferToBase64Url(authData);
  }

  if (credential.authenticatorAttachment) {
    result.authenticatorAttachment = credential.authenticatorAttachment;
  }

  return result;
}

// ─── Authentication (get assertion) ───────────────────────────────────────────

/**
 * Run the WebAuthn authentication ceremony in the browser.
 * Converts server challenge options into the format expected by
 * `navigator.credentials.get()` and serializes the result.
 */
export async function getPasskeyAssertion(
  options: PasskeyLoginChallengeResponse["publicKey"],
): Promise<PublicKeyCredentialAssertionJSON> {
  if (!isWebAuthnSupported()) {
    throw new Error("WebAuthn is not supported in this browser");
  }

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge: base64UrlToArrayBuffer(options.challenge),
    rpId: options.rpId,
    timeout: options.timeout,
    userVerification: options.userVerification,
  };

  if (options.allowCredentials && options.allowCredentials.length > 0) {
    publicKeyOptions.allowCredentials = options.allowCredentials.map((cred) => ({
      type: cred.type,
      id: base64UrlToArrayBuffer(cred.id),
      transports: cred.transports as AuthenticatorTransport[] | undefined,
    }));
  }

  const credential = (await navigator.credentials.get({
    publicKey: publicKeyOptions,
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey authentication was cancelled or failed");
  }

  const assertionResponse = credential.response as AuthenticatorAssertionResponse;

  const result: PublicKeyCredentialAssertionJSON = {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: "public-key",
    response: {
      clientDataJSON: arrayBufferToBase64Url(assertionResponse.clientDataJSON),
      authenticatorData: arrayBufferToBase64Url(assertionResponse.authenticatorData),
      signature: arrayBufferToBase64Url(assertionResponse.signature),
    },
  };

  if (assertionResponse.userHandle) {
    result.response.userHandle = arrayBufferToBase64Url(assertionResponse.userHandle);
  }

  if (credential.authenticatorAttachment) {
    result.authenticatorAttachment = credential.authenticatorAttachment;
  }

  return result;
}
