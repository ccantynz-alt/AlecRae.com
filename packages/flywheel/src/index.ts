/**
 * @alecrae/flywheel — typed signal collection + aggregation.
 *
 * Public surface: types, schemas, the per-metric aggregator, the
 * per-user "Your AlecRae" rollup, and the FlywheelTracker class for
 * browser/server signal recording.
 */

export {
  SignalCategory,
  ComposeSignalSchema,
  TriageSignalSchema,
  SmartReplySignalSchema,
  VoiceProfileSignalSchema,
  PhishingSignalSchema,
  SearchSignalSchema,
  InboxAgentSignalSchema,
  VoiceCloneSignalSchema,
  SignalPayloadSchema,
} from "./types.js";

export type {
  SignalPayload,
  FlywheelMetric,
  FlywheelSnapshot,
  TrendPoint,
  UserFlywheelStats,
} from "./types.js";

export { METRIC_TARGETS, scoreAgainstTarget } from "./targets.js";
export type { MetricTarget } from "./targets.js";

export { aggregateSnapshot, aggregateUserStats } from "./aggregate.js";
export type { RawSignal, AggregateOptions, UserStatsOptions } from "./aggregate.js";

export { FlywheelTracker } from "./tracker.js";
export type { TrackerConfig } from "./tracker.js";
