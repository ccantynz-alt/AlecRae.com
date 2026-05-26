/**
 * Parallel Inspector — Runs multiple checks simultaneously.
 *
 * The key insight: traditional email filters run checks SEQUENTIALLY:
 *   SPF → DKIM → DMARC → spam check → phishing check → content scan → deliver
 *   Total: 300-800ms (each check blocks the next)
 *
 * Parallel Inspector runs ALL checks at the same time:
 *   SPF ─┐
 *   DKIM ─┤
 *   DMARC ─┤─→ aggregate results → decide → 40-80ms total
 *   Spam ──┤
 *   Phishing┘
 *
 * Each check has a timeout. If a check doesn't respond in time,
 * we proceed without it (it runs async and feeds back for learning).
 *
 * Checks are also filtered by tier — TRUSTED items skip most checks,
 * SUSPICIOUS items run everything.
 */

import type {
  CheckDefinition,
  CheckResult,
  ConfidenceTier,
  ValidationItem,
} from '../types.js';

interface InspectorConfig {
  /** Global timeout for the entire parallel inspection */
  globalTimeoutMs: number;
  /** Whether to allow partial results (proceed even if some checks fail) */
  allowPartialResults: boolean;
  /** Minimum number of checks that must pass for an "allow" decision */
  minPassingChecks: number;
}

export class ParallelInspector {
  private checks: CheckDefinition[] = [];

  constructor(private config: InspectorConfig) {}

  /** Register a check in the inspection pipeline */
  registerCheck(check: CheckDefinition): void {
    this.checks.push(check);
    // Keep sorted by priority (higher priority = runs first in timeout contention)
    this.checks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Run all applicable checks for the given tier IN PARALLEL.
   * Returns when all checks complete or the global timeout is reached.
   */
  async inspect(
    item: ValidationItem,
    tier: ConfidenceTier
  ): Promise<CheckResult[]> {
    // Filter checks that apply to this tier
    const applicableChecks = this.getChecksForTier(tier);

    if (applicableChecks.length === 0) {
      return [];
    }

    const results: CheckResult[] = [];

    // Create a promise for each check with its own timeout
    const checkPromises = applicableChecks.map(async (check) => {
      const startTime = performance.now();
      try {
        const result = await this.runWithTimeout(
          check.execute(item),
          check.timeoutMs,
          check.name
        );
        return result;
      } catch (error) {
        // Check timed out or failed — record it
        const timeUs = (performance.now() - startTime) * 1000;
        return {
          check: check.name,
          passed: check.deferrable, // If deferrable, treat timeout as pass (will verify async)
          score: check.deferrable ? 50 : 0,
          details:
            error instanceof Error
              ? `Check failed: ${error.message}`
              : 'Check failed: unknown error',
          timeUs: Math.round(timeUs),
          async: check.deferrable,
        } satisfies CheckResult;
      }
    });

    // Race all checks against global timeout
    const settledResults = await this.raceWithGlobalTimeout(
      checkPromises,
      this.config.globalTimeoutMs
    );

    for (const result of settledResults) {
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get the aggregate decision from check results.
   */
  aggregateResults(results: CheckResult[]): {
    shouldAllow: boolean;
    avgScore: number;
    failedChecks: string[];
    criticalFailures: string[];
  } {
    const failed = results.filter((r) => !r.passed);
    const criticalFailed = results.filter(
      (r) => !r.passed && !r.async
    );

    const totalScore = results.reduce((sum, r) => sum + r.score, 0);
    const avgScore = results.length > 0 ? totalScore / results.length : 50;

    const passingCount = results.filter((r) => r.passed).length;
    const shouldAllow =
      criticalFailed.length === 0 &&
      passingCount >= this.config.minPassingChecks;

    return {
      shouldAllow,
      avgScore,
      failedChecks: failed.map((r) => r.check),
      criticalFailures: criticalFailed.map((r) => r.check),
    };
  }

  /**
   * Get checks applicable for a given confidence tier.
   * Higher tiers (more trusted) run fewer checks.
   */
  private getChecksForTier(tier: ConfidenceTier): CheckDefinition[] {
    const tierPriority: Record<ConfidenceTier, number> = {
      TRUSTED: 5,    // Only run if check.minTier == TRUSTED (almost none)
      PROBABLE: 4,
      UNCERTAIN: 3,
      SUSPICIOUS: 2,
      REJECTED: 1,   // Run everything
    };

    const itemTierLevel = tierPriority[tier] ?? 3;

    return this.checks.filter((check) => {
      const checkTierLevel = tierPriority[check.minTier] ?? 3;
      // Run this check if the item's tier level is <= the check's minimum tier level
      return itemTierLevel <= checkTierLevel;
    });
  }

  /** Run a promise with a per-check timeout */
  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    checkName: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${checkName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /** Race all promises against a global timeout, collecting whatever finishes */
  private async raceWithGlobalTimeout(
    promises: Promise<CheckResult>[],
    timeoutMs: number
  ): Promise<(CheckResult | null)[]> {
    const results: (CheckResult | null)[] = new Array(promises.length).fill(null);
    let resolved = 0;

    return new Promise<(CheckResult | null)[]>((resolve) => {
      const timer = setTimeout(() => {
        // Global timeout hit — return whatever we have so far
        resolve(results);
      }, timeoutMs);

      for (let i = 0; i < promises.length; i++) {
        const promise = promises[i];
        if (!promise) continue;
        promise
          .then((result) => {
            results[i] = result;
          })
          .catch(() => {
            // Already handled in per-check timeout
          })
          .finally(() => {
            resolved++;
            if (resolved === promises.length) {
              clearTimeout(timer);
              resolve(results);
            }
          });
      }
    });
  }
}
