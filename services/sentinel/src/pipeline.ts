/**
 * Sentinel Pipeline — The main validation orchestrator.
 *
 * This is the entry point for ALL validation in AlecRae. Every email,
 * API request, webhook, and config change flows through here.
 *
 * The pipeline works in three stages:
 *
 * Stage 1: FINGERPRINT + CACHE (< 1ms)
 *   → Generate fingerprint for the item
 *   → Check decision cache
 *   → If cache hit with high confidence: FAST PATH (deliver, verify async)
 *
 * Stage 2: CONFIDENCE SCORING (< 1ms)
 *   → Run lightweight AI confidence scorer
 *   → Determine which tier the item falls into
 *   → Route to appropriate inspection path
 *
 * Stage 3: TIERED INSPECTION (varies by tier)
 *   → TRUSTED (score >= 95): Skip inspection, deliver, verify async
 *   → PROBABLE (70-94): Quick parallel checks (auth + reputation)
 *   → UNCERTAIN (40-69): Full parallel inspection suite
 *   → SUSPICIOUS (10-39): Deep inspection + quarantine hold
 *   → REJECTED (< 10): Block immediately
 *
 * After delivery, async verification runs in the background to catch
 * anything the fast path missed. If it finds something, it auto-corrects
 * (move to spam, update cache, retrain model).
 */

import { DecisionCache } from './cache/decision-cache.js';
import { FingerprintGenerator } from './fingerprint/generator.js';
import { createDefaultChecks } from './inspection/checks.js';
import { ParallelInspector } from './inspection/parallel-inspector.js';
import { ConfidenceScorer } from './scoring/confidence-scorer.js';
import type {
  ConfidenceTier,
  FeedbackSignal,
  SentinelConfig,
  ValidationAction,
  ValidationDecision,
  ValidationItem,
  ValidationResult,
} from './types.js';

export class SentinelPipeline {
  private cache: DecisionCache;
  private fingerprinter: FingerprintGenerator;
  private scorer: ConfidenceScorer;
  private inspector: ParallelInspector;

  /** Items delivered via fast path, pending async verification */
  private pendingVerification = new Map<string, ValidationItem>();

  /** Pipeline metrics */
  private metrics = {
    totalProcessed: 0,
    fastPathCount: 0,
    parallelPathCount: 0,
    deepPathCount: 0,
    rejectedCount: 0,
    avgTimeUs: 0,
    cacheHitRate: 0,
  };

  constructor(private config: SentinelConfig) {
    this.cache = new DecisionCache({
      maxEntries: config.cache.maxEntries,
      defaultTtlMs: config.cache.defaultTtlMs,
      cleanupIntervalMs: config.cache.cleanupIntervalMs,
      establishedThreshold: 10,
    });

    this.fingerprinter = new FingerprintGenerator();
    this.scorer = new ConfidenceScorer(config);

    this.inspector = new ParallelInspector({
      globalTimeoutMs: config.checkTimeouts.parallel,
      allowPartialResults: true,
      minPassingChecks: 3,
    });

    // Register default checks
    for (const check of createDefaultChecks()) {
      this.inspector.registerCheck(check);
    }

    // Start async verification loop
    if (config.asyncVerification.enabled) {
      this.startAsyncVerificationLoop();
    }
  }

  /**
   * Validate an item through the pipeline.
   * This is the main entry point — called for every email, request, etc.
   */
  async validate(item: ValidationItem): Promise<ValidationResult> {
    const pipelineStart = performance.now();
    this.metrics.totalProcessed++;

    // ─── Stage 1: Fingerprint + Cache ───
    const fingerprint = this.fingerprinter.generate(item);
    const cached = this.cache.lookup(fingerprint);

    if (cached && cached.confidence >= 90) {
      // Cache hit! Use cached decision instantly.
      const timeUs = (performance.now() - pipelineStart) * 1000;
      this.metrics.fastPathCount++;
      this.updateAvgTime(timeUs);

      const result: ValidationResult = {
        itemId: item.id,
        decision: cached.decision,
        confidence: {
          score: cached.confidence,
          tier: 'TRUSTED' as ConfidenceTier,
          signals: [],
          computeTimeUs: Math.round(timeUs),
          cached: true,
        },
        checks: [],
        totalTimeUs: Math.round(timeUs),
        path: 'fast',
        actions: [
          {
            type: cached.decision === 'allow' ? 'deliver' : 'reject',
            reason: `Cache hit (confidence: ${cached.confidence}%, hits: ${cached.hitCount})`,
            timestamp: Date.now(),
          },
        ],
      };

      // Queue for async verification if it was an allow decision
      if (cached.decision === 'allow' && this.config.asyncVerification.enabled) {
        this.pendingVerification.set(item.id, item);
      }

      return result;
    }

    // ─── Stage 2: Confidence Scoring ───
    const confidence = this.scorer.score(item);

    // ─── Stage 3: Tiered Inspection ───
    let decision: ValidationDecision;
    let checks: ValidationResult['checks'] = [];
    let path: ValidationResult['path'];
    const actions: ValidationAction[] = [];

    switch (confidence.tier) {
      case 'TRUSTED': {
        // Fast path — deliver immediately, verify async
        decision = 'allow';
        path = 'fast';
        this.metrics.fastPathCount++;

        actions.push({
          type: 'deliver',
          reason: `Trusted (score: ${confidence.score})`,
          timestamp: Date.now(),
        });

        if (this.config.asyncVerification.enabled) {
          this.pendingVerification.set(item.id, item);
        }
        break;
      }

      case 'PROBABLE':
      case 'UNCERTAIN': {
        // Parallel inspection
        checks = await this.inspector.inspect(item, confidence.tier);
        path = 'parallel';
        this.metrics.parallelPathCount++;

        const aggregate = this.inspector.aggregateResults(checks);

        if (aggregate.shouldAllow && aggregate.avgScore >= 50) {
          decision = 'allow';
          actions.push({
            type: 'deliver',
            reason: `Passed parallel inspection (avg score: ${Math.round(aggregate.avgScore)})`,
            timestamp: Date.now(),
          });
        } else if (aggregate.criticalFailures.length > 0) {
          decision = 'reject';
          actions.push({
            type: 'reject',
            reason: `Critical failures: ${aggregate.criticalFailures.join(', ')}`,
            timestamp: Date.now(),
          });
        } else {
          decision = 'quarantine';
          actions.push({
            type: 'quarantine',
            reason: `Insufficient confidence (avg score: ${Math.round(aggregate.avgScore)})`,
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'SUSPICIOUS': {
        // Deep inspection — run ALL checks with extended timeout
        checks = await this.inspector.inspect(item, confidence.tier);
        path = 'deep';
        this.metrics.deepPathCount++;

        const aggregate = this.inspector.aggregateResults(checks);

        if (aggregate.shouldAllow && aggregate.avgScore >= 70) {
          // Even suspicious items can pass if they ace all checks
          decision = 'allow';
          actions.push({
            type: 'deliver',
            reason: 'Passed deep inspection despite initial suspicion',
            timestamp: Date.now(),
          });
          actions.push({
            type: 'flag',
            reason: 'Flagged for monitoring due to initial low confidence',
            timestamp: Date.now(),
          });
        } else {
          decision = 'quarantine';
          actions.push({
            type: 'quarantine',
            reason: `Suspicious item held for review (avg score: ${Math.round(aggregate.avgScore)})`,
            timestamp: Date.now(),
          });
          actions.push({
            type: 'notify',
            reason: 'Admin notified of quarantined suspicious item',
            timestamp: Date.now(),
          });
        }
        break;
      }

      case 'REJECTED': {
        // Block immediately — no inspection needed
        decision = 'reject';
        path = 'fast';
        this.metrics.rejectedCount++;

        actions.push({
          type: 'reject',
          reason: `Rejected (confidence score: ${confidence.score})`,
          timestamp: Date.now(),
        });
        break;
      }

      default: {
        decision = 'defer';
        path = 'parallel';
        actions.push({
          type: 'quarantine',
          reason: 'Unknown tier, deferring for review',
          timestamp: Date.now(),
        });
      }
    }

    // ─── Update Cache ───
    this.cache.store(fingerprint, decision, confidence.score);

    // ─── Learn from this decision ───
    actions.push({
      type: 'learn',
      reason: `Decision logged for model training (${confidence.tier} → ${decision})`,
      timestamp: Date.now(),
    });

    const totalTimeUs = (performance.now() - pipelineStart) * 1000;
    this.updateAvgTime(totalTimeUs);

    return {
      itemId: item.id,
      decision,
      confidence,
      checks,
      totalTimeUs: Math.round(totalTimeUs),
      path,
      actions,
    };
  }

  /**
   * Process feedback from users/systems.
   * When a user marks something as spam, or a message bounces,
   * we use that signal to improve the model.
   */
  processFeedback(feedback: FeedbackSignal): void {
    // Invalidate cache if the decision was wrong
    if (
      feedback.outcome === 'false_positive' ||
      feedback.outcome === 'false_negative'
    ) {
      // The item's fingerprint needs to be recomputed
      // For now, we invalidate by item ID from pending verification
      const item = this.pendingVerification.get(feedback.itemId);
      if (item) {
        const fingerprint = this.fingerprinter.generate(item);
        this.cache.invalidate(fingerprint);
      }

      // Update signal weights based on which signals were wrong
      // (In production, this would analyze which signals contributed
      // to the wrong decision and adjust their weights)
      if (feedback.outcome === 'false_positive') {
        // We blocked something that was good — reduce strictness
        this.scorer.updateWeights('content_fingerprint', false);
      } else {
        // We allowed something that was bad — increase strictness
        this.scorer.updateWeights('sender_reputation', false);
        this.scorer.updateWeights('authentication', false);
      }
    }

    // Clean up pending verification
    this.pendingVerification.delete(feedback.itemId);
  }

  /** Get pipeline metrics */
  getMetrics() {
    const cacheStats = this.cache.getStats();
    return {
      ...this.metrics,
      cacheHitRate: cacheStats.hitRate,
      cacheSize: cacheStats.totalEntries,
      cacheMemoryMb: cacheStats.memoryUsageMb,
      pendingVerification: this.pendingVerification.size,
    };
  }

  /** Shutdown the pipeline cleanly */
  shutdown(): void {
    this.cache.shutdown();
    this.pendingVerification.clear();
    if (this.verificationTimer) {
      clearInterval(this.verificationTimer);
    }
  }

  // ─── Internal ───

  private verificationTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Async verification loop.
   * Runs periodically to verify items that took the fast path.
   * If it finds that a fast-path item was actually bad, it auto-corrects.
   */
  private startAsyncVerificationLoop(): void {
    const delayMs = this.config.asyncVerification.delayMs;

    this.verificationTimer = setInterval(async () => {
      const now = Date.now();
      const toVerify: [string, ValidationItem][] = [];

      for (const [id, item] of this.pendingVerification) {
        // Only verify items older than the configured delay
        if (now - item.timestamp > delayMs) {
          toVerify.push([id, item]);
        }
      }

      // Process verification batch
      for (const [id, item] of toVerify) {
        try {
          // Run full parallel inspection on the fast-path item
          const checks = await this.inspector.inspect(
            item,
            'UNCERTAIN' as ConfidenceTier
          );
          const aggregate = this.inspector.aggregateResults(checks);

          if (!aggregate.shouldAllow || aggregate.avgScore < 40) {
            // Fast path was wrong! This item is bad.
            // In production: move to spam folder, update reputation, alert
            const fingerprint = this.fingerprinter.generate(item);
            this.cache.invalidate(fingerprint);

            // Log for model retraining
            this.processFeedback({
              itemId: id,
              outcome: 'false_negative',
              source: 'manual_review',
              timestamp: now,
            });
          }
        } catch {
          // Verification failed — try again next cycle
          continue;
        }

        this.pendingVerification.delete(id);
      }
    }, delayMs);
  }

  private updateAvgTime(timeUs: number): void {
    const n = this.metrics.totalProcessed;
    this.metrics.avgTimeUs =
      this.metrics.avgTimeUs * ((n - 1) / n) + timeUs / n;
  }
}
