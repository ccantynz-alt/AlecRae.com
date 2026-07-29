/**
 * Per-account failed-login tracking and credential-stuffing detection.
 *
 * WHY (Known Issue #117, second half)
 * -----------------------------------
 * The only protection on `/v1/auth/*` was a flat per-IP rate limit. That stops
 * one machine hammering one account, and nothing else. It is blind to the
 * attack that actually works at scale: a botnet trying one password against
 * one account from a thousand different IPs, each individually well under the
 * cap. Nothing counted failures *per account*, so that pattern was invisible.
 *
 * This matters for spam specifically, not just account security. A taken-over
 * account is the usual way a legitimate sender starts emitting spam — the
 * send-volume anomaly detector (send-anomaly.ts) catches the blast, but this
 * is the upstream cause. Defence in depth on the same failure.
 *
 * DESIGN
 * ------
 * Two counters, because they catch different shapes of the same attack:
 *
 *   - per account: many IPs against one account (credential stuffing). This is
 *     the one the per-IP limit cannot see.
 *   - per IP: one machine against many accounts (spraying). The existing rate
 *     limit bounds request volume but not *failure* volume, so a slow spray
 *     under the cap still went uncounted.
 *
 * Counters key on a hash of the email, never the address itself, so Redis
 * cannot be read as a customer list.
 *
 * A lockout is temporary and always expires. Permanent lockout on failed
 * passwords hands an attacker a denial-of-service against any account whose
 * address they know.
 *
 * FAILURE BEHAVIOUR
 * -----------------
 * Redis primary with an in-memory fallback, so an outage degrades this rather
 * than removing it — a Redis outage is exactly when an attacker would most
 * like brute-force protection to vanish. The in-memory tier is per-process and
 * therefore weaker across a multi-instance deployment, which is the honest
 * trade: some protection everywhere beats none.
 */

import { createHash } from "node:crypto";
import { getRedis } from "./redis.js";

/** Failures against one account before it is temporarily locked. */
const DEFAULT_ACCOUNT_THRESHOLD = 10;
/** Failures from one IP (across any accounts) before it is temporarily blocked. */
const DEFAULT_IP_THRESHOLD = 30;
/** Window over which failures accumulate, and how long a lockout lasts. */
const DEFAULT_WINDOW_SECONDS = 900; // 15 minutes

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Never key Redis on a raw email address — that would make it a customer list. */
function accountKey(email: string): string {
  const digest = createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
  return `loginfail:acct:${digest.slice(0, 32)}`;
}

function ipKey(ip: string): string {
  return `loginfail:ip:${ip}`;
}

// ─── In-memory fallback ──────────────────────────────────────────────────────
// Used only when Redis is unavailable. Bounded so a spray against many
// accounts cannot grow it without limit.

const MAX_MEMORY_ENTRIES = 10_000;
const memoryCounts = new Map<string, { count: number; expiresAt: number }>();

function memoryIncr(key: string, windowSeconds: number): number {
  const now = Date.now();
  const existing = memoryCounts.get(key);

  if (!existing || existing.expiresAt <= now) {
    if (memoryCounts.size >= MAX_MEMORY_ENTRIES) {
      // Drop the oldest-expiring entry rather than refusing to track.
      let oldestKey: string | null = null;
      let oldest = Infinity;
      for (const [k, v] of memoryCounts) {
        if (v.expiresAt < oldest) {
          oldest = v.expiresAt;
          oldestKey = k;
        }
      }
      if (oldestKey !== null) memoryCounts.delete(oldestKey);
    }
    memoryCounts.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return 1;
  }

  existing.count += 1;
  return existing.count;
}

function memoryGet(key: string): number {
  const entry = memoryCounts.get(key);
  if (!entry || entry.expiresAt <= Date.now()) return 0;
  return entry.count;
}

function memoryClear(key: string): void {
  memoryCounts.delete(key);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LoginAttemptStatus {
  /** False when this login attempt should be refused before checking the password. */
  allowed: boolean;
  /** Which counter tripped, for the log and the response. */
  reason: "account_locked" | "ip_blocked" | null;
  /** Seconds until the lockout expires. */
  retryAfterSeconds: number;
}

async function readCount(key: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw === null ? 0 : Number(raw) || 0;
    } catch {
      // fall through to memory
    }
  }
  return memoryGet(key);
}

/**
 * Check whether a login attempt may proceed. Call BEFORE verifying the
 * password, so a locked account costs no password-hash work.
 *
 * Never throws.
 */
export async function checkLoginAllowed(
  email: string,
  ip: string,
): Promise<LoginAttemptStatus> {
  const accountThreshold = envInt("LOGIN_FAIL_ACCOUNT_THRESHOLD", DEFAULT_ACCOUNT_THRESHOLD);
  const ipThreshold = envInt("LOGIN_FAIL_IP_THRESHOLD", DEFAULT_IP_THRESHOLD);
  const windowSeconds = envInt("LOGIN_FAIL_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS);

  try {
    const [accountFails, ipFails] = await Promise.all([
      readCount(accountKey(email)),
      readCount(ipKey(ip)),
    ]);

    if (accountFails >= accountThreshold) {
      console.warn(
        `[login-protection] Account temporarily locked after ${accountFails} failed attempts ` +
          `(threshold ${accountThreshold}) — possible credential stuffing`,
      );
      return { allowed: false, reason: "account_locked", retryAfterSeconds: windowSeconds };
    }

    if (ipFails >= ipThreshold) {
      console.warn(
        `[login-protection] IP ${ip} temporarily blocked after ${ipFails} failed attempts ` +
          `(threshold ${ipThreshold}) — possible password spraying`,
      );
      return { allowed: false, reason: "ip_blocked", retryAfterSeconds: windowSeconds };
    }

    return { allowed: true, reason: null, retryAfterSeconds: 0 };
  } catch (err) {
    console.error(
      `[login-protection] check failed: ${err instanceof Error ? err.message : String(err)} — allowing attempt`,
    );
    return { allowed: true, reason: null, retryAfterSeconds: 0 };
  }
}

/** Record a failed login against both counters. Never throws. */
export async function recordLoginFailure(email: string, ip: string): Promise<void> {
  const windowSeconds = envInt("LOGIN_FAIL_WINDOW_SECONDS", DEFAULT_WINDOW_SECONDS);
  const redis = getRedis();

  if (redis) {
    try {
      const pipeline = redis.pipeline();
      for (const key of [accountKey(email), ipKey(ip)]) {
        pipeline.incr(key);
        // Refresh on every failure so a sustained attack stays locked out
        // instead of ageing out mid-attack.
        pipeline.expire(key, windowSeconds);
      }
      await pipeline.exec();
      return;
    } catch {
      // fall through to memory
    }
  }

  memoryIncr(accountKey(email), windowSeconds);
  memoryIncr(ipKey(ip), windowSeconds);
}

/**
 * Clear the account counter after a successful login.
 *
 * The IP counter is deliberately NOT cleared: an attacker who guesses one
 * password out of hundreds of attempts would otherwise reset their own spray
 * counter and continue against the next account.
 */
export async function recordLoginSuccess(email: string): Promise<void> {
  const key = accountKey(email);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(key);
      return;
    } catch {
      // fall through
    }
  }
  memoryClear(key);
}

/** Test-only: drop all in-memory state. */
export function __resetLoginProtectionMemory(): void {
  memoryCounts.clear();
}
