import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { DecisionCache } from '../src/cache/decision-cache.js';

function makeCache(overrides?: {
  maxEntries?: number;
  defaultTtlMs?: number;
  cleanupIntervalMs?: number;
  establishedThreshold?: number;
}) {
  return new DecisionCache({
    maxEntries: overrides?.maxEntries ?? 100,
    defaultTtlMs: overrides?.defaultTtlMs ?? 60_000,
    cleanupIntervalMs: overrides?.cleanupIntervalMs ?? 600_000,
    establishedThreshold: overrides?.establishedThreshold ?? 10,
  });
}

describe('DecisionCache', () => {
  let cache: DecisionCache;

  beforeEach(() => {
    cache = makeCache();
  });

  afterEach(() => {
    cache.shutdown();
  });

  it('should return null for a cache miss', () => {
    const result = cache.lookup('nonexistent-fingerprint');
    expect(result).toBeNull();
  });

  it('should store and retrieve an allow decision', () => {
    cache.store('fp-allow', 'allow', 95);
    const entry = cache.lookup('fp-allow');

    expect(entry).not.toBeNull();
    expect(entry!.decision).toBe('allow');
    expect(entry!.confidence).toBe(95);
    expect(entry!.fingerprint).toBe('fp-allow');
  });

  it('should store and retrieve a reject decision', () => {
    cache.store('fp-reject', 'reject', 92);
    const entry = cache.lookup('fp-reject');

    expect(entry).not.toBeNull();
    expect(entry!.decision).toBe('reject');
  });

  it('should not cache quarantine decisions', () => {
    cache.store('fp-quarantine', 'quarantine', 85);
    const entry = cache.lookup('fp-quarantine');
    expect(entry).toBeNull();
  });

  it('should not cache defer decisions', () => {
    cache.store('fp-defer', 'defer', 90);
    const entry = cache.lookup('fp-defer');
    expect(entry).toBeNull();
  });

  it('should not cache low-confidence decisions (below 80)', () => {
    cache.store('fp-low', 'allow', 75);
    const entry = cache.lookup('fp-low');
    expect(entry).toBeNull();
  });

  it('should increment hit count on repeated lookups', () => {
    cache.store('fp-hits', 'allow', 95);

    cache.lookup('fp-hits');
    cache.lookup('fp-hits');
    const entry = cache.lookup('fp-hits');

    // Initial hitCount is 1 (set at store), then +1 for each lookup
    expect(entry!.hitCount).toBe(4); // 1 (store) + 3 lookups
  });

  it('should expire entries after TTL', () => {
    // Use a very short TTL
    cache.store('fp-ttl', 'allow', 95, 1); // 1ms TTL

    // Wait long enough for expiry
    const start = Date.now();
    while (Date.now() - start < 10) {
      // busy wait a few ms
    }

    const entry = cache.lookup('fp-ttl');
    expect(entry).toBeNull();
  });

  it('should invalidate a specific fingerprint', () => {
    cache.store('fp-inv', 'allow', 95);
    expect(cache.lookup('fp-inv')).not.toBeNull();

    const removed = cache.invalidate('fp-inv');
    expect(removed).toBe(true);
    expect(cache.lookup('fp-inv')).toBeNull();
  });

  it('should return false when invalidating a non-existent fingerprint', () => {
    const removed = cache.invalidate('does-not-exist');
    expect(removed).toBe(false);
  });

  it('should invalidate entries matching a pattern predicate', () => {
    cache.store('fp-a-1', 'allow', 95);
    cache.store('fp-a-2', 'allow', 90);
    cache.store('fp-b-1', 'reject', 85);

    const count = cache.invalidatePattern((entry) => entry.decision === 'allow');
    expect(count).toBe(2);
    expect(cache.lookup('fp-a-1')).toBeNull();
    expect(cache.lookup('fp-a-2')).toBeNull();
    expect(cache.lookup('fp-b-1')).not.toBeNull();
  });

  it('should demote a cache entry and evict if confidence drops below 80', () => {
    cache.store('fp-demote', 'allow', 85);
    cache.demote('fp-demote', 10);

    // Confidence should now be 75, which is below the 80 threshold — evicted
    const entry = cache.lookup('fp-demote');
    expect(entry).toBeNull();
  });

  it('should demote without evicting if confidence stays above 80', () => {
    cache.store('fp-demote-soft', 'allow', 95);
    cache.demote('fp-demote-soft', 5);

    const entry = cache.lookup('fp-demote-soft');
    expect(entry).not.toBeNull();
    expect(entry!.confidence).toBe(90);
  });

  it('should evict LRU entry when at capacity', () => {
    const smallCache = makeCache({ maxEntries: 3 });

    smallCache.store('fp-1', 'allow', 95);
    smallCache.store('fp-2', 'allow', 90);
    smallCache.store('fp-3', 'allow', 88);

    // Access fp-1 and fp-3 to make fp-2 the LRU
    smallCache.lookup('fp-1');
    smallCache.lookup('fp-3');

    // This should evict fp-2 (least recently used)
    smallCache.store('fp-4', 'allow', 92);

    expect(smallCache.lookup('fp-2')).toBeNull();
    expect(smallCache.lookup('fp-1')).not.toBeNull();
    expect(smallCache.lookup('fp-4')).not.toBeNull();

    smallCache.shutdown();
  });

  it('should report accurate stats', () => {
    cache.store('fp-stat', 'allow', 95);
    cache.lookup('fp-stat'); // hit
    cache.lookup('fp-miss'); // miss

    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(1);
    expect(stats.hitRate).toBeGreaterThan(0);
    expect(stats.missRate).toBeGreaterThan(0);
    expect(stats.hitRate + stats.missRate).toBeCloseTo(1.0, 5);
  });

  it('should clear everything on shutdown', () => {
    cache.store('fp-shut', 'allow', 95);
    cache.shutdown();

    // After shutdown, the cache is empty — creating a new lookup won't find it
    // The internal map is cleared, so getStats would show 0
    const stats = cache.getStats();
    expect(stats.totalEntries).toBe(0);
  });
});
