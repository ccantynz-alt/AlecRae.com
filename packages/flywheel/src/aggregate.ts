/**
 * Aggregate raw signals into FlywheelMetric / FlywheelSnapshot views.
 *
 * Pure, deterministic. No I/O. Same signals + same now → same snapshot.
 * The DB layer feeds raw rows in; admin pages render the result out.
 */

import type {
  FlywheelMetric,
  FlywheelSnapshot,
  SignalCategory,
  SignalPayload,
  TrendPoint,
  UserFlywheelStats,
} from "./types.js";
import { METRIC_TARGETS, scoreAgainstTarget, type MetricTarget } from "./targets.js";

export interface RawSignal {
  readonly id: string;
  readonly userId: string | null;
  readonly capturedAtIso: string;
  readonly payload: SignalPayload;
}

const MS_PER_DAY = 86_400_000;
const WEEKS_OF_TREND = 12;

function startOfWeekUtc(d: Date): Date {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Monday-aligned. getUTCDay: 0=Sunday … 6=Saturday.
  const day = utc.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  utc.setUTCDate(utc.getUTCDate() - diff);
  return utc;
}

function isoWeekStart(d: Date): string {
  const w = startOfWeekUtc(d);
  return w.toISOString().slice(0, 10);
}

interface Bucket {
  readonly numerator: number;
  readonly denominator: number;
}

const EMPTY_BUCKET: Bucket = { numerator: 0, denominator: 0 };

function bucketRate(weeks: Map<string, Bucket>, key: string, win: boolean): void {
  const cur = weeks.get(key) ?? EMPTY_BUCKET;
  weeks.set(key, {
    numerator: cur.numerator + (win ? 1 : 0),
    denominator: cur.denominator + 1,
  });
}

function bucketAvg(weeks: Map<string, Bucket>, key: string, value: number): void {
  const cur = weeks.get(key) ?? EMPTY_BUCKET;
  weeks.set(key, {
    numerator: cur.numerator + value,
    denominator: cur.denominator + 1,
  });
}

function rollUp(buckets: Map<string, Bucket>, weekKeys: readonly string[]): {
  readonly value: number;
  readonly trend: readonly TrendPoint[];
} {
  let totalNum = 0;
  let totalDen = 0;
  const trend: TrendPoint[] = weekKeys.map((week) => {
    const b = buckets.get(week) ?? EMPTY_BUCKET;
    totalNum += b.numerator;
    totalDen += b.denominator;
    return {
      weekStartIso: week,
      value: b.denominator === 0 ? 0 : b.numerator / b.denominator,
      sampleSize: b.denominator,
    };
  });
  return {
    value: totalDen === 0 ? 0 : totalNum / totalDen,
    trend,
  };
}

function buildWeekKeys(now: Date): readonly string[] {
  const keys: string[] = [];
  for (let i = WEEKS_OF_TREND - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 7 * MS_PER_DAY);
    keys.push(isoWeekStart(d));
  }
  return keys;
}

// ─── Per-metric aggregators ────────────────────────────────────────────────

type AggregatorFn = (signals: readonly RawSignal[], weekKeys: readonly string[]) => {
  value: number;
  trend: readonly TrendPoint[];
};

function makeRateAggregator(
  category: SignalCategory,
  isWin: (p: SignalPayload) => boolean,
  isCounted: (p: SignalPayload) => boolean,
): AggregatorFn {
  return (signals, weekKeys) => {
    const buckets = new Map<string, Bucket>();
    for (const s of signals) {
      if (s.payload.category !== category) continue;
      if (!isCounted(s.payload)) continue;
      const week = isoWeekStart(new Date(s.capturedAtIso));
      bucketRate(buckets, week, isWin(s.payload));
    }
    return rollUp(buckets, weekKeys);
  };
}

function makeAvgAggregator(
  category: SignalCategory,
  pick: (p: SignalPayload) => number | undefined,
): AggregatorFn {
  return (signals, weekKeys) => {
    const buckets = new Map<string, Bucket>();
    for (const s of signals) {
      if (s.payload.category !== category) continue;
      const v = pick(s.payload);
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      const week = isoWeekStart(new Date(s.capturedAtIso));
      bucketAvg(buckets, week, v);
    }
    return rollUp(buckets, weekKeys);
  };
}

const AGGREGATORS: Record<string, AggregatorFn> = {
  compose_acceptance_rate: makeRateAggregator(
    "compose",
    (p) => p.category === "compose" && (p.event === "suggestion_accepted" || p.event === "email_sent"),
    (p) =>
      p.category === "compose" &&
      (p.event === "suggestion_accepted" ||
        p.event === "suggestion_discarded" ||
        p.event === "email_sent"),
  ),
  triage_accuracy: makeRateAggregator(
    "triage",
    (p) => p.category === "triage" && p.actionMatchesPriority === true,
    (p) => p.category === "triage" && typeof p.actionMatchesPriority === "boolean",
  ),
  smart_reply_acceptance_rate: makeRateAggregator(
    "smart_reply",
    (p) => p.category === "smart_reply" && p.event === "chosen",
    (p) =>
      p.category === "smart_reply" &&
      (p.event === "chosen" || p.event === "discarded"),
  ),
  voice_profile_edit_distance: makeAvgAggregator("voice_profile", (p) =>
    p.category === "voice_profile" ? p.editDistanceFromDraft : undefined,
  ),
  phishing_false_positive_rate: makeRateAggregator(
    "phishing",
    (p) => p.category === "phishing" && p.event === "false_positive",
    (p) =>
      p.category === "phishing" &&
      (p.event === "user_confirmed_phishing" ||
        p.event === "user_marked_safe" ||
        p.event === "false_positive"),
  ),
  search_satisfaction_rate: makeRateAggregator(
    "search",
    (p) => p.category === "search" && p.event === "found_what_needed",
    (p) =>
      p.category === "search" &&
      (p.event === "found_what_needed" || p.event === "abandoned"),
  ),
  inbox_agent_approval_rate: makeRateAggregator(
    "inbox_agent",
    (p) => p.category === "inbox_agent" && p.event === "draft_approved",
    (p) =>
      p.category === "inbox_agent" &&
      (p.event === "draft_approved" || p.event === "draft_rejected"),
  ),
  voice_clone_unchanged_rate: makeRateAggregator(
    "voice_clone",
    (p) => p.category === "voice_clone" && p.event === "draft_sent_unchanged",
    (p) =>
      p.category === "voice_clone" &&
      (p.event === "draft_sent_unchanged" ||
        p.event === "draft_sent_edited" ||
        p.event === "draft_discarded"),
  ),
};

// ─── Public API ────────────────────────────────────────────────────────────

export interface AggregateOptions {
  readonly now: Date;
  readonly windowDays?: number;
}

export function aggregateSnapshot(
  signals: readonly RawSignal[],
  opts: AggregateOptions,
): FlywheelSnapshot {
  const windowDays = opts.windowDays ?? WEEKS_OF_TREND * 7;
  const cutoff = opts.now.getTime() - windowDays * MS_PER_DAY;
  const inWindow = signals.filter(
    (s) => new Date(s.capturedAtIso).getTime() >= cutoff,
  );
  const weekKeys = buildWeekKeys(opts.now);

  const metrics: FlywheelMetric[] = METRIC_TARGETS.map((target: MetricTarget) => {
    const agg = AGGREGATORS[target.key];
    const result = agg
      ? agg(inWindow, weekKeys)
      : { value: 0, trend: weekKeys.map((w) => ({ weekStartIso: w, value: 0, sampleSize: 0 })) };
    return {
      key: target.key,
      label: target.label,
      category: target.category,
      value: result.value,
      unit: target.unit,
      target: target.target,
      direction: target.direction,
      trend: result.trend,
    };
  });

  // Composite RPM: average of each metric's score-against-target, weighted by sample size.
  let weightedScore = 0;
  let totalWeight = 0;
  for (const m of metrics) {
    const target = METRIC_TARGETS.find((t) => t.key === m.key);
    if (!target) continue;
    const samples = m.trend.reduce((sum, p) => sum + p.sampleSize, 0);
    if (samples === 0) continue;
    weightedScore += scoreAgainstTarget(m.value, target) * samples;
    totalWeight += samples;
  }
  const rpm = totalWeight === 0 ? 0 : weightedScore / totalWeight;

  return {
    generatedAtIso: opts.now.toISOString(),
    windowDays,
    totalSignals: inWindow.length,
    metrics,
    rpm,
  };
}

// ─── Per-user "Your AlecRae" rollup ────────────────────────────────────────

export interface UserStatsOptions {
  readonly now: Date;
  readonly userId: string;
}

export function aggregateUserStats(
  signals: readonly RawSignal[],
  opts: UserStatsOptions,
): UserFlywheelStats {
  const userSignals = signals.filter((s) => s.userId === opts.userId);

  const composeSent = userSignals.filter(
    (s) => s.payload.category === "compose" && s.payload.event === "email_sent",
  );
  const composeShown = userSignals.filter(
    (s) =>
      s.payload.category === "compose" &&
      (s.payload.event === "suggestion_shown" ||
        s.payload.event === "suggestion_accepted" ||
        s.payload.event === "suggestion_discarded"),
  );
  const composeAccepted = userSignals.filter(
    (s) => s.payload.category === "compose" && s.payload.event === "suggestion_accepted",
  );

  const draftsAcceptedCount = composeAccepted.length;
  const draftsAcceptedPct =
    composeShown.length === 0 ? 0 : composeAccepted.length / composeShown.length;

  const editDistances = userSignals
    .map((s) =>
      s.payload.category === "voice_profile" ? s.payload.editDistanceFromDraft : undefined,
    )
    .filter((v): v is number => typeof v === "number");
  // Confidence: 1 when avg edit distance ~0, 0 when ≥0.5, 0 when there's no data yet.
  const voiceProfileConfidence =
    editDistances.length === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            1 - editDistances.reduce((a, b) => a + b, 0) / editDistances.length / 0.5,
          ),
        );

  // Crude "minutes saved" estimate: 90s per accepted draft, 30s per smart reply chosen.
  const smartReplyChosen = userSignals.filter(
    (s) => s.payload.category === "smart_reply" && s.payload.event === "chosen",
  ).length;
  const minutesSavedEstimate = (composeAccepted.length * 90 + smartReplyChosen * 30) / 60;

  // "Words learned": sum of finalEmailLength across sent compose emails.
  const wordsLearned = composeSent.reduce((sum, s) => {
    if (s.payload.category !== "compose") return sum;
    return sum + (s.payload.finalEmailLength ?? 0);
  }, 0);

  const dayKeys = new Set(
    userSignals.map((s) => s.capturedAtIso.slice(0, 10)),
  );
  const daysActive = dayKeys.size;

  let maturityLabel: UserFlywheelStats["maturityLabel"] = "new";
  if (daysActive >= 60 && voiceProfileConfidence >= 0.75) maturityLabel = "expert";
  else if (daysActive >= 21 && voiceProfileConfidence >= 0.5) maturityLabel = "tuned";
  else if (daysActive >= 7) maturityLabel = "warming";

  return {
    userId: opts.userId,
    generatedAtIso: opts.now.toISOString(),
    voiceProfileConfidence,
    draftsAcceptedCount,
    draftsAcceptedPct,
    minutesSavedEstimate,
    wordsLearned,
    daysActive,
    maturityLabel,
  };
}
