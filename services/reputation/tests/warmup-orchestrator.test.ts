import { describe, it, expect, beforeEach } from 'bun:test';
import { WarmupOrchestrator } from '../src/warmup/orchestrator.js';

// ---------------------------------------------------------------------------
// Plan generation
// ---------------------------------------------------------------------------

describe('WarmupOrchestrator - plan generation', () => {
  let orchestrator: WarmupOrchestrator;

  beforeEach(() => {
    orchestrator = new WarmupOrchestrator();
  });

  it('should generate a warm-up plan for a new IP', () => {
    const result = orchestrator.generatePlan('10.0.0.1', 'example.com', 'gmail');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ipAddress).toBe('10.0.0.1');
      expect(result.value.domain).toBe('example.com');
      expect(result.value.provider).toBe('gmail');
      expect(result.value.status).toBe('pending');
      expect(result.value.phases.length).toBeGreaterThan(0);
    }
  });

  it('should reject duplicate plan for same IP/domain/provider', () => {
    orchestrator.generatePlan('10.0.0.1', 'example.com', 'gmail');
    const result = orchestrator.generatePlan('10.0.0.1', 'example.com', 'gmail');
    expect(result.ok).toBe(false);
  });

  it('should generate phases with increasing daily volumes', () => {
    const result = orchestrator.generatePlan('10.0.0.2', 'test.com', 'gmail');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const volumes = result.value.phases.map((p) => p.dailyVolume);
      for (let i = 1; i < volumes.length; i++) {
        expect(volumes[i]).toBeGreaterThanOrEqual(volumes[i - 1]!);
      }
    }
  });

  it('should respect ISP-specific initial volumes', () => {
    const gmailResult = orchestrator.generatePlan('10.0.0.3', 'a.com', 'gmail');
    const aolResult = orchestrator.generatePlan('10.0.0.4', 'b.com', 'aol');
    expect(gmailResult.ok && aolResult.ok).toBe(true);
    if (gmailResult.ok && aolResult.ok) {
      // Gmail starts at 50, AOL at 150
      expect(gmailResult.value.phases[0]!.dailyVolume).toBeLessThan(aolResult.value.phases[0]!.dailyVolume);
    }
  });
});

// ---------------------------------------------------------------------------
// Daily limit calculation
// ---------------------------------------------------------------------------

describe('WarmupOrchestrator - daily limits', () => {
  let orchestrator: WarmupOrchestrator;

  beforeEach(() => {
    orchestrator = new WarmupOrchestrator();
    orchestrator.generatePlan('10.0.0.10', 'test.com', 'gmail');
    orchestrator.startPlan('10.0.0.10', 'test.com', 'gmail');
  });

  it('should return daily limit for an active plan', () => {
    const result = orchestrator.getDailyLimit('10.0.0.10', 'test.com', 'gmail');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeGreaterThan(0);
    }
  });

  it('should return 0 for a paused plan', () => {
    orchestrator.pause('10.0.0.10', 'test.com', 'gmail');
    const result = orchestrator.getDailyLimit('10.0.0.10', 'test.com', 'gmail');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('should return error for non-existent schedule', () => {
    const result = orchestrator.getDailyLimit('1.2.3.4', 'nope.com', 'gmail');
    expect(result.ok).toBe(false);
  });

  it('should provide hourly limits respecting preferred sending hours', () => {
    const strategy = orchestrator.getStrategy('gmail');
    const preferredHour = strategy.preferredSendingHours[0]!;
    const offHour = 3; // 3am is not in Gmail preferred hours

    const preferredResult = orchestrator.getHourlyLimit('10.0.0.10', 'test.com', 'gmail', preferredHour);
    const offResult = orchestrator.getHourlyLimit('10.0.0.10', 'test.com', 'gmail', offHour);

    expect(preferredResult.ok && offResult.ok).toBe(true);
    if (preferredResult.ok && offResult.ok) {
      expect(preferredResult.value).toBeGreaterThan(offResult.value);
    }
  });
});

// ---------------------------------------------------------------------------
// ISP-specific schedules
// ---------------------------------------------------------------------------

describe('WarmupOrchestrator - ISP strategies', () => {
  it('should have different strategies for different ISPs', () => {
    const orchestrator = new WarmupOrchestrator();
    const gmail = orchestrator.getStrategy('gmail');
    const yahoo = orchestrator.getStrategy('yahoo');
    const microsoft = orchestrator.getStrategy('microsoft');

    expect(gmail.provider).toBe('gmail');
    expect(yahoo.provider).toBe('yahoo');
    expect(microsoft.provider).toBe('microsoft');
    expect(gmail.initialVolume).not.toBe(yahoo.initialVolume);
  });

  it('should allow strategy overrides via config', () => {
    const orchestrator = new WarmupOrchestrator({
      strategyOverrides: {
        gmail: { initialVolume: 100, growthRate: 2.0 },
      },
    });
    const gmail = orchestrator.getStrategy('gmail');
    expect(gmail.initialVolume).toBe(100);
    expect(gmail.growthRate).toBe(2.0);
  });
});

// ---------------------------------------------------------------------------
// Signal adaptation
// ---------------------------------------------------------------------------

describe('WarmupOrchestrator - signal adaptation', () => {
  let orchestrator: WarmupOrchestrator;

  beforeEach(() => {
    orchestrator = new WarmupOrchestrator();
    orchestrator.generatePlan('10.0.0.20', 'adapt.com', 'gmail');
    orchestrator.startPlan('10.0.0.20', 'adapt.com', 'gmail');
  });

  it('should increase multiplier on healthy delivery signals', () => {
    const result = orchestrator.processSignal({
      ipAddress: '10.0.0.20',
      provider: 'gmail',
      type: 'delivery',
      timestamp: Date.now(),
    } as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.adaptiveMultiplier).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('should reduce multiplier when bounce threshold is exceeded', () => {
    // Send enough bounces to exceed threshold
    for (let i = 0; i < 10; i++) {
      orchestrator.processSignal({
        ipAddress: '10.0.0.20',
        provider: 'gmail',
        type: 'bounce',
        timestamp: Date.now(),
      } as never);
    }
    const result = orchestrator.processSignal({
      ipAddress: '10.0.0.20',
      provider: 'gmail',
      type: 'bounce',
      timestamp: Date.now(),
    } as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.adaptiveMultiplier).toBeLessThan(1.0);
    }
  });

  it('should pause warm-up on block signal', () => {
    const result = orchestrator.processSignal({
      ipAddress: '10.0.0.20',
      provider: 'gmail',
      type: 'block',
      timestamp: Date.now(),
    } as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('paused');
    }
  });

  it('should support pause and resume lifecycle', () => {
    orchestrator.pause('10.0.0.20', 'adapt.com', 'gmail');
    const pauseLimit = orchestrator.getDailyLimit('10.0.0.20', 'adapt.com', 'gmail');
    expect(pauseLimit.ok && pauseLimit.value === 0).toBe(true);

    orchestrator.resume('10.0.0.20', 'adapt.com', 'gmail');
    const resumeLimit = orchestrator.getDailyLimit('10.0.0.20', 'adapt.com', 'gmail');
    expect(resumeLimit.ok).toBe(true);
    if (resumeLimit.ok) {
      expect(resumeLimit.value).toBeGreaterThan(0);
    }
  });

  it('should return list of active schedules', () => {
    const active = orchestrator.getActiveSchedules();
    expect(active.length).toBe(1);
    expect(active[0]!.ipAddress).toBe('10.0.0.20');
  });

  it('should generate a progress report', () => {
    const result = orchestrator.getProgressReport('10.0.0.20', 'adapt.com', 'gmail');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('active');
      expect(result.value.healthStatus).toBe('healthy');
      expect(result.value.totalPhases).toBeGreaterThan(0);
    }
  });
});
