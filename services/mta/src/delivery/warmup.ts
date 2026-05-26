/**
 * @alecrae/mta — IP Warmup Pacing Engine
 *
 * Per-ISP daily send caps that ramp up gracefully over weeks, following
 * the deliverability runbook (docs/infra/deliverability.md).
 *
 * A brand-new sending IP has zero reputation. Open the firehose on day
 * one and every message lands in spam permanently. This module enforces
 * the week-by-week ramp schedule:
 *
 *   Week 1: Gmail=50 Outlook=50 Yahoo=25 Apple=25 Other=25
 *   Week 2: 2x week 1
 *   Week 3: 2x week 2
 *   Week 4: 2x week 3
 *   Week 5: 2x week 4
 *   Week 6: 2x week 5
 *   Week 7+: 2x previous day, capped at real volume (caller-supplied)
 *
 * Rules:
 *   - Never exceed 2x previous day to any single ISP.
 *   - Total-daily cap can stop sending before any per-ISP cap trips.
 *   - Counters roll at UTC midnight.
 *
 * This module is pure: no I/O, no time of its own beyond `now` arguments.
 * It is safe to run at the edge or inside a Worker.
 */

// ─── Public types ───────────────────────────────────────────────────────────

export type IspBucket = "gmail" | "outlook" | "yahoo" | "apple" | "other";

export interface WarmupState {
  readonly ipAddress: string;
  readonly warmupStartedAt: number; // epoch ms
  readonly currentDay: number;      // days since warmup start (1-indexed)
  readonly sentTodayByIsp: Readonly<Record<IspBucket, number>>;
  readonly dailyResetAt: number;    // next midnight UTC epoch ms
}

export interface WarmupLimits {
  readonly byIsp: Readonly<Record<IspBucket, number>>;
  readonly totalDaily: number;
}

export interface WarmupDecision {
  readonly allow: boolean;
  readonly reason?: string;
  readonly nextAvailableAt?: number; // epoch ms if deferred
  readonly remainingQuotaForIsp: number;
}

// ─── ISP classification ─────────────────────────────────────────────────────

/**
 * Mapping of domain suffixes to ISP buckets. Lower-cased, no leading dot.
 * Order does not matter — longest match wins via explicit check.
 */
const ISP_SUFFIX_MAP: ReadonlyMap<string, IspBucket> = new Map<string, IspBucket>([
  // Gmail / Google
  ["gmail.com", "gmail"],
  ["googlemail.com", "gmail"],
  ["google.com", "gmail"],

  // Microsoft (Outlook / Hotmail / Live / MSN / O365)
  ["outlook.com", "outlook"],
  ["hotmail.com", "outlook"],
  ["live.com", "outlook"],
  ["msn.com", "outlook"],
  ["office365.com", "outlook"],

  // Yahoo
  ["yahoo.com", "yahoo"],
  ["ymail.com", "yahoo"],
  ["rocketmail.com", "yahoo"],

  // Apple
  ["icloud.com", "apple"],
  ["me.com", "apple"],
  ["mac.com", "apple"],
]);

/**
 * Classify a recipient email address into its ISP bucket.
 *
 * Domain-suffix match only (MX lookup would be more accurate but is I/O;
 * the delivery optimizer handles MX-based routing separately). Anything
 * that doesn't match a known suffix falls into the "other" bucket, which
 * is the most conservative during warmup.
 *
 * Case-insensitive. An input without an "@" is treated as "other" rather
 * than throwing — this function is called per-message and must never
 * crash the pipeline.
 */
export function classifyRecipientIsp(email: string): IspBucket {
  const at = email.lastIndexOf("@");
  if (at === -1 || at === email.length - 1) return "other";
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (domain.length === 0) return "other";

  // Exact match first
  const exact = ISP_SUFFIX_MAP.get(domain);
  if (exact !== undefined) return exact;

  // Walk up subdomains: "mail.gmail.com" → "gmail.com"
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const match = ISP_SUFFIX_MAP.get(candidate);
    if (match !== undefined) return match;
  }

  return "other";
}

// ─── Limits computation ─────────────────────────────────────────────────────

/**
 * Canonical week-by-week limits from the deliverability runbook.
 * Index 0 = week 1, index 5 = week 6. After week 6 the caller handles
 * the "2x previous day real volume" policy.
 */
const WEEKLY_LIMITS: ReadonlyArray<Readonly<Record<IspBucket, number>>> = [
  { gmail: 50, outlook: 50, yahoo: 25, apple: 25, other: 25 },     // Week 1
  { gmail: 100, outlook: 100, yahoo: 50, apple: 50, other: 50 },    // Week 2
  { gmail: 250, outlook: 250, yahoo: 100, apple: 100, other: 100 }, // Week 3
  { gmail: 500, outlook: 500, yahoo: 250, apple: 250, other: 250 }, // Week 4
  { gmail: 1000, outlook: 1000, yahoo: 500, apple: 500, other: 500 }, // Week 5
  { gmail: 2000, outlook: 2000, yahoo: 1000, apple: 1000, other: 1000 }, // Week 6
];

const WARMUP_WEEKS = 6;
const DAYS_PER_WEEK = 7;
const WARMUP_DAYS = WARMUP_WEEKS * DAYS_PER_WEEK; // 42

/**
 * Compute the daily limits for a given warmup day (1-indexed).
 *
 * - Day 1-7  → Week 1 limits
 * - Day 8-14 → Week 2 limits
 * - ...
 * - Day 36-42 → Week 6 limits
 * - Day 43+  → 2x week 6 limits (still clamped per-send by the caller's
 *              "2x previous day real volume" policy, which is outside the
 *              pure limits calculation).
 *
 * The `totalDaily` field is the sum of all per-ISP caps, i.e. the absolute
 * ceiling on messages sent in a single UTC day regardless of destination mix.
 * The caller may treat `totalDaily` as a hard cap that overrides any
 * individual ISP bucket's remaining quota.
 */
export function computeLimitsForDay(day: number): WarmupLimits {
  // Defensive: clamp day to at least 1
  const safeDay = Math.max(1, Math.floor(day));

  let byIsp: Record<IspBucket, number>;

  if (safeDay <= WARMUP_DAYS) {
    // Inside the 6-week warmup window
    const weekIndex = Math.floor((safeDay - 1) / DAYS_PER_WEEK); // 0..5
    const week = WEEKLY_LIMITS[weekIndex];
    // Index is bounded above by construction, but TS strict + noUnchecked
    // forces us to narrow.
    if (!week) {
      // Should be unreachable; fall back to week 1 for safety.
      const fallback = WEEKLY_LIMITS[0];
      if (!fallback) throw new Error("Warmup schedule misconfigured");
      byIsp = { ...fallback };
    } else {
      byIsp = { ...week };
    }
  } else {
    // Past day 42: 2x week 6 as a baseline. The caller is responsible for
    // the real-volume cap; we just expose the schedule ceiling.
    const week6 = WEEKLY_LIMITS[WARMUP_WEEKS - 1];
    if (!week6) throw new Error("Warmup schedule misconfigured");
    const scale = Math.pow(2, safeDay - WARMUP_DAYS);
    byIsp = {
      gmail: week6.gmail * scale,
      outlook: week6.outlook * scale,
      yahoo: week6.yahoo * scale,
      apple: week6.apple * scale,
      other: week6.other * scale,
    };
  }

  const totalDaily =
    byIsp.gmail + byIsp.outlook + byIsp.yahoo + byIsp.apple + byIsp.other;

  return { byIsp, totalDaily };
}

// ─── Decision ───────────────────────────────────────────────────────────────

/**
 * Sum every bucket in the per-ISP counter. Pure helper.
 */
function sumSent(sent: Readonly<Record<IspBucket, number>>): number {
  return sent.gmail + sent.outlook + sent.yahoo + sent.apple + sent.other;
}

/**
 * Decide whether a send to `recipient` is currently allowed under the
 * warmup schedule.
 *
 * Order of checks (first failure wins):
 *   1. Per-ISP daily cap — have we already hit the ceiling for this bucket?
 *   2. Total-daily cap   — have we hit the aggregate ceiling across all ISPs?
 *
 * When a cap has been hit, the decision includes `nextAvailableAt` set to
 * `state.dailyResetAt` — the next UTC midnight — because daily counters
 * only roll over on that schedule.
 *
 * `remainingQuotaForIsp` is always the ISP-specific remaining count after
 * considering the per-ISP cap (clamped at zero). It reflects the per-ISP
 * view and does not factor in the total-daily cap; callers who want the
 * effective remaining (min of per-ISP and total remaining) should compute
 * it themselves from `WarmupLimits`.
 */
export function shouldAllowSend(
  state: WarmupState,
  recipient: string,
): WarmupDecision {
  const bucket = classifyRecipientIsp(recipient);
  const limits = computeLimitsForDay(state.currentDay);
  const ispCap = limits.byIsp[bucket];
  const ispSent = state.sentTodayByIsp[bucket];
  const remainingQuotaForIsp = Math.max(0, ispCap - ispSent);

  // 1. Per-ISP cap
  if (ispSent >= ispCap) {
    return {
      allow: false,
      reason: `ISP cap reached for ${bucket} (${ispSent}/${ispCap})`,
      nextAvailableAt: state.dailyResetAt,
      remainingQuotaForIsp: 0,
    };
  }

  // 2. Total-daily cap (overrides per-ISP remaining)
  const totalSent = sumSent(state.sentTodayByIsp);
  if (totalSent >= limits.totalDaily) {
    return {
      allow: false,
      reason: `Total daily cap reached (${totalSent}/${limits.totalDaily})`,
      nextAvailableAt: state.dailyResetAt,
      remainingQuotaForIsp,
    };
  }

  return {
    allow: true,
    remainingQuotaForIsp,
  };
}

// ─── State transitions (immutable) ──────────────────────────────────────────

/**
 * Record a single successful send. Returns a new `WarmupState` with the
 * appropriate per-ISP counter incremented by one. The caller is
 * responsible for persisting the returned state.
 *
 * This function does NOT check caps — that is `shouldAllowSend`'s job.
 * Recording a send that would have been disallowed is a caller bug.
 */
export function recordSend(state: WarmupState, recipient: string): WarmupState {
  const bucket = classifyRecipientIsp(recipient);
  const next: Record<IspBucket, number> = {
    gmail: state.sentTodayByIsp.gmail,
    outlook: state.sentTodayByIsp.outlook,
    yahoo: state.sentTodayByIsp.yahoo,
    apple: state.sentTodayByIsp.apple,
    other: state.sentTodayByIsp.other,
  };
  next[bucket] = next[bucket] + 1;
  return {
    ipAddress: state.ipAddress,
    warmupStartedAt: state.warmupStartedAt,
    currentDay: state.currentDay,
    sentTodayByIsp: next,
    dailyResetAt: state.dailyResetAt,
  };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Zero per-ISP counters and advance `dailyResetAt` if `now` has crossed
 * the reset boundary. If not yet due, returns the state unchanged (same
 * reference) for cheap equality checks.
 *
 * If the caller has been idle for multiple days, this function rolls
 * forward the appropriate number of whole days in one step so
 * `dailyResetAt` is always the *next* upcoming UTC midnight relative to
 * `now`. `currentDay` advances accordingly.
 *
 * `now` defaults to `Date.now()` but is injectable for determinism in
 * tests.
 */
export function rollDailyCountersIfNeeded(
  state: WarmupState,
  now: number = Date.now(),
): WarmupState {
  if (now < state.dailyResetAt) {
    return state;
  }

  // How many whole days have we crossed since dailyResetAt?
  // At least 1 (we are at or past the boundary). Could be more if idle.
  const daysCrossed = Math.floor((now - state.dailyResetAt) / MS_PER_DAY) + 1;
  const newResetAt = state.dailyResetAt + daysCrossed * MS_PER_DAY;
  const newCurrentDay = state.currentDay + daysCrossed;

  return {
    ipAddress: state.ipAddress,
    warmupStartedAt: state.warmupStartedAt,
    currentDay: newCurrentDay,
    sentTodayByIsp: {
      gmail: 0,
      outlook: 0,
      yahoo: 0,
      apple: 0,
      other: 0,
    },
    dailyResetAt: newResetAt,
  };
}
