/**
 * Edge-runtime-safe session verification for Next.js middleware.
 *
 * Uses Web Crypto only (crypto.subtle). The Node-side library in
 * `auth-password.ts` is the source of truth for issuing sessions; this
 * module mirrors the verify path so middleware can gate routes without
 * pulling node:crypto into the Edge runtime.
 *
 * The session token format is identical: "<payloadBase64Url>.<sigBase64Url>"
 * with HMAC-SHA256 over the payload using ADMIN_SESSION_SECRET.
 */

export interface EdgeSessionPayload {
  readonly email: string;
  readonly iat: number;
  readonly exp: number;
}

function base64UrlDecodeToBytes(input: string): Uint8Array | null {
  try {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    const binary = atob(padded + pad);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return bytesToBase64Url(new Uint8Array(sig));
}

export async function verifySessionEdge(
  token: string | undefined | null,
  secret: string | undefined | null,
): Promise<EdgeSessionPayload | null> {
  if (!token || !secret || secret.length < 16) return null;
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;

  const payloadEncoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = await hmacSign(payloadEncoded, secret);
  if (!constantTimeEqual(providedSig, expectedSig)) return null;

  const payloadBytes = base64UrlDecodeToBytes(payloadEncoded);
  if (!payloadBytes) return null;
  let parsed: EdgeSessionPayload;
  try {
    parsed = JSON.parse(new TextDecoder().decode(payloadBytes)) as EdgeSessionPayload;
  } catch {
    return null;
  }
  if (
    typeof parsed.email !== "string" ||
    typeof parsed.iat !== "number" ||
    typeof parsed.exp !== "number"
  ) {
    return null;
  }
  if (Math.floor(Date.now() / 1000) >= parsed.exp) return null;
  return parsed;
}
