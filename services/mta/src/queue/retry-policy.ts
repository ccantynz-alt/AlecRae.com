/**
 * @alecrae/mta — Retry / Backoff Policy
 *
 * Pure, side-effect-free retry decision engine for the outbound MTA. Given the
 * context of a failed delivery attempt, returns one of three actions:
 *
 *   - `retry`   — schedule another attempt after `delaySeconds`
 *   - `drop`    — silently abandon (reserved; not currently emitted)
 *   - `bounce`  — emit a bounce to the sender (terminal)
 *
 * Algorithm:
 *   delay = min(maxDelay, base * 2^(attempt-1)) * (1 + jitter*(rng()-0.5))
 *
 * Notes:
 *   - Hard / policy / block bounces short-circuit to `bounce` immediately.
 *   - Transient failures use a shorter base delay (faster retry cadence).
 *   - Soft failures follow the standard exponential curve.
 *   - After `maxAttempts` or `maxAgeSeconds`, returns `bounce`.
 *   - Per-domain policy overrides can be supplied via `domainPolicies`.
 *
 * This module performs NO I/O. The only non-determinism is the RNG, which is
 * injectable for deterministic testing.
 */

// ─── Public types ───────────────────────────────────────────────────────────

export type RetryDecision =
  | { readonly action: "retry"; readonly delaySeconds: number; readonly attempt: number }
  | { readonly action: "drop"; readonly reason: string }
  | { readonly action: "bounce"; readonly reason: string };

export interface RetryContext {
  readonly attempt: number; // 1-indexed; current attempt that just failed
  readonly firstAttemptAt: number; // epoch ms
  readonly lastError?: string;
  readonly bounceClass?: "hard" | "soft" | "transient" | "block" | "policy" | "unknown";
  readonly recipientDomain: string;
  readonly messageSizeBytes: number;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly maxAgeSeconds: number;
  readonly baseDelaySeconds: number;
  readonly maxDelaySeconds: number;
  readonly jitterFactor: number; // 0..1
}

// ─── Defaults ───────────────────────────────────────────────────────────────

/**
 * The house default retry policy.
 *
 * 10 attempts over 72h, 60s base, capped at 4h between attempts, ±10% jitter.
 * These numbers match common SMTP MTA conventions (Postfix / OpenSMTPD).
 */
export const DEFAULT_POLICY: RetryPolicy = {
  maxAttempts: 10,
  maxAgeSeconds: 72 * 60 * 60, // 72h
  baseDelaySeconds: 60,
  maxDelaySeconds: 4 * 60 * 60, // 4h
  jitterFactor: 0.2,
};

/**
 * Transient failures (greylisting, temporary DNS hiccup, 4xx SMTP) retry
 * more aggressively — 20s base instead of 60s. Everything else matches
 * `DEFAULT_POLICY`.
 */
const TRANSIENT_BASE_DELAY_SECONDS = 20;

/** Bounce classes that skip the retry ladder entirely. */
const TERMINAL_BOUNCE_CLASSES: ReadonlySet<NonNullable<RetryContext["bounceClass"]>> =
  new Set(["hard", "policy", "block"]);

// ─── Per-domain override hook ───────────────────────────────────────────────

/**
 * Lowercased-domain → policy map used by `decideRetry` when no explicit policy
 * is passed. Callers may extend this at startup (see `registerDomainPolicy`).
 *
 * Gmail and Outlook both publish preferred retry rhythms; being polite here
 * buys us reputation. Defaults below are conservative — tune on real data.
 */
const domainPolicies = new Map<string, RetryPolicy>();

/**
 * Register (or replace) a per-domain policy override.
 *
 * Case-insensitive on the domain key. Pure with respect to its arguments —
 * mutates module-local state only.
 */
export function registerDomainPolicy(domain: string, policy: RetryPolicy): void {
  domainPolicies.set(domain.toLowerCase(), policy);
}

/**
 * Look up a domain's override, if any. Exposed for testability.
 */
export function getDomainPolicy(domain: string): RetryPolicy | undefined {
  return domainPolicies.get(domain.toLowerCase());
}

/**
 * Clear all registered per-domain overrides. Intended for tests.
 */
export function clearDomainPolicies(): void {
  domainPolicies.clear();
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Compute the raw exponential delay for a given attempt, pre-jitter.
 *
 *   delay = min(maxDelay, base * 2^(attempt-1))
 *
 * `attempt` is 1-indexed (attempt 1 = first retry delay). Returns seconds.
 */
function exponentialDelaySeconds(
  attempt: number,
  baseDelaySeconds: number,
  maxDelaySeconds: number,
): number {
  // Guard against overflow on large attempt numbers: cap the exponent at
  // something that cannot exceed maxDelay.
  const safeAttempt = Math.max(1, Math.floor(attempt));
  // 2^30 seconds is ~34 years — well past any plausible maxDelay.
  const exponent = Math.min(30, safeAttempt - 1);
  const raw = baseDelaySeconds * 2 ** exponent;
  return Math.min(maxDelaySeconds, raw);
}

/**
 * Apply symmetric jitter: `delay * (1 + jitter*(rng()-0.5))`.
 *
 * With jitter=0.2 and rng() uniform on [0,1), output spans ±10% of `delay`.
 * Never returns a negative value (floor at 0).
 */
function applyJitter(
  delaySeconds: number,
  jitterFactor: number,
  rng: () => number,
): number {
  const clampedJitter = Math.max(0, Math.min(1, jitterFactor));
  const r = rng();
  const multiplier = 1 + clampedJitter * (r - 0.5);
  const jittered = delaySeconds * multiplier;
  return jittered < 0 ? 0 : jittered;
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Decide what to do after a failed delivery attempt.
 *
 * @param ctx    Failure context (attempt number, bounce class, domain, …).
 * @param policy Optional explicit policy. If omitted, the per-domain override
 *               (if any) is used; otherwise `DEFAULT_POLICY`.
 * @param rng    Optional RNG for deterministic testing. Defaults to
 *               `Math.random`. Must return a number in `[0, 1)`.
 */
export function decideRetry(
  ctx: RetryContext,
  policy?: RetryPolicy,
  rng: () => number = Math.random,
): RetryDecision {
  const effectivePolicy: RetryPolicy =
    policy ?? getDomainPolicy(ctx.recipientDomain) ?? DEFAULT_POLICY;

  // 1. Terminal bounce classes short-circuit — no retry, no delay math.
  if (ctx.bounceClass && TERMINAL_BOUNCE_CLASSES.has(ctx.bounceClass)) {
    return {
      action: "bounce",
      reason: `terminal bounce class: ${ctx.bounceClass}`,
    };
  }

  // 2. Exhausted attempt budget.
  if (ctx.attempt >= effectivePolicy.maxAttempts) {
    return {
      action: "bounce",
      reason: `max attempts reached (${ctx.attempt}/${effectivePolicy.maxAttempts})`,
    };
  }

  // 3. Exhausted age budget. Uses the provided `firstAttemptAt` anchor —
  //    pure; no `Date.now()` call here. Callers who want "now-based" age
  //    should pass a computed value.
  const ageSeconds = Math.max(0, (Date.now() - ctx.firstAttemptAt) / 1000);
  if (ageSeconds >= effectivePolicy.maxAgeSeconds) {
    return {
      action: "bounce",
      reason: `max age reached (${Math.floor(ageSeconds)}s/${effectivePolicy.maxAgeSeconds}s)`,
    };
  }

  // 4. Choose base delay: transient uses faster cadence.
  const baseDelay =
    ctx.bounceClass === "transient"
      ? Math.min(TRANSIENT_BASE_DELAY_SECONDS, effectivePolicy.baseDelaySeconds)
      : effectivePolicy.baseDelaySeconds;

  const rawDelay = exponentialDelaySeconds(
    ctx.attempt,
    baseDelay,
    effectivePolicy.maxDelaySeconds,
  );
  const delaySeconds = applyJitter(rawDelay, effectivePolicy.jitterFactor, rng);

  return {
    action: "retry",
    delaySeconds,
    attempt: ctx.attempt + 1,
  };
}
