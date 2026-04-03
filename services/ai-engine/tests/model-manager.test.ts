import { describe, it, expect, beforeEach } from 'bun:test';
import { ModelManager } from '../src/models/manager.js';
import type { ModelInstance, ModelLifecycleEvent } from '../src/models/manager.js';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function createMockInstance(overrides?: Partial<ModelInstance>): ModelInstance {
  return {
    predict: overrides?.predict ?? (async (input: unknown) => ({ result: input })),
    getMetrics: overrides?.getMetrics ?? (() => ({
      accuracy: 0.95,
      precision: 0.93,
      recall: 0.92,
      f1Score: 0.925,
      falsePositiveRate: 0.05,
      falseNegativeRate: 0.08,
      latencyP50Ms: 10,
      latencyP99Ms: 50,
      sampleSize: 2000,
    })),
    warmUp: overrides?.warmUp ?? (async () => {}),
    dispose: overrides?.dispose ?? (async () => {}),
  };
}

function makeModelMeta(id: string, type = 'spam_classifier' as const) {
  return {
    id,
    name: `Model ${id}`,
    type,
    version: '1.0.0',
    description: 'Test model',
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

describe('ModelManager - registration', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = new ModelManager();
  });

  it('should register a new model successfully', () => {
    const result = manager.register(makeModelMeta('m1'), createMockInstance());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('m1');
      expect(result.value.status).toBe('staged');
    }
  });

  it('should reject duplicate model IDs', () => {
    manager.register(makeModelMeta('m1'), createMockInstance());
    const result = manager.register(makeModelMeta('m1'), createMockInstance());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_ALREADY_EXISTS');
    }
  });

  it('should list registered models', () => {
    manager.register(makeModelMeta('m1'), createMockInstance());
    manager.register(makeModelMeta('m2'), createMockInstance());
    const models = manager.listModels();
    expect(models.length).toBe(2);
  });

  it('should filter models by status', () => {
    manager.register(makeModelMeta('m1'), createMockInstance());
    const staged = manager.listModels({ status: 'staged' });
    expect(staged.length).toBe(1);
    const deployed = manager.listModels({ status: 'deployed' });
    expect(deployed.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deployment
// ---------------------------------------------------------------------------

describe('ModelManager - deployment', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = new ModelManager();
  });

  it('should deploy a staged model', async () => {
    manager.register(makeModelMeta('m1'), createMockInstance());
    const result = await manager.deploy('m1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('deployed');
      expect(result.value.deployedAt).toBeDefined();
    }
    expect(manager.getActiveModelId('spam_classifier' as never)).toBe('m1');
  });

  it('should deprecate the previous active model on deploy', async () => {
    manager.register(makeModelMeta('m1'), createMockInstance());
    manager.register(makeModelMeta('m2'), createMockInstance());
    await manager.deploy('m1');
    await manager.deploy('m2');
    const m1 = manager.getModel('m1');
    expect(m1!.status).toBe('deprecated');
    expect(manager.getActiveModelId('spam_classifier' as never)).toBe('m2');
  });

  it('should fail to deploy a non-existent model', async () => {
    const result = await manager.deploy('nonexistent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_NOT_FOUND');
    }
  });

  it('should fail if warm-up throws', async () => {
    const failInstance = createMockInstance({
      warmUp: async () => { throw new Error('GPU OOM'); },
    });
    manager.register(makeModelMeta('m-fail'), failInstance);
    const result = await manager.deploy('m-fail');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_WARMUP_FAILED');
    }
  });
});

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

describe('ModelManager - rollback', () => {
  let manager: ModelManager;

  beforeEach(async () => {
    manager = new ModelManager();
    manager.register(makeModelMeta('v1'), createMockInstance());
    manager.register(makeModelMeta('v2'), createMockInstance());
    await manager.deploy('v1');
    await manager.deploy('v2');
  });

  it('should roll back to the previous model version', async () => {
    const result = await manager.rollback('spam_classifier' as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.id).toBe('v1');
      expect(result.value.status).toBe('deployed');
    }
    expect(manager.getActiveModelId('spam_classifier' as never)).toBe('v1');
  });

  it('should fail rollback when no history exists', async () => {
    const freshManager = new ModelManager();
    freshManager.register(makeModelMeta('only'), createMockInstance());
    await freshManager.deploy('only');
    const result = await freshManager.rollback('spam_classifier' as never);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A/B testing
// ---------------------------------------------------------------------------

describe('ModelManager - A/B testing', () => {
  let manager: ModelManager;

  beforeEach(async () => {
    manager = new ModelManager();
    manager.register(makeModelMeta('control'), createMockInstance());
    manager.register(makeModelMeta('treatment'), createMockInstance());
    await manager.deploy('control');
  });

  it('should start an A/B test between two models', () => {
    const result = manager.startABTest({
      id: 'test-1',
      controlModelId: 'control',
      treatmentModelId: 'treatment',
      trafficSplitPercent: 50,
      targetMetric: 'accuracy',
      minimumSampleSize: 100,
      startsAt: Date.now(),
      endsAt: Date.now() + 86400000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('running');
    }
  });

  it('should reject A/B test with missing control model', () => {
    const result = manager.startABTest({
      id: 'test-2',
      controlModelId: 'nonexistent',
      treatmentModelId: 'treatment',
      trafficSplitPercent: 50,
      targetMetric: 'accuracy',
      minimumSampleSize: 100,
      startsAt: Date.now(),
      endsAt: Date.now() + 86400000,
    });
    expect(result.ok).toBe(false);
  });

  it('should evaluate an A/B test and produce a result', () => {
    manager.startABTest({
      id: 'test-3',
      controlModelId: 'control',
      treatmentModelId: 'treatment',
      trafficSplitPercent: 50,
      targetMetric: 'accuracy',
      minimumSampleSize: 100,
      startsAt: Date.now(),
      endsAt: Date.now() + 86400000,
    });
    const result = manager.evaluateABTest('test-3');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.recommendation).toBeDefined();
      expect(result.value.pValue).toBeGreaterThanOrEqual(0);
    }
  });

  it('should cancel a running A/B test', () => {
    manager.startABTest({
      id: 'test-4',
      controlModelId: 'control',
      treatmentModelId: 'treatment',
      trafficSplitPercent: 50,
      targetMetric: 'accuracy',
      minimumSampleSize: 100,
      startsAt: Date.now(),
      endsAt: Date.now() + 86400000,
    });
    const result = manager.cancelABTest('test-4');
    expect(result.ok).toBe(true);
    const testState = manager.getABTest('test-4');
    expect(testState!.config.status).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Inference routing
// ---------------------------------------------------------------------------

describe('ModelManager - inference routing', () => {
  let manager: ModelManager;

  beforeEach(async () => {
    manager = new ModelManager();
    manager.register(makeModelMeta('m1'), createMockInstance({
      predict: async (input: unknown) => ({ prediction: 'spam', input }),
    }));
    await manager.deploy('m1');
  });

  it('should route inference to the active model', async () => {
    const result = await manager.infer('spam_classifier' as never, { text: 'buy now' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.value as Record<string, unknown>).prediction).toBe('spam');
    }
  });

  it('should return error when no active model exists', async () => {
    const emptyManager = new ModelManager();
    const result = await emptyManager.infer('spam_classifier' as never, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NO_ACTIVE_MODEL');
    }
  });

  it('should track performance after inferences', async () => {
    await manager.infer('spam_classifier' as never, { text: 'hello' });
    await manager.infer('spam_classifier' as never, { text: 'world' });
    const summary = manager.getPerformanceSummary('m1');
    expect(summary.ok).toBe(true);
    if (summary.ok) {
      expect(summary.value.totalInferences).toBe(2);
      expect(summary.value.successRate).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

describe('ModelManager - lifecycle events', () => {
  it('should emit lifecycle events', async () => {
    const manager = new ModelManager();
    const events: ModelLifecycleEvent[] = [];
    manager.onLifecycleEvent((e) => events.push(e));

    manager.register(makeModelMeta('ev1'), createMockInstance());
    await manager.deploy('ev1');

    expect(events.length).toBe(2);
    expect(events[0]!.type).toBe('registered');
    expect(events[1]!.type).toBe('deployed');
  });
});
