/**
 * @emailed/support - AI Support Service
 *
 * Autonomous AI-powered customer support for the Emailed platform.
 * Handles ticket management, automated diagnostics, knowledge base
 * search, and smart escalation routing.
 */

export { AiSupportAgent, createDefaultAgentConfig } from "./agent/ai-agent";
export type { PlatformServices } from "./agent/ai-agent";

export { KnowledgeBase, loadDefaultArticles } from "./knowledge/base";

export {
  TicketSystem,
  InMemoryTicketStore,
  autoCategorize,
  autoPrioritize,
} from "./tickets/system";
export type { TicketStore, TicketFilter } from "./tickets/system";

export { DiagnosticsRunner } from "./diagnostics/runner";
export type { DiagnosticServices } from "./diagnostics/runner";

export { EscalationRouter } from "./escalation/router";

// Pipeline — Inbound email → AI agent → auto-reply
export {
  SupportEmailPipeline,
  SupportReplyComposer,
  AutoResponder,
  SatisfactionTracker,
  SupportLearningEngine,
  createSupportPipeline,
} from "./pipeline";
export type {
  RawInboundEmail,
  EmailAddress,
  EmailAttachment,
  IntakeResult,
  PipelineMetrics,
  PipelineConfig,
  EmailQueueService,
  AccountLookupService,
  ThreadStore,
  ConversationStore,
  ComposedEmail,
  BrandConfig,
  CategoryTemplate,
  SpecialistRoute,
  DuplicateStore,
  UnsubscribeService,
  FollowUpService,
  SurveyResponse,
  SatisfactionMetrics,
  LowScoreAlert,
  FeedbackInsight,
  SurveyStore,
  AlertService,
  TicketLookupService,
  TicketOutcome,
  OutcomeRecord,
  AgentPerformanceMetrics,
  IssuePattern,
  PromptImprovement,
  LearningStore,
  SupportPipelineDeps,
  SupportPipeline,
} from "./pipeline";

export type {
  // Conversation
  Conversation,
  ConversationMessage,
  ConversationContext,
  ConversationRole,
  // Agent
  AgentAction,
  AgentActionResult,
  AgentActionType,
  AgentConfig,
  AgentResponse,
  // Knowledge
  KnowledgeArticle,
  KnowledgeBaseConfig,
  KnowledgeSearchResult,
  ArticleCategory,
  // Tickets
  Ticket,
  TicketNote,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  CreateTicketInput,
  UpdateTicketInput,
  SlaInfo,
  SlaPolicy,
  // Diagnostics
  DiagnosticCheck,
  DiagnosticCheckType,
  DiagnosticReport,
  DiagnosticRunnerConfig,
  DiagnosticStatus,
  // Escalation
  EscalationContext,
  EscalationRequest,
  EscalationResult,
  EscalationRule,
  EscalationReason,
  EscalationTeam,
  // Platform
  DnsStatusSummary,
  ReputationSummary,
  DeliveryStatsSummary,
  ErrorLogEntry,
  AccountSettings,
  // Utility
  Result,
} from "./types";

export { ok, err, SLA_POLICIES } from "./types";
