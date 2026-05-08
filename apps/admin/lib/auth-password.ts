/**
 * Admin password auth — single-user, env-var-backed.
 *
 * Pre-launch admin login for Craig. Uses node:crypto only — no new deps.
 * Replaceable with SAML / passkey later without breaking the cookie format.
 *
 * Storage shape (set in env, never in repo):
 *   ADMIN_EMAIL              the admin's email address
 *   ADMIN_PASSWORD_HASH      "scrypt$N$r$p$saltHex$keyHex" (generate with scripts/generate-admin-hash.ts)
 *   ADMIN_SESSION_SECRET     32+ random bytes hex/base64; signs the session cookie
 *
 * Session cookie format: "<payloadBase64Url>.<sigBase64Url>"
 * Payload: { email, iat, exp } JSON. Sig: HMAC-SHA256(payload, ADMIN_SESSION_SECRET).
 */

import {
  scryptSync,
  timingSafeEqual,
  createHmac,
  randomBytes,
} from "node:crypto";

// ─── Constants ──────────────────────────────────────────────────────────────

export const ADMIN_SESSION_COOKIE = "alecrae_admin_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionPayload {
  readonly email: string;
  readonly iat: number;
  readonly exp: number;
}

export type LoginResult =
  | { readonly ok: true; readonly cookie: string; readonly maxAge: number }
  | { readonly ok: false; readonly reason: LoginFailureReason };

export type LoginFailureReason =
  | "not_configured"
  | "invalid_credentials"
  | "rate_limited";

// ─── Password hashing (scrypt) ──────────────────────────────────────────────

interface ParsedHash {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly key: Buffer;
}

function parseStoredHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6) return null;
  const [scheme, nStr, rStr, pStr, saltHex, keyHex] = parts;
  if (scheme !== "scrypt") return null;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return null;
  }
  if (!saltHex || !keyHex) return null;
  try {
    return {
      N,
      r,
      p,
      salt: Buffer.from(saltHex, "hex"),
      key: Buffer.from(keyHex, "hex"),
    };
  } catch {
    return null;
  }
}

export function hashPassword(password: string): string {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 64, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(password.normalize("NFKC"), parsed.salt, parsed.key.length, {
      N: parsed.N,
      r: parsed.r,
      p: parsed.p,
    });
  } catch {
    return false;
  }
  if (derived.length !== parsed.key.length) return false;
  return timingSafeEqual(derived, parsed.key);
}

// ─── Session cookie (HMAC-signed) ──────────────────────────────────────────

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Buffer | null {
  try {
    const padded = input.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, "base64");
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return base64UrlEncode(createHmac("sha256", secret).update(payload).digest());
}

function readSecret(): string | null {
  const s = process.env.ADMIN_SESSION_SECRET;
  if (!s || s.length < 16) return null;
  return s;
}

export function issueSession(email: string): { token: string; maxAge: number } | null {
  const secret = readSecret();
  if (!secret) return null;
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    email: email.toLowerCase(),
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  const payloadEncoded = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = sign(payloadEncoded, secret);
  return { token: `${payloadEncoded}.${sig}`, maxAge: SESSION_TTL_SECONDS };
}

export function verifySession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const secret = readSecret();
  if (!secret) return null;
  const dot = token.indexOf(".");
  if (dot < 1 || dot === token.length - 1) return null;
  const payloadEncoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  const expectedSig = sign(payloadEncoded, secret);
  const a = Buffer.from(expectedSig);
  const b = Buffer.from(providedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const payloadBuf = base64UrlDecode(payloadEncoded);
  if (!payloadBuf) return null;
  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(payloadBuf.toString("utf8")) as SessionPayload;
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

// ─── Login ─────────────────────────────────────────────────────────────────

export function attemptLogin(email: string, password: string): LoginResult {
  const expectedEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const expectedHash = process.env.ADMIN_PASSWORD_HASH;
  const secret = readSecret();

  if (!expectedEmail || !expectedHash || !secret) {
    return { ok: false, reason: "not_configured" };
  }

  const submitted = email.trim().toLowerCase();
  // Compare email constant-time so we don't leak which field was wrong.
  const emailA = Buffer.from(submitted.padEnd(128, "\0").slice(0, 128));
  const emailB = Buffer.from(expectedEmail.padEnd(128, "\0").slice(0, 128));
  const emailMatches = timingSafeEqual(emailA, emailB);
  const passwordMatches = verifyPassword(password, expectedHash);

  if (!emailMatches || !passwordMatches) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const session = issueSession(expectedEmail);
  if (!session) {
    return { ok: false, reason: "not_configured" };
  }

  const isProd = process.env.NODE_ENV === "production";
  const cookie = [
    `${ADMIN_SESSION_COOKIE}=${session.token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProd ? "Secure" : "",
    `Max-Age=${session.maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");

  return { ok: true, cookie, maxAge: session.maxAge };
}

export function clearSessionCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    isProd ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
