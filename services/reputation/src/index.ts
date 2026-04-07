// ─── Reputation Service — Public API ─────────────────────────────────────────

// Types
export type {
  IspProvider,
  IspStrategy,
  IspSignal,
  WarmupSchedule,
  WarmupPhase,
  WarmupMetrics,
  WarmupStatus,
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
} from './types';

// Warm-up Orchestrator
export { WarmupOrchestrator, createWarmupOrchestrator } from './warmup/orchestrator';

// Reputation Scoring Engine
export {
  ReputationScoringEngine,
  createReputationScoringEngine,
  type ReputationTrend,
} from './scoring/engine';

// Feedback Loop Processor
export { FeedbackLoopProcessor, createFeedbackLoopProcessor } from './feedback-loops/processor';

// Blocklist Monitor
export {
  BlocklistMonitor,
  createBlocklistMonitor,
  type DnsResolver,
} from './blocklist/monitor';

// Compliance Enforcer
export { ComplianceEnforcer, createComplianceEnforcer } from './compliance/enforcer';
