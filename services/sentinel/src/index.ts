/**
 * Sentinel — AI-Powered Zero-Latency Validation Pipeline
 *
 * The immune system of AlecRae. Every email, API request, and
 * system action flows through Sentinel for validation.
 *
 * Key innovation: Instead of running all security checks sequentially
 * (which is slow), Sentinel uses an AI confidence model to determine
 * HOW MUCH inspection each item needs. Known-good patterns bypass
 * deep checks entirely. Only truly suspicious items get full analysis.
 *
 * Performance targets:
 * - 95% of items: < 1ms (fast path via cache + high confidence)
 * - 4% of items:  < 50ms (parallel inspection)
 * - 1% of items:  < 500ms (deep inspection)
 *
 * Compare to traditional: 100% of items take 300-800ms.
 */

export { SentinelPipeline } from './pipeline.js';
export { DecisionCache } from './cache/decision-cache.js';
export { FingerprintGenerator } from './fingerprint/generator.js';
export { ConfidenceScorer } from './scoring/confidence-scorer.js';
export { ParallelInspector } from './inspection/parallel-inspector.js';
export { createDefaultChecks } from './inspection/checks.js';
export * from './types.js';

import { SentinelPipeline } from './pipeline.js';
import { DEFAULT_CONFIG } from './types.js';
import type { SentinelConfig } from './types.js';

/**
 * Create a new Sentinel pipeline with optional config overrides.
 */
export function createSentinel(
  config: Partial<SentinelConfig> = {}
): SentinelPipeline {
  const mergedConfig: SentinelConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    thresholds: {
      ...DEFAULT_CONFIG.thresholds,
      ...config.thresholds,
    },
    cache: {
      ...DEFAULT_CONFIG.cache,
      ...config.cache,
    },
    asyncVerification: {
      ...DEFAULT_CONFIG.asyncVerification,
      ...config.asyncVerification,
    },
    checkTimeouts: {
      ...DEFAULT_CONFIG.checkTimeouts,
      ...config.checkTimeouts,
    },
  };

  return new SentinelPipeline(mergedConfig);
}
