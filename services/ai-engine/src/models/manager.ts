// =============================================================================
// @emailed/ai-engine — Model Manager
// =============================================================================
// Manages the full lifecycle of AI/ML models: registration, versioning,
// deployment, A/B testing, rollback, and performance tracking. Routes
// inference requests to the correct model version and supports canary
// deployments for safe rollouts.

import type {
  ModelMetadata,
  ModelType,
  ModelStatus,
  ModelMetrics,
  ABTestConfig,
  ABTestResult,
  Result,
  AIEngineError,
} from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL_VERSION = '1.0.0';

/** Default minimum sample size for A/B test conclusions */
const DEFAULT_MIN_SAMPLE_SIZE = 1000;

/** P-value threshold for statistical significance */
const SIGNIFICANCE_THRESHOLD = 0.05;

// ---------------------------------------------------------------------------
// Model Inference Interface
// ---------------------------------------------------------------------------

/**
 * Generic model interface that any registered model must implement.
 * The manager routes inference calls to the correct versioned instance.
 */
export interface ModelInstance<TInput = unknown, TOutput = unknown> {
  /** Run inference on the model */
  predict(input: TInput): Promise<TOutput>;
  /** Get the model's current metrics (for live monitoring) */
  getMetrics(): ModelMetrics;
  /** Warm up the model (pre-load weights, caches, etc.) */
  warmUp(): Promise<void>;
  /** Release resources held by the model */
  dispose(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Performance Tracking
// ---------------------------------------------------------------------------

export interface InferenceRecord {
  readonly modelId: string;
  readonly timestamp: number;
  readonly latencyMs: number;
  readonly success: boolean;
  readonly error?: string;
}

export interface ModelPerformanceSummary {
  readonly modelId: string;
  readonly totalInferences: number;
  readonly successRate: number;
  readonly averageLatencyMs: number;
  readonly p50LatencyMs: number;
  readonly p99LatencyMs: number;
  readonly errorCount: number;
  readonly lastInferenceAt: number;
  readonly metrics: ModelMetrics;
}

// ---------------------------------------------------------------------------
// Model Lifecycle Events
// ---------------------------------------------------------------------------

export type ModelLifecycleEvent =
  | { readonly type: 'registered'; readonly modelId: string }
  | { readonly type: 'deployed'; readonly modelId: string; readonly previousModelId?: string }
  | { readonly type: 'rolled_back'; readonly modelId: string; readonly rolledBackTo: string }
  | { readonly type: 'deprecated'; readonly modelId: string }
  | { readonly type: 'ab_test_started'; readonly testId: string }
  | { readonly type: 'ab_test_completed'; readonly testId: string; readonly winner: string };

export type LifecycleEventHandler = (event: ModelLifecycleEvent) => void;

// ---------------------------------------------------------------------------
// Model Manager
// ---------------------------------------------------------------------------

export interface ModelManagerConfig {
  /** Default minimum sample size for A/B test conclusions */
  readonly defaultMinSampleSize?: number;
  /** Maximum number of inference records to keep per model (for memory bounds) */
  readonly maxInferenceRecordsPerModel?: number;
}

export class ModelManager {
  private readonly models = new Map<string, ModelMetadata>();
  private readonly instances = new Map<string, ModelInstance>();
  private readonly activeModels = new Map<ModelType, string>(); // type -> active model ID
  private readonly abTests = new Map<string, ABTestConfig>();
  private readonly abTestResults = new Map<string, ABTestResult>();
  private readonly inferenceRecords = new Map<string, InferenceRecord[]>();
  private readonly deploymentHistory = new Map<ModelType, string[]>(); // type -> ordered list of model IDs
  private readonly eventHandlers: LifecycleEventHandler[] = [];
  private readonly config: Required<ModelManagerConfig>;

  constructor(config: ModelManagerConfig = {}) {
    this.config = {
      defaultMinSampleSize: config.defaultMinSampleSize ?? DEFAULT_MIN_SAMPLE_SIZE,
      maxInferenceRecordsPerModel: config.maxInferenceRecordsPerModel ?? 10000,
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Model Registration & Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Register a new model version with the manager.
   * The model starts in 'staged' status until explicitly deployed.
   */
  register(
    metadata: Omit<ModelMetadata, 'status' | 'createdAt' | 'deployedAt'>,
    instance: ModelInstance,
  ): Result<ModelMetadata> {
    if (this.models.has(metadata.id)) {
      return {
        ok: false,
        error: {
          code: 'MODEL_ALREADY_EXISTS',
          message: `Model with ID ${metadata.id} is already registered`,
          retryable: false,
        },
      };
    }

    const fullMetadata: ModelMetadata = {
      ...metadata,
      status: 'staged',
      createdAt: Date.now(),
    };

    this.models.set(metadata.id, fullMetadata);
    this.instances.set(metadata.id, instance);
    this.inferenceRecords.set(metadata.id, []);

    this.emit({ type: 'registered', modelId: metadata.id });

    return { ok: true, value: fullMetadata };
  }

  /**
   * Deploy a model, making it the active version for its type.
   * The previously active model is automatically deprecated.
   */
  async deploy(modelId: string): Promise<Result<ModelMetadata>> {
    const metadata = this.models.get(modelId);
    const instance = this.instances.get(modelId);

    if (!metadata || !instance) {
      return {
        ok: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: `Model ${modelId} not found`,
          retryable: false,
        },
      };
    }

    if (metadata.status !== 'staged' && metadata.status !== 'canary') {
      return {
        ok: false,
        error: {
          code: 'INVALID_MODEL_STATUS',
          message: `Cannot deploy model in ${metadata.status} status. Must be 'staged' or 'canary'.`,
          retryable: false,
        },
      };
    }

    // Warm up the model before deployment
    try {
      await instance.warmUp();
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'MODEL_WARMUP_FAILED',
          message: err instanceof Error ? err.message : 'Model warm-up failed',
          retryable: true,
        },
      };
    }

    // Deprecate the currently active model of this type
    const previousModelId = this.activeModels.get(metadata.type);
    if (previousModelId && previousModelId !== modelId) {
      this.updateStatus(previousModelId, 'deprecated');
    }

    // Activate the new model
    const deployedMetadata: ModelMetadata = {
      ...metadata,
      status: 'deployed',
      deployedAt: Date.now(),
    };

    this.models.set(modelId, deployedMetadata);
    this.activeModels.set(metadata.type, modelId);

    // Track deployment history
    let history = this.deploymentHistory.get(metadata.type);
    if (!history) {
      history = [];
      this.deploymentHistory.set(metadata.type, history);
    }
    history.push(modelId);

    this.emit({ type: 'deployed', modelId, previousModelId });

    return { ok: true, value: deployedMetadata };
  }

  /**
   * Roll back to the previously deployed model of a given type.
   */
  async rollback(modelType: ModelType): Promise<Result<ModelMetadata>> {
    const history = this.deploymentHistory.get(modelType);
    if (!history || history.length < 2) {
      return {
        ok: false,
        error: {
          code: 'NO_ROLLBACK_TARGET',
          message: `No previous model version available for type ${modelType}`,
          retryable: false,
        },
      };
    }

    // Current active is last in history, rollback target is second-to-last
    const currentId = history[history.length - 1] as string;
    const rollbackId = history[history.length - 2] as string;

    const rollbackMetadata = this.models.get(rollbackId);
    const rollbackInstance = this.instances.get(rollbackId);

    if (!rollbackMetadata || !rollbackInstance) {
      return {
        ok: false,
        error: {
          code: 'ROLLBACK_TARGET_MISSING',
          message: `Rollback target model ${rollbackId} is no longer available`,
          retryable: false,
        },
      };
    }

    // Mark current as rolled back
    this.updateStatus(currentId, 'rolled_back');

    // Warm up and reactivate the rollback target
    try {
      await rollbackInstance.warmUp();
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'ROLLBACK_WARMUP_FAILED',
          message: err instanceof Error ? err.message : 'Rollback model warm-up failed',
          retryable: true,
        },
      };
    }

    const redeployedMetadata: ModelMetadata = {
      ...rollbackMetadata,
      status: 'deployed',
      deployedAt: Date.now(),
    };

    this.models.set(rollbackId, redeployedMetadata);
    this.activeModels.set(modelType, rollbackId);
    history.push(rollbackId);

    this.emit({ type: 'rolled_back', modelId: currentId, rolledBackTo: rollbackId });

    return { ok: true, value: redeployedMetadata };
  }

  /**
   * Retire a model — disposes its resources and marks it deprecated.
   */
  async retire(modelId: string): Promise<Result<void>> {
    const metadata = this.models.get(modelId);
    const instance = this.instances.get(modelId);

    if (!metadata) {
      return {
        ok: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: `Model ${modelId} not found`,
          retryable: false,
        },
      };
    }

    // Prevent retiring the active model
    if (this.activeModels.get(metadata.type) === modelId) {
      return {
        ok: false,
        error: {
          code: 'CANNOT_RETIRE_ACTIVE',
          message: `Cannot retire the currently active model. Deploy a replacement first.`,
          retryable: false,
        },
      };
    }

    if (instance) {
      try {
        await instance.dispose();
      } catch {
        // Best-effort disposal
      }
      this.instances.delete(modelId);
    }

    this.updateStatus(modelId, 'deprecated');
    this.emit({ type: 'deprecated', modelId });

    return { ok: true, value: undefined };
  }

  // -----------------------------------------------------------------------
  // Public API — Inference Routing
  // -----------------------------------------------------------------------

  /**
   * Route an inference request to the correct model version.
   * If an A/B test is running for this model type, traffic is split accordingly.
   */
  async infer<TInput, TOutput>(
    modelType: ModelType,
    input: TInput,
  ): Promise<Result<TOutput>> {
    const startTime = performance.now();

    // Check for active A/B test
    const abTest = this.findActiveABTest(modelType);
    let targetModelId: string | undefined;

    if (abTest) {
      // Route based on traffic split
      const random = Math.random() * 100;
      targetModelId = random < abTest.trafficSplitPercent
        ? abTest.treatmentModelId
        : abTest.controlModelId;
    } else {
      targetModelId = this.activeModels.get(modelType);
    }

    if (!targetModelId) {
      return {
        ok: false,
        error: {
          code: 'NO_ACTIVE_MODEL',
          message: `No active model found for type ${modelType}`,
          retryable: false,
        },
      };
    }

    const instance = this.instances.get(targetModelId);
    if (!instance) {
      return {
        ok: false,
        error: {
          code: 'MODEL_INSTANCE_MISSING',
          message: `Model instance ${targetModelId} is not loaded`,
          retryable: true,
        },
      };
    }

    try {
      const output = await instance.predict(input) as TOutput;
      const latencyMs = performance.now() - startTime;

      this.recordInference(targetModelId, latencyMs, true);

      return { ok: true, value: output };
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      this.recordInference(targetModelId, latencyMs, false, err instanceof Error ? err.message : undefined);

      return {
        ok: false,
        error: {
          code: 'INFERENCE_ERROR',
          message: err instanceof Error ? err.message : 'Unknown inference error',
          retryable: true,
        },
      };
    }
  }

  /** Get the currently active model ID for a given type */
  getActiveModelId(modelType: ModelType): string | undefined {
    return this.activeModels.get(modelType);
  }

  /** Get model metadata by ID */
  getModel(modelId: string): ModelMetadata | undefined {
    return this.models.get(modelId);
  }

  /** List all registered models, optionally filtered by type or status */
  listModels(filter?: {
    type?: ModelType;
    status?: ModelStatus;
  }): readonly ModelMetadata[] {
    let models = [...this.models.values()];

    if (filter?.type) {
      models = models.filter((m) => m.type === filter.type);
    }
    if (filter?.status) {
      models = models.filter((m) => m.status === filter.status);
    }

    return models;
  }

  // -----------------------------------------------------------------------
  // Public API — A/B Testing
  // -----------------------------------------------------------------------

  /**
   * Start an A/B test between two model versions.
   */
  startABTest(config: Omit<ABTestConfig, 'status'>): Result<ABTestConfig> {
    // Validate both models exist
    const control = this.models.get(config.controlModelId);
    const treatment = this.models.get(config.treatmentModelId);

    if (!control) {
      return {
        ok: false,
        error: {
          code: 'CONTROL_MODEL_NOT_FOUND',
          message: `Control model ${config.controlModelId} not found`,
          retryable: false,
        },
      };
    }

    if (!treatment) {
      return {
        ok: false,
        error: {
          code: 'TREATMENT_MODEL_NOT_FOUND',
          message: `Treatment model ${config.treatmentModelId} not found`,
          retryable: false,
        },
      };
    }

    if (control.type !== treatment.type) {
      return {
        ok: false,
        error: {
          code: 'MODEL_TYPE_MISMATCH',
          message: 'Control and treatment models must be of the same type',
          retryable: false,
        },
      };
    }

    // Ensure both instances are available
    if (!this.instances.has(config.controlModelId) || !this.instances.has(config.treatmentModelId)) {
      return {
        ok: false,
        error: {
          code: 'MODEL_INSTANCE_MISSING',
          message: 'Both model instances must be loaded for A/B testing',
          retryable: true,
        },
      };
    }

    // Mark treatment model as canary
    this.updateStatus(config.treatmentModelId, 'canary');

    const fullConfig: ABTestConfig = {
      ...config,
      status: 'running',
    };

    this.abTests.set(config.id, fullConfig);
    this.emit({ type: 'ab_test_started', testId: config.id });

    return { ok: true, value: fullConfig };
  }

  /**
   * Evaluate an A/B test and determine a winner.
   */
  evaluateABTest(testId: string): Result<ABTestResult> {
    const test = this.abTests.get(testId);
    if (!test) {
      return {
        ok: false,
        error: {
          code: 'AB_TEST_NOT_FOUND',
          message: `A/B test ${testId} not found`,
          retryable: false,
        },
      };
    }

    const controlInstance = this.instances.get(test.controlModelId);
    const treatmentInstance = this.instances.get(test.treatmentModelId);

    if (!controlInstance || !treatmentInstance) {
      return {
        ok: false,
        error: {
          code: 'MODEL_INSTANCE_MISSING',
          message: 'One or both model instances are no longer available',
          retryable: false,
        },
      };
    }

    const controlMetrics = controlInstance.getMetrics();
    const treatmentMetrics = treatmentInstance.getMetrics();

    // Statistical comparison
    const { winner, pValue, confidenceInterval } = this.computeABTestStatistics(
      test,
      controlMetrics,
      treatmentMetrics,
    );

    // Build recommendation
    let recommendation: string;
    if (winner === 'treatment') {
      recommendation = `Treatment model (${test.treatmentModelId}) outperformed control. Consider deploying.`;
    } else if (winner === 'control') {
      recommendation = `Control model (${test.controlModelId}) performed better. Keep current deployment.`;
    } else {
      recommendation = 'Results are inconclusive. Consider extending the test duration or increasing sample size.';
    }

    const result: ABTestResult = {
      testId,
      controlMetrics,
      treatmentMetrics,
      winner,
      pValue,
      confidenceInterval,
      recommendation,
    };

    this.abTestResults.set(testId, result);

    // Mark test as completed
    this.abTests.set(testId, { ...test, status: 'completed' });
    this.emit({ type: 'ab_test_completed', testId, winner: winner === 'inconclusive' ? 'none' : winner });

    return { ok: true, value: result };
  }

  /** Cancel a running A/B test */
  cancelABTest(testId: string): Result<void> {
    const test = this.abTests.get(testId);
    if (!test) {
      return {
        ok: false,
        error: {
          code: 'AB_TEST_NOT_FOUND',
          message: `A/B test ${testId} not found`,
          retryable: false,
        },
      };
    }

    this.abTests.set(testId, { ...test, status: 'cancelled' });

    // Revert treatment model status if it was set to canary
    const treatmentMeta = this.models.get(test.treatmentModelId);
    if (treatmentMeta && treatmentMeta.status === 'canary') {
      this.updateStatus(test.treatmentModelId, 'staged');
    }

    return { ok: true, value: undefined };
  }

  /** Get A/B test configuration and results */
  getABTest(testId: string): { config: ABTestConfig; result?: ABTestResult } | undefined {
    const config = this.abTests.get(testId);
    if (!config) return undefined;
    return { config, result: this.abTestResults.get(testId) };
  }

  // -----------------------------------------------------------------------
  // Public API — Performance Tracking
  // -----------------------------------------------------------------------

  /** Get a performance summary for a specific model */
  getPerformanceSummary(modelId: string): Result<ModelPerformanceSummary> {
    const records = this.inferenceRecords.get(modelId);
    const instance = this.instances.get(modelId);

    if (!records) {
      return {
        ok: false,
        error: {
          code: 'MODEL_NOT_FOUND',
          message: `No inference records for model ${modelId}`,
          retryable: false,
        },
      };
    }

    const totalInferences = records.length;
    const successCount = records.filter((r) => r.success).length;
    const errorCount = totalInferences - successCount;
    const successRate = totalInferences > 0 ? successCount / totalInferences : 0;

    const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
    const averageLatencyMs = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const p50LatencyMs = this.percentile(latencies, 50);
    const p99LatencyMs = this.percentile(latencies, 99);

    const lastInferenceAt = records.length > 0
      ? (records[records.length - 1] as InferenceRecord).timestamp
      : 0;

    const metrics = instance?.getMetrics() ?? this.emptyMetrics();

    return {
      ok: true,
      value: {
        modelId,
        totalInferences,
        successRate: Math.round(successRate * 1000) / 1000,
        averageLatencyMs: Math.round(averageLatencyMs * 100) / 100,
        p50LatencyMs: Math.round(p50LatencyMs * 100) / 100,
        p99LatencyMs: Math.round(p99LatencyMs * 100) / 100,
        errorCount,
        lastInferenceAt,
        metrics,
      },
    };
  }

  // -----------------------------------------------------------------------
  // Public API — Event Handling
  // -----------------------------------------------------------------------

  /** Subscribe to model lifecycle events */
  onLifecycleEvent(handler: LifecycleEventHandler): void {
    this.eventHandlers.push(handler);
  }

  // -----------------------------------------------------------------------
  // Private — Helpers
  // -----------------------------------------------------------------------

  private updateStatus(modelId: string, status: ModelStatus): void {
    const metadata = this.models.get(modelId);
    if (metadata) {
      this.models.set(modelId, { ...metadata, status });
    }
  }

  private recordInference(
    modelId: string,
    latencyMs: number,
    success: boolean,
    error?: string,
  ): void {
    let records = this.inferenceRecords.get(modelId);
    if (!records) {
      records = [];
      this.inferenceRecords.set(modelId, records);
    }

    records.push({
      modelId,
      timestamp: Date.now(),
      latencyMs,
      success,
      error,
    });

    // Cap records to prevent unbounded memory growth
    if (records.length > this.config.maxInferenceRecordsPerModel) {
      records.splice(0, records.length - this.config.maxInferenceRecordsPerModel);
    }
  }

  private findActiveABTest(modelType: ModelType): ABTestConfig | undefined {
    for (const test of this.abTests.values()) {
      if (test.status !== 'running') continue;

      const controlMeta = this.models.get(test.controlModelId);
      if (controlMeta && controlMeta.type === modelType) {
        // Check if test has expired
        if (Date.now() > test.endsAt) {
          this.abTests.set(test.id, { ...test, status: 'completed' });
          continue;
        }
        return test;
      }
    }
    return undefined;
  }

  private computeABTestStatistics(
    test: ABTestConfig,
    controlMetrics: ModelMetrics,
    treatmentMetrics: ModelMetrics,
  ): {
    winner: 'control' | 'treatment' | 'inconclusive';
    pValue: number;
    confidenceInterval: { lower: number; upper: number };
  } {
    const minSamples = test.minimumSampleSize || this.config.defaultMinSampleSize;

    // If insufficient samples, return inconclusive
    if (controlMetrics.sampleSize < minSamples || treatmentMetrics.sampleSize < minSamples) {
      return {
        winner: 'inconclusive',
        pValue: 1,
        confidenceInterval: { lower: -1, upper: 1 },
      };
    }

    // Use the target metric for comparison
    const controlValue = this.getMetricValue(controlMetrics, test.targetMetric);
    const treatmentValue = this.getMetricValue(treatmentMetrics, test.targetMetric);

    // Simplified z-test approximation
    const pooledStdErr = Math.sqrt(
      (controlValue * (1 - controlValue)) / controlMetrics.sampleSize +
      (treatmentValue * (1 - treatmentValue)) / treatmentMetrics.sampleSize,
    );

    const zScore = pooledStdErr > 0
      ? (treatmentValue - controlValue) / pooledStdErr
      : 0;

    // Approximate p-value from z-score (two-tailed)
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));

    // 95% confidence interval for the difference
    const diff = treatmentValue - controlValue;
    const margin = 1.96 * pooledStdErr;
    const confidenceInterval = {
      lower: Math.round((diff - margin) * 10000) / 10000,
      upper: Math.round((diff + margin) * 10000) / 10000,
    };

    let winner: 'control' | 'treatment' | 'inconclusive';
    if (pValue < SIGNIFICANCE_THRESHOLD) {
      winner = treatmentValue > controlValue ? 'treatment' : 'control';
    } else {
      winner = 'inconclusive';
    }

    return { winner, pValue: Math.round(pValue * 10000) / 10000, confidenceInterval };
  }

  private getMetricValue(metrics: ModelMetrics, metricName: string): number {
    const metricMap: Record<string, number> = {
      accuracy: metrics.accuracy,
      precision: metrics.precision,
      recall: metrics.recall,
      f1Score: metrics.f1Score,
      falsePositiveRate: metrics.falsePositiveRate,
      falseNegativeRate: metrics.falseNegativeRate,
    };
    return metricMap[metricName] ?? metrics.accuracy;
  }

  /** Standard normal cumulative distribution function approximation */
  private normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * absX);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

    return 0.5 * (1.0 + sign * y);
  }

  private percentile(sorted: readonly number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)] ?? 0;
  }

  private emit(event: ModelLifecycleEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Event handlers must not break the manager
      }
    }
  }

  private emptyMetrics(): ModelMetrics {
    return {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      falsePositiveRate: 0,
      falseNegativeRate: 0,
      latencyP50Ms: 0,
      latencyP99Ms: 0,
      sampleSize: 0,
    };
  }
}
