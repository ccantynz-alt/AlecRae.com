/**
 * @emailed/reputation — Reputation Management Service
 *
 * Exports the warm-up orchestrator, monitor, and other reputation
 * management modules.
 */

// Warm-up
export {
  WarmupOrchestrator,
  getWarmupOrchestrator,
  WARMUP_SCHEDULES,
  type WarmupScheduleType,
  type WarmupStatus,
  type WarmupSignals,
  type ScheduleStep,
} from "./warmup/orchestrator.js";

export {
  WarmupMonitor,
  getWarmupMonitor,
  type WarmupMetricSnapshot,
  type WarmupReport,
} from "./warmup/monitor.js";

// Types
export type {
  IspProvider,
  IspStrategy,
  IspSignal,
  WarmupSchedule,
  WarmupPhase,
  WarmupMetrics,
  DailySnapshot,
  IpReputationScore,
  DomainReputationScore,
  ReputationCategory,
  ReputationSignal,
  ReputationFactors,
  ArfComplaint,
  ArfFeedbackType,
  FblSubscription,
  SuppressionEntry,
  SuppressionReason,
  Blocklist,
  BlocklistCheckResult,
  BlocklistAlert,
  ComplianceFramework,
  ComplianceCheckResult,
  ComplianceViolation,
  ConsentRecord,
  EmailMetadata,
} from "./types.js";
