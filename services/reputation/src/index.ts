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

// Compliance Engine
export {
  ComplianceEngine,
  type ComplianceEngineConfig,
  type SuppressionListEntry,
} from "./compliance/engine.js";

// Blocklist Monitor
export {
  BlocklistMonitor,
} from "./blocklist/monitor.js";

// Reputation Scoring
export {
  ReputationEngine,
} from "./scoring/engine.js";

// Reputation Alerting — shared Slack + hard-pause path
export {
  postSlackAlert,
  pauseWarmupForDomain,
  pauseAllActiveWarmups,
  type ReputationAlertLevel,
  type ReputationAlert,
} from "./alerts/slack.js";

// Google Postmaster Tools — v1 reputation scale
export {
  buildVerificationTxtRecord,
  fetchLatestTrafficStats,
  normalizeReputationCategory,
  alertLevelForReputation,
  checkDomainReputation,
  pollAllDomains,
  type DomainVerificationRecord,
  type GoogleTrafficStats,
  type GoogleIpReputationEntry,
  type GoogleDeliveryError,
  type NormalizedReputation,
  type PostmasterCheckOutcome,
} from "./postmaster/index.js";

// Google Postmaster Tools — v2 bulk-sender compliance
export {
  fetchComplianceStatus,
  parseComplianceFailures,
  checkDomainCompliance,
  pollAllDomainsCompliance,
  type ComplianceState,
  type ComplianceRequirement,
  type ComplianceStatusResponse,
  type ComplianceFailure,
  type ComplianceCheckOutcome,
} from "./postmaster/compliance.js";

// Google Postmaster Tools — shared auth
export {
  getAccessToken as getPostmasterAccessToken,
  POSTMASTER_SCOPES,
  monitoredDomainsFromEnv,
} from "./postmaster/auth.js";

// Microsoft SNDS
export {
  fetchSndsData,
  parseSndsResponse,
  alertLevelForSndsColor,
  checkSndsReputation,
  type SndsColor,
  type SndsIpStatus,
  type SndsCheckOutcome,
} from "./snds/index.js";

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
