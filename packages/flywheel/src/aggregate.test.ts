import { describe, it, expect } from "vitest";
import { aggregateSnapshot, aggregateUserStats } from "./aggregate.js";
import type { RawSignal } from "./aggregate.js";

const NOW = new Date("2026-05-08T12:00:00Z");

function sig(
  capturedDaysAgo: number,
  payload: RawSignal["payload"],
  userId: string | null = "u1",
): RawSignal {
  return {
    id: `s-${Math.random().toString(36).slice(2)}`,
    userId,
    capturedAtIso: new Date(NOW.getTime() - capturedDaysAgo * 86_400_000).toISOString(),
    payload,
  };
}

describe("aggregateSnapshot", () => {
  it("returns zero-value metrics with empty trend on no signals", () => {
    const snap = aggregateSnapshot([], { now: NOW });
    expect(snap.totalSignals).toBe(0);
    expect(snap.rpm).toBe(0);
    expect(snap.metrics.length).toBeGreaterThan(0);
    for (const m of snap.metrics) {
      expect(m.trend).toHaveLength(12);
      expect(m.value).toBe(0);
    }
  });

  it("computes compose acceptance rate from accepted vs discarded", () => {
    const signals: RawSignal[] = [
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "compose", event: "suggestion_discarded" }),
    ];
    const snap = aggregateSnapshot(signals, { now: NOW });
    const compose = snap.metrics.find((m) => m.key === "compose_acceptance_rate");
    expect(compose).toBeDefined();
    expect(compose?.value).toBeCloseTo(0.75, 2);
  });

  it("computes triage accuracy from actionMatchesPriority", () => {
    const signals: RawSignal[] = [
      sig(2, { category: "triage", event: "user_replied", actionMatchesPriority: true }),
      sig(2, { category: "triage", event: "user_replied", actionMatchesPriority: true }),
      sig(2, { category: "triage", event: "user_archived", actionMatchesPriority: false }),
    ];
    const snap = aggregateSnapshot(signals, { now: NOW });
    const triage = snap.metrics.find((m) => m.key === "triage_accuracy");
    expect(triage?.value).toBeCloseTo(2 / 3, 2);
  });

  it("excludes signals outside the window", () => {
    const insideWindow: RawSignal = sig(10, {
      category: "compose",
      event: "suggestion_accepted",
    });
    const outsideWindow: RawSignal = sig(120, {
      category: "compose",
      event: "suggestion_accepted",
    });
    const snap = aggregateSnapshot([insideWindow, outsideWindow], {
      now: NOW,
      windowDays: 30,
    });
    expect(snap.totalSignals).toBe(1);
  });

  it("RPM is between 0 and 1 when sample size is non-zero", () => {
    const signals: RawSignal[] = [
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "triage", event: "user_replied", actionMatchesPriority: true }),
    ];
    const snap = aggregateSnapshot(signals, { now: NOW });
    expect(snap.rpm).toBeGreaterThanOrEqual(0);
    expect(snap.rpm).toBeLessThanOrEqual(1);
  });
});

describe("aggregateUserStats", () => {
  it("returns 'new' maturity with zero everything for unknown user", () => {
    const stats = aggregateUserStats([], { now: NOW, userId: "ghost" });
    expect(stats.maturityLabel).toBe("new");
    expect(stats.draftsAcceptedCount).toBe(0);
    expect(stats.voiceProfileConfidence).toBe(0);
  });

  it("counts drafts accepted and computes acceptance pct", () => {
    const signals: RawSignal[] = [
      sig(1, { category: "compose", event: "suggestion_shown" }),
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "compose", event: "suggestion_accepted" }),
      sig(1, { category: "compose", event: "suggestion_discarded" }),
    ];
    const stats = aggregateUserStats(signals, { now: NOW, userId: "u1" });
    expect(stats.draftsAcceptedCount).toBe(2);
    // 2 accepted / (1 shown + 2 accepted + 1 discarded = 4)
    expect(stats.draftsAcceptedPct).toBeCloseTo(0.5, 2);
  });

  it("scales voice confidence inversely with average edit distance", () => {
    const lowDistance: RawSignal[] = [
      sig(1, {
        category: "voice_profile",
        event: "draft_sent",
        editDistanceFromDraft: 0.05,
      }),
    ];
    const highDistance: RawSignal[] = [
      sig(1, {
        category: "voice_profile",
        event: "draft_sent",
        editDistanceFromDraft: 0.5,
      }),
    ];
    const lowStats = aggregateUserStats(lowDistance, { now: NOW, userId: "u1" });
    const highStats = aggregateUserStats(highDistance, { now: NOW, userId: "u1" });
    expect(lowStats.voiceProfileConfidence).toBeGreaterThan(highStats.voiceProfileConfidence);
    expect(lowStats.voiceProfileConfidence).toBeGreaterThan(0.85);
    expect(highStats.voiceProfileConfidence).toBeLessThanOrEqual(0.05);
  });
});
