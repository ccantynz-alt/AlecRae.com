/**
 * @alecrae/mta — Bounce Classifier
 *
 * Pure, side-effect-free classification of a single delivery attempt into
 * a structured {@link BounceVerdict}. Companion module to `processor.ts`;
 * this module is intentionally standalone — it depends on no project
 * types and makes no I/O calls, so it can be imported from edge workers,
 * CLI tools, and unit tests without drag.
 *
 * Primary signal: DSN enhanced status code (RFC 3463).
 * Secondary signal: raw SMTP reply code (RFC 5321).
 * Fallback signal: diagnostic-text keyword map covering the phrases the
 * major providers (Gmail, Outlook, Yahoo, Apple, Proton, Fastmail) emit.
 *
 * Returns a {@link BounceVerdict} with a class, retry/suppression flags,
 * a suggested retry-after window, a human-readable reason, and a
 * confidence score in [0..1].
 */

// ─── Public types ───────────────────────────────────────────────────────────

export type BounceClass =
  | "hard"
  | "soft"
  | "transient"
  | "block"
  | "policy"
  | "unknown";

export interface BounceVerdict {
  readonly class: BounceClass;
  readonly reason: string;
  readonly shouldRetry: boolean;
  readonly shouldSuppress: boolean;
  readonly retryAfterSeconds: number | null;
  readonly confidence: number; // 0..1
}

export interface BounceSignal {
  readonly smtpCode?: number; // e.g., 550, 421
  readonly enhancedStatus?: string; // e.g., "5.1.1"
  readonly diagnosticText?: string;
  readonly reportingMta?: string;
  readonly remoteHost?: string;
  readonly attemptCount?: number;
}

// ─── Retry policy constants ─────────────────────────────────────────────────

/** Maximum retry attempts for soft bounces before we give up. */
const MAX_SOFT_ATTEMPTS = 5;

/** Base delay (seconds) used for soft-bounce exponential backoff. */
const SOFT_BASE_DELAY_SECONDS = 15 * 60; // 15 min

/** Cap for soft-bounce backoff (~18 h, sum across 5 attempts ≈ 72 h). */
const SOFT_MAX_DELAY_SECONDS = 18 * 60 * 60;

/** Short retry window used for transient / throttle situations. */
const TRANSIENT_RETRY_SECONDS = 60;

/** Retry window for "unknown" signals where we have no code to trust. */
const UNKNOWN_RETRY_SECONDS = 30 * 60;

/** Unknown signals get at most this many attempts. */
const MAX_UNKNOWN_ATTEMPTS = 2;

// ─── Keyword maps ───────────────────────────────────────────────────────────

/**
 * Block / blacklist indicators. Matching these means the remote side has
 * decided they will not accept mail from us (at least temporarily from
 * their perspective, permanently from ours for retry purposes).
 */
const BLOCK_KEYWORDS: readonly string[] = [
  // Generic
  "blocked",
  "blacklist",
  "blacklisted",
  "blocklist",
  "rbl",
  "dnsbl",
  "deny",
  "denied",
  "refused",
  "rejected due to",
  "not accepted",
  "reputation",
  "poor reputation",
  "bad reputation",
  "sender blocked",
  "ip blocked",
  "mail refused",
  "5.7.606",
  "5.7.1",
  // Gmail
  "our system has detected that this message is",
  "suspicious due to the very low reputation",
  "554 5.7.1",
  // Outlook / Office 365
  "access denied, banned sending ip",
  "banned sending ip",
  "s3140",
  "s3150",
  "s3115",
  "s3114",
  // Yahoo / AOL
  "mail server ip blocked",
  "not authorized by sender's domain",
  // Apple iCloud
  "blocked - see https://support.apple.com",
  // SpamHaus / Barracuda / CBL / SORBS / UCEPROTECT
  "spamhaus",
  "barracuda",
  "cbl",
  "sorbs",
  "uceprotect",
  "spamcop",
];

/**
 * Policy-rejection indicators (auth failures, DMARC/SPF/DKIM, content
 * policy). These are permanent until the *sending side* fixes its setup.
 */
const POLICY_KEYWORDS: readonly string[] = [
  "dmarc",
  "spf",
  "dkim",
  "authentication failed",
  "not authenticated",
  "sender policy",
  "fails dmarc",
  "dmarc policy",
  "unauthenticated",
  "5.7.26",
  "5.7.25",
  "5.7.7",
  "5.7.8",
  "5.7.9",
  "policy violation",
  "rejected for policy reasons",
  "message rejected due to policy",
  "virus",
  "malware",
  "phishing",
  // Gmail
  "gmail requires all senders to authenticate",
  "this message does not have authentication information",
  // Outlook
  "sender id (pra) not permitted",
  // Yahoo
  "message not accepted for policy reasons",
];

/**
 * Hard-bounce indicators (invalid recipient, no such user, domain
 * nonexistent). Permanent, suppress immediately.
 */
const HARD_KEYWORDS: readonly string[] = [
  "user unknown",
  "no such user",
  "no such address",
  "no such recipient",
  "invalid recipient",
  "invalid address",
  "invalid mailbox",
  "recipient address rejected",
  "recipient not found",
  "recipient rejected",
  "mailbox not found",
  "mailbox unavailable",
  "address not found",
  "address rejected",
  "does not exist",
  "doesn't exist",
  "no mailbox here by that name",
  "account has been disabled",
  "account disabled",
  "account suspended",
  "mailbox disabled",
  "unknown recipient",
  "unrouteable address",
  "unroutable address",
  "domain not found",
  "no such domain",
  "host not found",
  "host unknown",
  "name or service not known",
  // Gmail
  "the email account that you tried to reach does not exist",
  // Outlook
  "the email address you entered couldn't be found",
  "recipient not found by smtp address lookup",
  // Yahoo
  "this user doesn't have a yahoo account",
  // Apple
  "the email account that you tried to reach is over quota" /* NB: quota handled below; this phrase is hard for apple */,
];

/**
 * Soft-bounce indicators (temporary, recipient-side). Retry with backoff.
 */
const SOFT_KEYWORDS: readonly string[] = [
  "mailbox full",
  "over quota",
  "quota exceeded",
  "user is over the quota",
  "insufficient system storage",
  "insufficient storage",
  "disk full",
  "no space left",
  "4.2.2",
  "4.3.1",
  "temporarily deferred",
  "temporary failure",
  "temporary local problem",
  "temporary system problem",
  "try again later",
  "please try again",
  "service unavailable",
  "service temporarily unavailable",
  "greylisted",
  "greylist",
  "greylisting in action",
  "451 4.7.1",
  "450 4.2.1",
];

/**
 * Transient indicators — rate limiting, throttling, DNS blips. Short
 * retry; these usually resolve within a minute.
 */
const TRANSIENT_KEYWORDS: readonly string[] = [
  "rate limit",
  "rate-limit",
  "rate limited",
  "too many",
  "too many connections",
  "too many messages",
  "too many emails",
  "throttle",
  "throttled",
  "throttling",
  "try again in",
  "retry in",
  "deferred: 421",
  "connection refused",
  "connection reset",
  "connection timed out",
  "connection timeout",
  "broken pipe",
  "network unreachable",
  "temporary dns failure",
  "4.7.0",
  "4.7.1",
  // Gmail
  "our system has detected an unusual rate of unsolicited mail",
  "421-4.7.0",
  // Outlook
  "suspended due to suspicious activity",
  // Yahoo
  "too many messages from this sender",
];

// ─── Public classifier ─────────────────────────────────────────────────────

/**
 * Classify a single delivery attempt using the best available signal.
 *
 * Ordering (most-specific to least-specific):
 *   1. Explicit policy / block phrases in diagnostic text
 *      (catches "5.7.1 blocked" before the generic 5.x.x branch).
 *   2. Enhanced status code RFC 3463 class — the authoritative signal
 *      when present.
 *   3. Raw SMTP reply code (RFC 5321) — 5xx / 4xx.
 *   4. Diagnostic text keyword fallback.
 *   5. "unknown" verdict.
 */
export function classifyBounce(signal: BounceSignal): BounceVerdict {
  const diag = (signal.diagnosticText ?? "").toLowerCase();
  const enhanced = normalizeEnhanced(signal.enhancedStatus);
  const enhancedClass = enhanced ? enhanced.charAt(0) : undefined;
  const smtp = signal.smtpCode;
  const attempt = signal.attemptCount ?? 0;

  // ── 1. Policy / block — these must beat the plain 5xx branch ─────────
  // DMARC/SPF/DKIM and explicit blocks both emit 5xx codes, but the
  // recovery story differs (fix DNS vs. request delisting), so we split
  // them out early while the diagnostic text is rich.

  if (isPolicyEnhanced(enhanced) || containsAny(diag, POLICY_KEYWORDS)) {
    return {
      class: "policy",
      reason: summarize("policy rejection", enhanced, smtp, diag),
      shouldRetry: false,
      shouldSuppress: true,
      retryAfterSeconds: null,
      confidence: enhanced ? 0.92 : 0.8,
    };
  }

  if (containsAny(diag, BLOCK_KEYWORDS)) {
    return {
      class: "block",
      reason: summarize("remote blocklist / deny", enhanced, smtp, diag),
      shouldRetry: false,
      shouldSuppress: true,
      retryAfterSeconds: null,
      confidence: 0.9,
    };
  }

  // ── 2. Enhanced status code (authoritative RFC 3463 signal) ──────────

  if (enhancedClass === "5") {
    // Transient-looking phrasing inside a 5.x.x code still means the
    // remote sent a permanent failure — trust the code.
    if (containsAny(diag, HARD_KEYWORDS) || isHardEnhanced(enhanced)) {
      return {
        class: "hard",
        reason: summarize("permanent delivery failure", enhanced, smtp, diag),
        shouldRetry: false,
        shouldSuppress: true,
        retryAfterSeconds: null,
        confidence: 0.95,
      };
    }
    return {
      class: "hard",
      reason: summarize("permanent failure (5.x.x)", enhanced, smtp, diag),
      shouldRetry: false,
      shouldSuppress: true,
      retryAfterSeconds: null,
      confidence: 0.95,
    };
  }

  if (enhancedClass === "4") {
    if (containsAny(diag, TRANSIENT_KEYWORDS) || isTransientEnhanced(enhanced)) {
      return {
        class: "transient",
        reason: summarize("transient / throttle", enhanced, smtp, diag),
        shouldRetry: attempt < MAX_SOFT_ATTEMPTS,
        shouldSuppress: false,
        retryAfterSeconds: TRANSIENT_RETRY_SECONDS,
        confidence: 0.9,
      };
    }
    return {
      class: "soft",
      reason: summarize("temporary failure (4.x.x)", enhanced, smtp, diag),
      shouldRetry: attempt < MAX_SOFT_ATTEMPTS,
      shouldSuppress: false,
      retryAfterSeconds: softBackoffSeconds(attempt),
      confidence: 0.9,
    };
  }

  // ── 3. SMTP reply code fallback ──────────────────────────────────────

  if (typeof smtp === "number" && Number.isFinite(smtp)) {
    if (smtp >= 500 && smtp <= 599) {
      if (containsAny(diag, HARD_KEYWORDS)) {
        return {
          class: "hard",
          reason: summarize("permanent failure", enhanced, smtp, diag),
          shouldRetry: false,
          shouldSuppress: true,
          retryAfterSeconds: null,
          confidence: 0.9,
        };
      }
      return {
        class: "hard",
        reason: summarize("5xx permanent failure", enhanced, smtp, diag),
        shouldRetry: false,
        shouldSuppress: true,
        retryAfterSeconds: null,
        confidence: 0.85,
      };
    }

    if (smtp >= 400 && smtp <= 499) {
      if (containsAny(diag, TRANSIENT_KEYWORDS)) {
        return {
          class: "transient",
          reason: summarize("transient / throttle", enhanced, smtp, diag),
          shouldRetry: attempt < MAX_SOFT_ATTEMPTS,
          shouldSuppress: false,
          retryAfterSeconds: TRANSIENT_RETRY_SECONDS,
          confidence: 0.85,
        };
      }
      return {
        class: "soft",
        reason: summarize("4xx temporary failure", enhanced, smtp, diag),
        shouldRetry: attempt < MAX_SOFT_ATTEMPTS,
        shouldSuppress: false,
        retryAfterSeconds: softBackoffSeconds(attempt),
        confidence: 0.85,
      };
    }
  }

  // ── 4. Diagnostic-text-only fallback ─────────────────────────────────

  if (containsAny(diag, HARD_KEYWORDS)) {
    return {
      class: "hard",
      reason: summarize("permanent failure (text)", enhanced, smtp, diag),
      shouldRetry: false,
      shouldSuppress: true,
      retryAfterSeconds: null,
      confidence: 0.75,
    };
  }

  if (containsAny(diag, SOFT_KEYWORDS)) {
    return {
      class: "soft",
      reason: summarize("temporary failure (text)", enhanced, smtp, diag),
      shouldRetry: attempt < MAX_SOFT_ATTEMPTS,
      shouldSuppress: false,
      retryAfterSeconds: softBackoffSeconds(attempt),
      confidence: 0.7,
    };
  }

  if (containsAny(diag, TRANSIENT_KEYWORDS)) {
    return {
      class: "transient",
      reason: summarize("transient (text)", enhanced, smtp, diag),
      shouldRetry: attempt < MAX_SOFT_ATTEMPTS,
      shouldSuppress: false,
      retryAfterSeconds: TRANSIENT_RETRY_SECONDS,
      confidence: 0.7,
    };
  }

  // ── 5. Unknown — limited retry with low confidence ───────────────────

  return {
    class: "unknown",
    reason: "no parseable code or keyword",
    shouldRetry: attempt < MAX_UNKNOWN_ATTEMPTS,
    shouldSuppress: false,
    retryAfterSeconds:
      attempt < MAX_UNKNOWN_ATTEMPTS ? UNKNOWN_RETRY_SECONDS : null,
    confidence: 0.2,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

/**
 * Normalize an enhanced status code to "<class>.<subject>.<detail>" form.
 * Returns `undefined` if the input is missing or doesn't match the
 * RFC 3463 shape.
 */
function normalizeEnhanced(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const match = input.trim().match(/^([245])\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return undefined;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/**
 * Return true iff the enhanced code falls in the 5.7.x policy subtree,
 * which RFC 3463 reserves for security / policy issues.
 */
function isPolicyEnhanced(enhanced: string | undefined): boolean {
  if (!enhanced) return false;
  return enhanced.startsWith("5.7.") || enhanced.startsWith("4.7.");
}

/**
 * Enhanced codes that strongly imply hard-bounce semantics regardless of
 * diagnostic text (invalid address, bad destination mailbox, etc.).
 */
function isHardEnhanced(enhanced: string | undefined): boolean {
  if (!enhanced) return false;
  return (
    enhanced === "5.1.1" ||
    enhanced === "5.1.2" ||
    enhanced === "5.1.3" ||
    enhanced === "5.1.6" ||
    enhanced === "5.1.10" ||
    enhanced === "5.2.1" ||
    enhanced === "5.4.4"
  );
}

/**
 * Enhanced codes that indicate transient / throttle conditions and
 * should be retried sooner than the normal soft-bounce backoff.
 */
function isTransientEnhanced(enhanced: string | undefined): boolean {
  if (!enhanced) return false;
  return (
    enhanced === "4.7.0" ||
    enhanced === "4.7.1" ||
    enhanced === "4.4.2" ||
    enhanced === "4.4.1" ||
    enhanced === "4.3.2"
  );
}

/**
 * Exponential backoff for soft bounces, capped so the tail spread roughly
 * covers a 72-hour retry window over {@link MAX_SOFT_ATTEMPTS} attempts.
 */
function softBackoffSeconds(attempt: number): number {
  const clamped = Math.max(0, Math.min(attempt, MAX_SOFT_ATTEMPTS));
  const raw = SOFT_BASE_DELAY_SECONDS * Math.pow(2, clamped);
  return Math.min(raw, SOFT_MAX_DELAY_SECONDS);
}

/**
 * Case-insensitive "any of" check. The haystack is already lowercased
 * at the call site for speed; keywords are stored lowercase.
 */
function containsAny(haystack: string, needles: readonly string[]): boolean {
  if (!haystack) return false;
  for (const n of needles) {
    if (haystack.includes(n)) return true;
  }
  return false;
}

/**
 * Compose a stable, truncated reason string for the verdict.
 */
function summarize(
  label: string,
  enhanced: string | undefined,
  smtp: number | undefined,
  diag: string,
): string {
  const parts: string[] = [label];
  if (enhanced) parts.push(enhanced);
  if (typeof smtp === "number" && Number.isFinite(smtp)) {
    parts.push(String(smtp));
  }
  if (diag) {
    const trimmed = diag.replace(/\s+/g, " ").trim();
    parts.push(trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed);
  }
  return parts.join(" | ");
}
