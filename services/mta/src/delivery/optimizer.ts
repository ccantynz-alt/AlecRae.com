/**
 * @alecrae/mta — Delivery Optimizer
 *
 * Orchestrates outbound email delivery with ISP-aware throttling,
 * MX preference ordering, exponential back-off with jitter, connection
 * pooling, and per-domain rate limiting.
 *
 * Key RFCs:
 *   - RFC 5321  §5   Domain name resolution / MX handling
 *   - RFC 7505  Null MX (no mail service)
 */

import { randomUUID, randomInt } from "node:crypto";
import { promises as dns } from "node:dns";
import {
  type DeliveryAttempt,
  type IspProfile,
  type ConnectionPool,
  type RetryStrategy,
  type ThrottleState,
  type Result,
  ok,
  err,
} from "../types.js";

// ─── MX record as returned by Node's DNS resolver ──────────────────────────

interface MxRecord {
  exchange: string;
  priority: number;
}

// ─── Delivery result returned by deliverMessage ─────────────────────────────

export interface DeliveryResult {
  attempt: DeliveryAttempt;
  /** Whether to retry (set when status is "deferred"). */
  shouldRetry: boolean;
  /** When to retry next, if applicable. */
  retryAt: Date | null;
}

// ─── Default ISP profile for unknown domains ───────────────────────────────

const DEFAULT_ISP_PROFILE: IspProfile = {
  domain: "*",
  maxConcurrentConnections: 5,
  maxMessagesPerConnection: 100,
  maxMessagesPerHour: 1000,
  maxMessagesPerDay: 20000,
  minConnectionInterval: 1000,
  preferredTls: true,
  supportsSmtpUtf8: false,
  notes: "Default profile for unknown ISPs",
};

// ─── Well-known ISP profiles ────────────────────────────────────────────────

const WELL_KNOWN_PROFILES: ReadonlyMap<string, IspProfile> = new Map([
  [
    "gmail.com",
    {
      domain: "gmail.com",
      maxConcurrentConnections: 10,
      maxMessagesPerConnection: 100,
      maxMessagesPerHour: 3600,
      maxMessagesPerDay: 50000,
      minConnectionInterval: 500,
      preferredTls: true,
      supportsSmtpUtf8: true,
      notes: "Google Gmail — also applies to Google Workspace",
    },
  ],
  [
    "outlook.com",
    {
      domain: "outlook.com",
      maxConcurrentConnections: 5,
      maxMessagesPerConnection: 50,
      maxMessagesPerHour: 2000,
      maxMessagesPerDay: 30000,
      minConnectionInterval: 1000,
      preferredTls: true,
      supportsSmtpUtf8: false,
      notes: "Microsoft Outlook / Hotmail / Live",
    },
  ],
  [
    "yahoo.com",
    {
      domain: "yahoo.com",
      maxConcurrentConnections: 5,
      maxMessagesPerConnection: 50,
      maxMessagesPerHour: 1500,
      maxMessagesPerDay: 25000,
      minConnectionInterval: 1000,
      preferredTls: true,
      supportsSmtpUtf8: false,
      notes: "Yahoo Mail — conservative limits",
    },
  ],
]);

// ─── DeliveryOptimizer ──────────────────────────────────────────────────────

/**
 * Coordinates outbound delivery for one or more domains, respecting
 * ISP-specific throttle limits, managing connection pools, and
 * implementing retry with exponential back-off + jitter.
 *
 * Architecture:
 * ```
 * deliverMessage()
 *   ├─ resolveMx()            → ordered MX list
 *   ├─ selectMxHost()         → best available MX
 *   ├─ checkThrottle()        → block if rate-limited
 *   ├─ acquireConnection()    → from pool or new
 *   ├─ send via SMTP client   → (caller-supplied transport)
 *   └─ handleResult()         → update throttle state, schedule retry
 * ```
 */
export class DeliveryOptimizer {
  /** Per-domain throttle state. */
  private readonly throttleStates = new Map<string, ThrottleState>();

  /** Per-host connection pool counters. */
  private readonly connectionPools = new Map<string, ConnectionPool>();

  /** Custom ISP profiles supplied at construction time. */
  private readonly ispProfiles = new Map<string, IspProfile>();

  /** MX resolution cache: domain → ordered MX list. */
  private readonly mxCache = new Map<string, { records: MxRecord[]; expiresAt: number }>();

  /** Default retry strategy. */
  private readonly retryStrategy: RetryStrategy;

  /** TTL for cached MX records in milliseconds (default 5 min). */
  private readonly mxCacheTtlMs: number;

  constructor(options?: {
    retryStrategy?: RetryStrategy;
    ispProfiles?: IspProfile[];
    mxCacheTtlMs?: number;
  }) {
    this.retryStrategy = options?.retryStrategy ?? {
      maxAttempts: 8,
      baseDelay: 60_000,
      maxDelay: 6 * 60 * 60 * 1000, // 6 hours
      backoffMultiplier: 2,
      jitterFactor: 0.25,
    };

    this.mxCacheTtlMs = options?.mxCacheTtlMs ?? 5 * 60 * 1000;

    // Seed with well-known profiles
    for (const [domain, profile] of WELL_KNOWN_PROFILES) {
      this.ispProfiles.set(domain, profile);
    }

    // Override / extend with user-supplied profiles
    if (options?.ispProfiles) {
      for (const profile of options.ispProfiles) {
        this.ispProfiles.set(profile.domain.toLowerCase(), profile);
      }
    }
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Orchestrate a single delivery attempt for a message to one recipient.
   *
   * @param messageId     - Unique message identifier.
   * @param recipient     - Recipient email address.
   * @param rawMessage    - Complete RFC-5322 message (headers + body).
   * @param from          - MAIL FROM address.
   * @param transport     - Callback that performs the actual SMTP send.
   *   Receives the chosen MX host, port, and the raw message. Must return
   *   `{ code, message }` on success or throw on connection failure.
   * @param currentAttempt - Zero-based attempt counter.
   */
  async deliverMessage(
    messageId: string,
    recipient: string,
    rawMessage: string,
    from: string,
    transport: (host: string, port: number, from: string, to: string, data: string) => Promise<{ code: number; message: string }>,
    currentAttempt = 0,
  ): Promise<Result<DeliveryResult>> {
    const domain = domainOf(recipient);
    const attemptId = randomUUID();

    const attempt: DeliveryAttempt = {
      id: attemptId,
      messageId,
      recipient,
      mxHost: "",
      status: "pending",
      attempts: currentAttempt + 1,
      maxAttempts: this.retryStrategy.maxAttempts,
      nextRetryAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 1. Resolve MX records
    const mxResult = await this.resolveMx(domain);
    if (!mxResult.ok) {
      attempt.status = "bounced";
      attempt.lastError = `MX resolution failed: ${mxResult.error.message}`;
      return ok({ attempt, shouldRetry: false, retryAt: null });
    }

    // 2. Select best MX host
    const mxHost = this.selectMxHost(mxResult.value, domain);
    if (!mxHost.ok) {
      attempt.status = "bounced";
      attempt.lastError = mxHost.error.message;
      return ok({ attempt, shouldRetry: false, retryAt: null });
    }

    attempt.mxHost = mxHost.value.exchange;

    // 3. Check throttle
    const throttleCheck = this.checkThrottle(domain);
    if (!throttleCheck.ok) {
      attempt.status = "deferred";
      attempt.lastError = "Domain throttled";
      const retryAt = this.computeRetryTime(currentAttempt);
      attempt.nextRetryAt = retryAt;
      return ok({ attempt, shouldRetry: true, retryAt });
    }

    // 4. Check connection pool capacity
    const poolCheck = this.acquireConnection(mxHost.value.exchange, 25);
    if (!poolCheck.ok) {
      attempt.status = "deferred";
      attempt.lastError = "Connection pool exhausted";
      const retryAt = this.computeRetryTime(currentAttempt);
      attempt.nextRetryAt = retryAt;
      return ok({ attempt, shouldRetry: true, retryAt });
    }

    // 5. Attempt delivery via transport
    attempt.status = "connecting";
    attempt.updatedAt = new Date();

    try {
      attempt.status = "sending";
      const response = await transport(
        mxHost.value.exchange,
        25,
        from,
        recipient,
        rawMessage,
      );

      attempt.lastStatusCode = response.code;

      if (response.code >= 200 && response.code < 300) {
        attempt.status = "delivered";
        this.recordSend(domain, mxHost.value.exchange);
      } else if (response.code >= 400 && response.code < 500) {
        // Temporary failure — defer
        attempt.status = "deferred";
        attempt.lastError = response.message;
        if (currentAttempt + 1 < this.retryStrategy.maxAttempts) {
          const isGreylist = response.code === 421 || response.code === 450 ||
            /try again|greylisting|too many connections|rate limit/i.test(response.message);
          const retryAt = isGreylist
            ? new Date(Date.now() + (currentAttempt === 0 ? 30 * 60_000 : 60 * 60_000) + Math.random() * 5 * 60_000)
            : this.computeRetryTime(currentAttempt);
          attempt.nextRetryAt = retryAt;
          this.releaseConnection(mxHost.value.exchange);
          return ok({ attempt, shouldRetry: true, retryAt });
        }
        // Exhausted retries
        attempt.status = "bounced";
      } else if (response.code >= 500) {
        // Permanent failure
        attempt.status = "bounced";
        attempt.lastError = response.message;
      }

      this.releaseConnection(mxHost.value.exchange);
      attempt.updatedAt = new Date();
      return ok({ attempt, shouldRetry: false, retryAt: null });
    } catch (e: unknown) {
      this.releaseConnection(mxHost.value.exchange);
      const errorMessage = e instanceof Error ? e.message : String(e);
      attempt.status = "deferred";
      attempt.lastError = errorMessage;
      attempt.updatedAt = new Date();

      if (currentAttempt + 1 < this.retryStrategy.maxAttempts) {
        const retryAt = this.computeRetryTime(currentAttempt);
        attempt.nextRetryAt = retryAt;
        return ok({ attempt, shouldRetry: true, retryAt });
      }

      attempt.status = "bounced";
      return ok({ attempt, shouldRetry: false, retryAt: null });
    }
  }

  /**
   * Select the best MX host for a domain from a resolved MX list.
   *
   * Strategy:
   * 1. Sort by MX priority (lowest number = highest preference, RFC 5321 §5).
   * 2. Among equal-priority hosts, prefer those with warm connections.
   * 3. Among equal-priority hosts without warm connections, randomise
   *    (load-balancing per RFC 5321 §5).
   * 4. Reject null MX ("." — RFC 7505).
   */
  selectMxHost(mxRecords: MxRecord[], domain: string): Result<MxRecord> {
    if (mxRecords.length === 0) {
      return err(new Error(`No MX records available for ${domain}`));
    }

    // RFC 7505: null MX record means domain does not accept mail.
    if (mxRecords.length === 1 && mxRecords[0]?.exchange === ".") {
      return err(new Error(`Domain ${domain} has a null MX record (RFC 7505) — does not accept mail`));
    }

    // Filter out null MX entries if mixed (shouldn't happen per RFC but be safe)
    const valid = mxRecords.filter((r) => r.exchange !== ".");
    if (valid.length === 0) {
      return err(new Error(`No valid MX records for ${domain}`));
    }

    // Sort by priority ascending
    const sorted = [...valid].sort((a, b) => a.priority - b.priority);

    // Group by priority
    const first = sorted[0];
    if (!first) {
      return err(new Error(`No valid MX records for ${domain}`));
    }
    const bestPriority = first.priority;
    const candidates = sorted.filter((r) => r.priority === bestPriority);

    // Prefer hosts with an existing warm connection in the pool
    const warm = candidates.filter((r) => {
      const pool = this.connectionPools.get(r.exchange);
      return pool && pool.idleConnections > 0;
    });

    if (warm.length > 0) {
      // Pick a random warm host (load balance)
      const idx = randomInt(warm.length);
      const chosen = warm[idx];
      if (chosen) return ok(chosen);
    }

    // Random selection among equal-priority candidates
    const idx = randomInt(candidates.length);
    const chosen = candidates[idx] ?? first;
    return ok(chosen);
  }

  /**
   * Resolve MX records for a domain, using the internal cache.
   *
   * Falls back to A/AAAA records per RFC 5321 §5 when no MX records exist.
   */
  async resolveMx(domain: string): Promise<Result<MxRecord[]>> {
    // Check cache
    const cached = this.mxCache.get(domain);
    if (cached && cached.expiresAt > Date.now()) {
      return ok(cached.records);
    }

    try {
      const records = await dns.resolveMx(domain);

      if (records.length === 0) {
        // RFC 5321 §5: If no MX records, use the domain itself as an
        // implicit MX with priority 0.
        const implicitMx: MxRecord[] = [{ exchange: domain, priority: 0 }];
        this.mxCache.set(domain, {
          records: implicitMx,
          expiresAt: Date.now() + this.mxCacheTtlMs,
        });
        return ok(implicitMx);
      }

      // Sort by priority ascending
      records.sort((a, b) => a.priority - b.priority);

      this.mxCache.set(domain, {
        records,
        expiresAt: Date.now() + this.mxCacheTtlMs,
      });

      return ok(records);
    } catch (e: unknown) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  // ── Throttling ──────────────────────────────────────────────────────────

  /**
   * Get the current throttle state for a domain. Creates a new state
   * entry if one does not exist.
   */
  getThrottleState(domain: string): ThrottleState {
    let state = this.throttleStates.get(domain);
    if (!state) {
      state = {
        domain,
        messagesThisHour: 0,
        messagesThisDay: 0,
        connectionsActive: 0,
        lastSendAt: null,
        throttled: false,
        throttledUntil: null,
      };
      this.throttleStates.set(domain, state);
    }
    return state;
  }

  /**
   * Check whether we are allowed to send to a domain right now.
   *
   * Returns `ok(undefined)` if sending is allowed, or `err` with a reason.
   */
  private checkThrottle(domain: string): Result<void> {
    const state = this.getThrottleState(domain);

    // Check manual throttle
    if (state.throttled && state.throttledUntil) {
      if (state.throttledUntil.getTime() > Date.now()) {
        return err(new Error(`Domain ${domain} throttled until ${state.throttledUntil.toISOString()}`));
      }
      // Throttle expired — reset
      state.throttled = false;
      state.throttledUntil = null;
    }

    const profile = this.getIspProfile(domain);

    // Hourly limit
    if (state.messagesThisHour >= profile.maxMessagesPerHour) {
      state.throttled = true;
      state.throttledUntil = new Date(Date.now() + 60 * 60 * 1000);
      return err(new Error(`Hourly limit (${profile.maxMessagesPerHour}) reached for ${domain}`));
    }

    // Daily limit
    if (state.messagesThisDay >= profile.maxMessagesPerDay) {
      state.throttled = true;
      // Reset at midnight UTC
      const tomorrow = new Date();
      tomorrow.setUTCHours(24, 0, 0, 0);
      state.throttledUntil = tomorrow;
      return err(new Error(`Daily limit (${profile.maxMessagesPerDay}) reached for ${domain}`));
    }

    // Min connection interval
    if (state.lastSendAt) {
      const elapsed = Date.now() - state.lastSendAt.getTime();
      if (elapsed < profile.minConnectionInterval) {
        return err(new Error(`Min interval (${profile.minConnectionInterval}ms) not yet elapsed for ${domain}`));
      }
    }

    // Concurrent connection limit
    if (state.connectionsActive >= profile.maxConcurrentConnections) {
      return err(new Error(`Max concurrent connections (${profile.maxConcurrentConnections}) reached for ${domain}`));
    }

    return ok(undefined);
  }

  /**
   * Record a successful send, incrementing throttle counters.
   */
  private recordSend(domain: string, mxHost: string): void {
    const state = this.getThrottleState(domain);
    state.messagesThisHour += 1;
    state.messagesThisDay += 1;
    state.lastSendAt = new Date();

    // Update pool stats
    const pool = this.connectionPools.get(mxHost);
    if (pool) {
      pool.totalDelivered += 1;
      pool.lastActivityAt = new Date();
    }
  }

  // ── Connection pool management ──────────────────────────────────────────

  /**
   * Acquire a connection slot from the pool for a given host.
   *
   * This is a logical reservation — the actual TCP connection is managed
   * by the transport layer. We just track concurrency here.
   */
  private acquireConnection(host: string, port: number): Result<void> {
    let pool = this.connectionPools.get(host);
    if (!pool) {
      const domain = host; // approximate
      const profile = this.getIspProfile(domain);
      pool = {
        host,
        port,
        activeConnections: 0,
        idleConnections: 0,
        maxConnections: profile.maxConcurrentConnections,
        totalDelivered: 0,
        lastActivityAt: new Date(),
      };
      this.connectionPools.set(host, pool);
    }

    if (pool.activeConnections >= pool.maxConnections) {
      return err(new Error(`Connection pool for ${host} is full (${pool.maxConnections} max)`));
    }

    pool.activeConnections += 1;
    if (pool.idleConnections > 0) {
      pool.idleConnections -= 1;
    }
    pool.lastActivityAt = new Date();
    return ok(undefined);
  }

  /**
   * Release a connection slot back to the pool.
   */
  private releaseConnection(host: string): void {
    const pool = this.connectionPools.get(host);
    if (!pool) return;
    if (pool.activeConnections > 0) {
      pool.activeConnections -= 1;
    }
    pool.idleConnections += 1;
    pool.lastActivityAt = new Date();
  }

  /**
   * Return the connection pool state for a host (for monitoring).
   */
  getConnectionPool(host: string): ConnectionPool | undefined {
    return this.connectionPools.get(host);
  }

  // ── Retry computation ─────────────────────────────────────────────────

  /**
   * Compute the next retry time using exponential back-off with jitter.
   *
   * Formula:
   *   delay = min(baseDelay × multiplier^attempt, maxDelay)
   *   jitter = delay × jitterFactor × random(-1, 1)
   *   retryAt = now + delay + jitter
   *
   * This avoids thundering-herd problems when many messages to the
   * same domain are deferred simultaneously.
   */
  private computeRetryTime(currentAttempt: number): Date {
    const { baseDelay, maxDelay, backoffMultiplier, jitterFactor } =
      this.retryStrategy;

    const raw = baseDelay * Math.pow(backoffMultiplier, currentAttempt);
    const capped = Math.min(raw, maxDelay);

    // Jitter: ±jitterFactor of the capped delay
    const jitter = capped * jitterFactor * (2 * Math.random() - 1);
    const finalDelay = Math.max(0, capped + jitter);

    return new Date(Date.now() + finalDelay);
  }

  // ── ISP profiles ──────────────────────────────────────────────────────

  /**
   * Look up the ISP profile for a domain.
   *
   * Checks for an exact match first, then walks up the domain hierarchy
   * (e.g. "mail.google.com" → "google.com"), then falls back to the
   * default profile.
   */
  getIspProfile(domain: string): IspProfile {
    const lower = domain.toLowerCase();

    // Exact match
    const exact = this.ispProfiles.get(lower);
    if (exact) return exact;

    // Walk up the domain (strip leading label)
    const parts = lower.split(".");
    for (let i = 1; i < parts.length - 1; i++) {
      const parent = parts.slice(i).join(".");
      const match = this.ispProfiles.get(parent);
      if (match) return match;
    }

    return DEFAULT_ISP_PROFILE;
  }

  /**
   * Register or update a custom ISP profile.
   */
  setIspProfile(profile: IspProfile): void {
    this.ispProfiles.set(profile.domain.toLowerCase(), profile);
  }

  // ── Maintenance ───────────────────────────────────────────────────────

  /**
   * Reset hourly throttle counters.
   * Should be called by an external scheduler every hour.
   */
  resetHourlyCounters(): void {
    for (const state of this.throttleStates.values()) {
      state.messagesThisHour = 0;
      if (state.throttled && state.throttledUntil && state.throttledUntil.getTime() <= Date.now()) {
        state.throttled = false;
        state.throttledUntil = null;
      }
    }
  }

  /**
   * Reset daily throttle counters.
   * Should be called by an external scheduler once per day (midnight UTC).
   */
  resetDailyCounters(): void {
    for (const state of this.throttleStates.values()) {
      state.messagesThisDay = 0;
      state.messagesThisHour = 0;
      state.throttled = false;
      state.throttledUntil = null;
    }
  }

  /**
   * Evict stale entries from the MX cache and idle connection pools.
   */
  pruneStaleState(maxIdleMs = 5 * 60 * 1000): void {
    const now = Date.now();

    // Prune expired MX cache entries
    for (const [domain, entry] of this.mxCache) {
      if (entry.expiresAt <= now) {
        this.mxCache.delete(domain);
      }
    }

    // Prune idle connection pools
    for (const [host, pool] of this.connectionPools) {
      if (
        pool.activeConnections === 0 &&
        now - pool.lastActivityAt.getTime() > maxIdleMs
      ) {
        this.connectionPools.delete(host);
      }
    }
  }
}

// ─── Internal utilities ─────────────────────────────────────────────────────

/** Extract the domain from an email address. */
function domainOf(address: string): string {
  const idx = address.lastIndexOf("@");
  return idx === -1 ? address : address.slice(idx + 1).toLowerCase();
}
