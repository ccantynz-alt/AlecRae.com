/**
 * @alecrae/mta — IP Warmup Gate (persistence + enforcement)
 *
 * `warmup.ts` is a pure policy module: it knows the week-by-week ramp
 * schedule and can decide whether a send fits under the caps. It has no
 * storage and no callers other than its own tests, which meant the ramp
 * schedule was documented and computed but never actually enforced — the
 * delivery worker would happily send unlimited volume from a brand-new IP
 * on day one, which is the single most reliable way to get a sending IP
 * blocklisted and a domain's mail rejected outright.
 *
 * This module supplies the missing half: durable per-day counters and an
 * atomic reserve-or-refuse gate the worker calls before every recipient.
 *
 * ── Counting model ──────────────────────────────────────────────────────
 * Counters are keyed by (sending identity, UTC date, ISP bucket) and expire
 * automatically two days after the day they cover, so the store never grows.
 *
 * An *attempt* consumes quota, not a *success*. A message that the remote
 * server rejects still cost us a connection and a reputation signal at that
 * ISP, so quota is reserved before delivery and never released. Erring
 * toward under-sending is the entire point of a warmup ramp.
 *
 * ── Concurrency ─────────────────────────────────────────────────────────
 * Reservation is INCR-then-compare, not read-then-write: the counter is
 * incremented atomically first, and rolled back if the new value exceeds
 * the cap. Two workers racing can therefore refuse a send that would have
 * fit, but can never jointly exceed a cap. Refusing slightly early is the
 * safe direction; over-sending is not.
 *
 * ── Availability ────────────────────────────────────────────────────────
 * Without Redis the gate falls back to in-process counters rather than
 * failing open. A per-process cap is weaker than a shared one (N workers
 * could send N× the cap), but it is bounded, whereas failing open is not.
 * This mirrors the Redis-independent circuit breaker already used for AI
 * spend in apps/api.
 */

import type Redis from "ioredis";
import {
  classifyRecipientIsp,
  computeLimitsForDay,
  type IspBucket,
} from "./warmup.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Counters cover one UTC day; keep them briefly afterwards for debugging. */
const COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

export interface WarmupGateDecision {
  readonly allow: boolean;
  /** Human-readable cause, present only when `allow` is false. */
  readonly reason?: string;
  /** Which bucket the recipient was classified into. */
  readonly isp: IspBucket;
  /** 1-indexed warmup day the decision was made against. */
  readonly day: number;
}

export interface WarmupGateOptions {
  /** Shared counter store. When null, per-process counters are used. */
  readonly redis?: Redis | null;
  /**
   * Identity that carries the sending reputation — the public IP where
   * possible, otherwise the MTA hostname. Only used to namespace counters.
   */
  readonly identity: string;
  /** Epoch ms when this IP first started sending. */
  readonly warmupStartedAt: number;
  /**
   * When false the gate allows everything. Only appropriate for an IP with
   * established reputation; a new IP must never run with this off.
   */
  readonly enabled: boolean;
}

/** Resolve gate configuration from the environment. */
export function warmupGateOptionsFromEnv(
  identity: string,
  env: NodeJS.ProcessEnv = process.env,
): Omit<WarmupGateOptions, "redis"> {
  // Explicit opt-out only. An unset variable means enabled, because the
  // dangerous default is the permissive one.
  const enabled = env["MTA_WARMUP_ENABLED"]?.trim().toLowerCase() !== "false";

  const configured = env["MTA_WARMUP_STARTED_AT"]?.trim();
  let warmupStartedAt = Date.now();
  if (configured) {
    const parsed = Date.parse(configured);
    if (Number.isFinite(parsed)) {
      warmupStartedAt = parsed;
    } else {
      console.warn(
        `[warmup-gate] MTA_WARMUP_STARTED_AT is not a parseable date ("${configured}") — ` +
          "treating today as warmup day 1 (the most restrictive reading).",
      );
    }
  }

  return { identity, warmupStartedAt, enabled };
}

/**
 * Enforces the warmup ramp for one sending identity.
 *
 * Construct once per worker and call {@link reserve} before each recipient.
 */
export class WarmupGate {
  private readonly redis: Redis | null;
  private readonly identity: string;
  private readonly warmupStartedAt: number;
  private readonly enabled: boolean;

  /** Fallback counters when Redis is unavailable: key → count. */
  private readonly localCounters = new Map<string, number>();
  /** UTC date the local counters cover; a change clears them. */
  private localCounterDay = "";

  constructor(options: WarmupGateOptions) {
    this.redis = options.redis ?? null;
    this.identity = options.identity;
    this.warmupStartedAt = options.warmupStartedAt;
    this.enabled = options.enabled;
  }

  /** 1-indexed warmup day for `now`. Day 1 is the day sending began. */
  currentDay(now: number = Date.now()): number {
    const elapsed = now - this.warmupStartedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
    return Math.floor(elapsed / MS_PER_DAY) + 1;
  }

  /**
   * Reserve quota for one message to `recipient`.
   *
   * Returns `allow: true` only if the message fits under both the per-ISP
   * and total-daily caps for the current warmup day, having already
   * consumed the quota. A refusal consumes nothing.
   *
   * Never throws: a store error degrades to the local counters rather than
   * blocking delivery on infrastructure noise.
   */
  async reserve(
    recipient: string,
    now: number = Date.now(),
  ): Promise<WarmupGateDecision> {
    const isp = classifyRecipientIsp(recipient);
    const day = this.currentDay(now);

    if (!this.enabled) {
      return { allow: true, isp, day };
    }

    const limits = computeLimitsForDay(day);
    const ispCap = limits.byIsp[isp];
    const dateKey = utcDateKey(now);

    // Per-ISP cap first, then the aggregate cap. Both are reserved; if the
    // second refuses, the first is rolled back so a refusal is free.
    const ispKey = this.counterKey(dateKey, isp);
    const ispCount = await this.increment(ispKey, now);
    if (ispCount > ispCap) {
      await this.decrement(ispKey, now);
      return {
        allow: false,
        reason: `warmup day ${day}: ${isp} daily cap reached (${ispCap})`,
        isp,
        day,
      };
    }

    const totalKey = this.counterKey(dateKey, "total");
    const totalCount = await this.increment(totalKey, now);
    if (totalCount > limits.totalDaily) {
      await this.decrement(totalKey, now);
      await this.decrement(ispKey, now);
      return {
        allow: false,
        reason: `warmup day ${day}: total daily cap reached (${limits.totalDaily})`,
        isp,
        day,
      };
    }

    return { allow: true, isp, day };
  }

  private counterKey(dateKey: string, bucket: string): string {
    return `mta:warmup:${this.identity}:${dateKey}:${bucket}`;
  }

  private async increment(key: string, now: number): Promise<number> {
    if (this.redis) {
      try {
        const value = await this.redis.incr(key);
        // Only the first write needs an expiry; setting it every time would
        // slide the window forward and keep counters alive indefinitely.
        if (value === 1) {
          await this.redis.expire(key, COUNTER_TTL_SECONDS);
        }
        return value;
      } catch (error) {
        console.warn(
          `[warmup-gate] Redis unavailable (${String(error)}) — falling back to ` +
            "per-process counters. Caps are still enforced, but only within this process.",
        );
      }
    }
    return this.bumpLocal(key, 1, now);
  }

  private async decrement(key: string, now: number): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.decr(key);
        return;
      } catch {
        // Fall through to the local counter; the Redis warning was already
        // emitted by the paired increment.
      }
    }
    this.bumpLocal(key, -1, now);
  }

  /** Adjust an in-process counter, resetting the whole set on a day change. */
  private bumpLocal(key: string, delta: number, now: number): number {
    const dateKey = utcDateKey(now);
    if (dateKey !== this.localCounterDay) {
      this.localCounters.clear();
      this.localCounterDay = dateKey;
    }
    const next = (this.localCounters.get(key) ?? 0) + delta;
    this.localCounters.set(key, next);
    return next;
  }
}

/** `YYYY-MM-DD` in UTC — counters roll at UTC midnight, per the ramp schedule. */
function utcDateKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}
