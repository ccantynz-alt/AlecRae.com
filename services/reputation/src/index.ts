/**
 * @alecrae/reputation — Reputation Management Service
 *
 * Exports the warm-up orchestrator, monitor, and other reputation
 * management modules.
 */

// Warm-up
export {
  WarmupOrchestrator,
  getWarmupOrchestrator,
  WARMUP_SCHEDULES,
  AUTO_WARMUP_SCHEDULE,
  WARMUP_LIMIT_EXCEEDED,
  type WarmupScheduleType,
  type WarmupStatus,
  type WarmupSignals,
  type WarmupCheckResult,
  type ScheduleStep,
  type AutoWarmupStep,
} from "./warmup/orchestrator.js";

export {
  WarmupMonitor,
  getWarmupMonitor,
  type WarmupMetricSnapshot,
  type WarmupReport,
} from "./warmup/monitor.js";

// Feedback Loops — Complaint Rate Monitor
export {
  getComplaintRate,
  type ComplaintRateResult,
} from "./feedback-loops/complaint-rate.js";

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
