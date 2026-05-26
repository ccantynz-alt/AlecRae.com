/**
 * IMAP auth crypto + rate-limit primitives.
 *
 * Split out from auth.ts so tests can import these pure helpers without
 * pulling the drizzle database dependency. The hashing algorithm MUST
 * stay in sync with apps/api/src/routes/auth.ts::hashPassword — if it
 * diverges, credentials that work on the web silently stop working on
 * IMAP.
 */

// ─── Password hashing ───────────────────────────────────────────────────────

/**
 * Hash a password using SHA-256 (hex). Must stay in sync with the web
 * auth route so IMAP and web accept the same credentials. When the
 * platform upgrades to argon2id, both code paths must be migrated together.
 */
export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison to avoid timing attacks during password
 * verification. Both inputs must already be the same length hex string.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Rate limiting ──────────────────────────────────────────────────────────

/**
 * Tracks authentication attempts per remote address for rate limiting.
 */
const authAttempts = new Map<string, { count: number; lastAttempt: number }>();

/** Maximum failed auth attempts before connection is rejected. */
export const MAX_FAILED_ATTEMPTS = 5;

/** Window in milliseconds for rate limiting (15 minutes). */
export const RATE_LIMIT_WINDOW = 15 * 60 * 1000;

/**
 * Check if an IP address has exceeded the auth rate limit.
 */
export function isRateLimited(remoteAddress: string): boolean {
  const entry = authAttempts.get(remoteAddress);
  if (!entry) return false;

  if (Date.now() - entry.lastAttempt > RATE_LIMIT_WINDOW) {
    authAttempts.delete(remoteAddress);
    return false;
  }

  return entry.count >= MAX_FAILED_ATTEMPTS;
}

/**
 * Record a failed authentication attempt for rate limiting.
 */
export function recordFailedAttempt(remoteAddress: string): void {
  const entry = authAttempts.get(remoteAddress);
  if (entry) {
    entry.count++;
    entry.lastAttempt = Date.now();
  } else {
    authAttempts.set(remoteAddress, { count: 1, lastAttempt: Date.now() });
  }
}

/**
 * Clear rate limiting state for a remote address after successful auth.
 */
export function clearRateLimit(remoteAddress: string): void {
  authAttempts.delete(remoteAddress);
}
