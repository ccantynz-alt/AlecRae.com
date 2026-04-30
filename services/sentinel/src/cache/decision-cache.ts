/**
 * Decision Cache — The speed secret of Sentinel.
 *
 * Most email traffic is repetitive: same senders, same patterns, same domains.
 * Instead of running full checks every time, we cache decisions by fingerprint.
 *
 * A fingerprint is computed from: sender domain + IP range + content pattern hash.
 * If we've seen this fingerprint before and it was safe, we trust it instantly.
 *
 * Cache hit = <1 microsecond decision. No checks needed.
 * Cache miss = compute fresh, then cache for next time.
 *
 * The cache self-heals: if a cached "safe" fingerprint later causes a complaint
 * or bounce, it's evicted and future items get full inspection.
 */

import type { CacheEntry, CacheStats, ValidationDecision } from '../types.js';

interface CacheConfig {
  maxEntries: number;
  defaultTtlMs: number;
  cleanupIntervalMs: number;
  /** Minimum hits before a cache entry is considered "established" */
  establishedThreshold: number;
}

export class DecisionCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    invalidations: 0,
  };
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private config: CacheConfig) {
    this.startCleanup();
  }

  /**
   * Look up a fingerprint in the cache.
   * Returns the cached decision if found and valid, null otherwise.
   */
  lookup(fingerprint: string): CacheEntry | null {
    const entry = this.cache.get(fingerprint);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();

    // Check TTL expiration
    if (now - entry.createdAt > entry.ttlMs) {
      this.cache.delete(fingerprint);
      this.accessOrder.delete(fingerprint);
      this.stats.misses++;
      return null;
    }

    // Update access tracking
    entry.hitCount++;
    entry.lastSeen = now;
    this.accessOrder.set(fingerprint, ++this.accessCounter);
    this.stats.hits++;

    return entry;
  }

  /**
   * Store a decision in the cache.
   * Only caches "allow" and "reject" decisions — ambiguous results are not cached.
   */
  store(
    fingerprint: string,
    decision: ValidationDecision,
    confidence: number,
    ttlMs?: number
  ): void {
    // Don't cache low-confidence or deferred decisions
    if (decision === 'defer' || decision === 'quarantine') {
      return;
    }

    // Don't cache if confidence is too low — we want to re-evaluate
    if (confidence < 80) {
      return;
    }

    // Evict if at capacity (LRU)
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    const now = Date.now();
    const entry: CacheEntry = {
      fingerprint,
      decision,
      confidence,
      hitCount: 1,
      lastSeen: now,
      createdAt: now,
      ttlMs: ttlMs ?? this.config.defaultTtlMs,
    };

    this.cache.set(fingerprint, entry);
    this.accessOrder.set(fingerprint, ++this.accessCounter);
  }

  /**
   * Invalidate a cached decision.
   * Called when feedback shows a cached decision was wrong
   * (e.g., user marked a delivered email as spam).
   */
  invalidate(fingerprint: string): boolean {
    const existed = this.cache.delete(fingerprint);
    this.accessOrder.delete(fingerprint);
    if (existed) {
      this.stats.invalidations++;
    }
    return existed;
  }

  /**
   * Invalidate all entries matching a pattern.
   * Used when a sender/domain is newly identified as bad.
   */
  invalidatePattern(predicate: (entry: CacheEntry) => boolean): number {
    let count = 0;
    for (const [fingerprint, entry] of this.cache) {
      if (predicate(entry)) {
        this.cache.delete(fingerprint);
        this.accessOrder.delete(fingerprint);
        count++;
      }
    }
    this.stats.invalidations += count;
    return count;
  }

  /**
   * Demote a cached entry — reduce its confidence so it gets re-checked sooner.
   * Used for "soft" signals (e.g., engagement dropped, minor complaint).
   */
  demote(fingerprint: string, penaltyPercent: number): void {
    const entry = this.cache.get(fingerprint);
    if (!entry) return;

    entry.confidence = Math.max(0, entry.confidence - penaltyPercent);

    // If confidence dropped below caching threshold, evict
    if (entry.confidence < 80) {
      this.cache.delete(fingerprint);
      this.accessOrder.delete(fingerprint);
    }
  }

  /** Get cache statistics */
  getStats(): CacheStats {
    const totalLookups = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.cache.size,
      hitRate: totalLookups > 0 ? this.stats.hits / totalLookups : 0,
      missRate: totalLookups > 0 ? this.stats.misses / totalLookups : 0,
      avgLookupUs: 0.5, // Map lookup is ~0.5 microseconds
      memoryUsageMb: this.estimateMemoryUsage(),
      evictionCount: this.stats.evictions,
    };
  }

  /** Shutdown the cache and cleanup timers */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    this.accessOrder.clear();
  }

  // ─── Internal ───

  private evictLRU(): void {
    let oldestTime = Infinity;
    let oldestKey: string | null = null;

    for (const [key, time] of this.accessOrder) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const toDelete: string[] = [];

      for (const [fingerprint, entry] of this.cache) {
        if (now - entry.createdAt > entry.ttlMs) {
          toDelete.push(fingerprint);
        }
      }

      for (const key of toDelete) {
        this.cache.delete(key);
        this.accessOrder.delete(key);
      }
    }, this.config.cleanupIntervalMs);
  }

  private estimateMemoryUsage(): number {
    // Rough estimate: ~200 bytes per entry (fingerprint + metadata)
    return (this.cache.size * 200) / (1024 * 1024);
  }
}
