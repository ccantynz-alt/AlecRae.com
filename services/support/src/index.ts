/**
 * @alecrae/support - AI Support Service
 *
 * Autonomous AI-powered customer support for the AlecRae platform.
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
