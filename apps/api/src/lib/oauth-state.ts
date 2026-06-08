/**
 * OAuth State Signing — HMAC-SHA256 signed, expiring CSRF tokens
 *
 * OAuth `state` is the only thing tying an unauthenticated provider callback
 * back to the user who initiated the flow. If it is plain (unsigned) JSON, an
 * attacker can forge it and link a mailbox to an arbitrary account (account
 * linking CSRF). These helpers sign the state payload with HMAC-SHA256 so the
 * callbacks can prove the state was minted by us, is fresh, and untampered.
 *
 * Token shape: base64url(payloadJson) + "." + base64url(hmac)
 *   - payloadJson includes the caller fields plus `iat` (issued-at, ms),
 *     `exp` (expiry, ms) and a random `nonce`.
 *   - HMAC is computed over the base64url(payloadJson) segment.
 *
 * Secret: reuses JWT_SECRET (mirrors apps/api/src/lib/jwt.ts). In production a
 * missing secret throws; a dev fallback is allowed only when NODE_ENV !==
 * "production".
 */

import { z } from "zod";

// ─── Config ──────────────────────────────────────────────────────────────────

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const StatePayloadSchema = z.object({
  userId: z.string().min(1),
  provider: z.enum(["gmail", "outlook"]),
});

export type StatePayload = z.infer<typeof StatePayloadSchema>;

const SignedPayloadSchema = StatePayloadSchema.extend({
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  nonce: z.string().min(1),
});

type SignedPayload = z.infer<typeof SignedPayloadSchema>;

// ─── Result type (typed, non-throwing for invalid case) ────────────────────────

export type VerifyResult =
  | { ok: true; payload: StatePayload }
  | { ok: false; error: "malformed" | "tampered" | "expired" | "invalid_payload" };

// ─── Secret resolution (mirrors jwt.ts HS256 fallback policy) ──────────────────

function getStateSecret(): string {
  const explicitSecret = process.env["JWT_SECRET"];
  if (!explicitSecret && process.env["NODE_ENV"] === "production") {
    throw new Error(
      "[oauth-state] Refusing to sign OAuth state in production without JWT_SECRET. " +
        "Set JWT_SECRET before starting the API.",
    );
  }
  if (explicitSecret && explicitSecret.length < 32 && process.env["NODE_ENV"] === "production") {
    throw new Error("[oauth-state] JWT_SECRET must be at least 32 characters in production.");
  }
  return explicitSecret ?? "dev_secret";
}

// ─── Encoding helpers ──────────────────────────────────────────────────────────

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── HMAC ──────────────────────────────────────────────────────────────────────

async function hmacSha256(message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getStateSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

/** Constant-time comparison of two byte arrays. */
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Sign an OAuth state payload, producing a tamper-evident, short-lived token.
 */
export async function signState(payload: StatePayload): Promise<string> {
  const parsed = StatePayloadSchema.parse(payload);
  const now = Date.now();
  const signed: SignedPayload = {
    ...parsed,
    iat: now,
    exp: now + STATE_TTL_MS,
    nonce: generateNonce(),
  };

  const payloadSegment = toBase64Url(new TextEncoder().encode(JSON.stringify(signed)));
  const signatureSegment = toBase64Url(await hmacSha256(payloadSegment));
  return `${payloadSegment}.${signatureSegment}`;
}

// ─── Sign-in state (unauthenticated "Sign in with Google") ─────────────────────
//
// The account-linking state above carries the already-authenticated userId. The
// sign-in flow has no user yet — the whole point is to establish identity — so
// its state only needs to prove WE minted it (CSRF) and is fresh. We still sign
// it with the same HMAC secret and carry a random nonce + optional post-login
// redirect target.

const AuthStatePayloadSchema = z.object({
  flow: z.literal("google-signin"),
});

export type AuthStatePayload = z.infer<typeof AuthStatePayloadSchema>;

const SignedAuthPayloadSchema = AuthStatePayloadSchema.extend({
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  nonce: z.string().min(1),
});

export type VerifyAuthResult =
  | { ok: true; payload: AuthStatePayload }
  | { ok: false; error: "malformed" | "tampered" | "expired" | "invalid_payload" };

/** Sign a sign-in OAuth state token (CSRF protection for the unauthenticated flow). */
export async function signAuthState(payload: AuthStatePayload): Promise<string> {
  const parsed = AuthStatePayloadSchema.parse(payload);
  const now = Date.now();
  const signed = {
    ...parsed,
    iat: now,
    exp: now + STATE_TTL_MS,
    nonce: generateNonce(),
  };

  const payloadSegment = toBase64Url(new TextEncoder().encode(JSON.stringify(signed)));
  const signatureSegment = toBase64Url(await hmacSha256(payloadSegment));
  return `${payloadSegment}.${signatureSegment}`;
}

/** Verify a sign-in OAuth state token. Typed Result, never throws for invalid input. */
export async function verifyAuthState(token: string): Promise<VerifyAuthResult> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, error: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, error: "malformed" };
  }
  const [payloadSegment, signatureSegment] = parts as [string, string];
  if (payloadSegment.length === 0 || signatureSegment.length === 0) {
    return { ok: false, error: "malformed" };
  }

  const expected = await hmacSha256(payloadSegment);
  let provided: Uint8Array;
  try {
    provided = fromBase64Url(signatureSegment);
  } catch {
    return { ok: false, error: "tampered" };
  }
  if (!constantTimeEqual(expected, provided)) {
    return { ok: false, error: "tampered" };
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadSegment)));
  } catch {
    return { ok: false, error: "invalid_payload" };
  }

  const result = SignedAuthPayloadSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: "invalid_payload" };
  }

  if (Date.now() > result.data.exp) {
    return { ok: false, error: "expired" };
  }

  return { ok: true, payload: { flow: result.data.flow } };
}

/**
 * Verify an OAuth state token. Returns a typed Result; never throws for the
 * invalid case (malformed / tampered / expired / invalid payload). May throw
 * only if the signing secret is misconfigured in production.
 */
export async function verifyState(token: string): Promise<VerifyResult> {
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, error: "malformed" };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, error: "malformed" };
  }
  const [payloadSegment, signatureSegment] = parts as [string, string];
  if (payloadSegment.length === 0 || signatureSegment.length === 0) {
    return { ok: false, error: "malformed" };
  }

  // Recompute and constant-time compare the HMAC before trusting any content.
  const expected = await hmacSha256(payloadSegment);
  let provided: Uint8Array;
  try {
    provided = fromBase64Url(signatureSegment);
  } catch {
    return { ok: false, error: "tampered" };
  }
  if (!constantTimeEqual(expected, provided)) {
    return { ok: false, error: "tampered" };
  }

  // Signature is valid — decode and validate the payload shape.
  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadSegment)));
  } catch {
    return { ok: false, error: "invalid_payload" };
  }

  const result = SignedPayloadSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, error: "invalid_payload" };
  }

  if (Date.now() > result.data.exp) {
    return { ok: false, error: "expired" };
  }

  return {
    ok: true,
    payload: { userId: result.data.userId, provider: result.data.provider },
  };
}
