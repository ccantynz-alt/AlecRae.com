/**
 * @emailed/support - Pipeline Module
 *
 * The inbound email → AI support agent → auto-reply pipeline.
 * This is the system that replaces an entire customer service team.
 *
 * Re-exports all pipeline components and provides a factory function
 * to wire everything together.
 */

// ─── Re-exports ────────────────────────────────────────────────────────────

export { SupportEmailPipeline } from "./email-intake";
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
} from "./email-intake";

export { SupportReplyComposer } from "./reply-composer";
export type {
  ComposedEmail,
  BrandConfig,
  CategoryTemplate,
} from "./reply-composer";

export { AutoResponder } from "./auto-responder";
export type {
  SpecialistRoute,
  DuplicateStore,
  UnsubscribeService,
  FollowUpService,
} from "./auto-responder";

export { SatisfactionTracker } from "./satisfaction";
export type {
  SurveyResponse,
  SatisfactionMetrics,
  LowScoreAlert,
  FeedbackInsight,
  SurveyStore,
  AlertService,
  TicketLookupService,
} from "./satisfaction";

export { SupportLearningEngine } from "./learning";
export type {
  TicketOutcome,
  OutcomeRecord,
  AgentPerformanceMetrics,
  IssuePattern,
  PromptImprovement,
  LearningStore,
} from "./learning";

// ─── Factory: Wire Everything Together ─────────────────────────────────────

import { SupportEmailPipeline } from "./email-intake";
import { SupportReplyComposer } from "./reply-composer";
import { AutoResponder } from "./auto-responder";
import { SatisfactionTracker } from "./satisfaction";
import { SupportLearningEngine } from "./learning";

import type { AiSupportAgent } from "../agent/ai-agent";
import type { TicketSystem } from "../tickets/system";
import type { EscalationRouter } from "../escalation/router";
import type { KnowledgeBase } from "../knowledge/base";
import type { PipelineConfig, EmailQueueService, AccountLookupService, ThreadStore, ConversationStore } from "./email-intake";
import type { BrandConfig } from "./reply-composer";
import type { DuplicateStore, UnsubscribeService, FollowUpService } from "./auto-responder";
import type { SurveyStore, AlertService, TicketLookupService } from "./satisfaction";
import type { LearningStore } from "./learning";

export interface SupportPipelineDeps {
  // Core AI & ticket services (from existing support modules)
  agent: AiSupportAgent;
  tickets: TicketSystem;
  escalationRouter: EscalationRouter;
  knowledgeBase: KnowledgeBase;

  // External service integrations
  emailQueue: EmailQueueService;
  accountLookup: AccountLookupService;
  threadStore: ThreadStore;
  conversationStore: ConversationStore;
  duplicateStore: DuplicateStore;
  unsubscribeService: UnsubscribeService;
  surveyStore: SurveyStore;
  alertService: AlertService;
  ticketLookup: TicketLookupService;
  learningStore: LearningStore;

  // Optional services
  followUpService?: FollowUpService;

  // Configuration
  pipelineConfig?: Partial<PipelineConfig>;
  brandConfig?: Partial<BrandConfig>;
  lowScoreThreshold?: number;
  surveyDelayMs?: number;
  duplicateTtlSeconds?: number;
}

export interface SupportPipeline {
  /** The main email processing pipeline */
  emailPipeline: SupportEmailPipeline;
  /** Composes reply emails */
  replyComposer: SupportReplyComposer;
  /** Handles auto-acknowledgments and routing */
  autoResponder: AutoResponder;
  /** Tracks customer satisfaction */
  satisfactionTracker: SatisfactionTracker;
  /** Learns from interactions to improve */
  learningEngine: SupportLearningEngine;
}

/**
 * Create a fully wired support pipeline.
 *
 * This factory connects all pipeline components together:
 * - SupportEmailPipeline: processes inbound emails end-to-end
 * - SupportReplyComposer: formats AI responses as professional emails
 * - AutoResponder: handles acknowledgments, OOO, duplicates, unsubscribes
 * - SatisfactionTracker: sends surveys and tracks CSAT/NPS
 * - SupportLearningEngine: records outcomes and suggests improvements
 *
 * Usage:
 * ```ts
 * const pipeline = createSupportPipeline({
 *   agent, tickets, escalationRouter, knowledgeBase,
 *   emailQueue, accountLookup, threadStore, conversationStore,
 *   duplicateStore, unsubscribeService, surveyStore,
 *   alertService, ticketLookup, learningStore,
 * });
 *
 * // Process an inbound support email
 * const result = await pipeline.emailPipeline.processInboundEmail(rawEmail);
 *
 * // Check pipeline health
 * const metrics = pipeline.emailPipeline.getMetrics();
 *
 * // Send a satisfaction survey after resolution
 * await pipeline.satisfactionTracker.sendSurvey(resolvedTicket);
 *
 * // Analyze AI performance
 * const performance = await pipeline.learningEngine.measureAgentPerformance();
 *
 * // Get improvement suggestions
 * const suggestions = await pipeline.learningEngine.suggestPromptImprovements();
 * ```
 */
export function createSupportPipeline(deps: SupportPipelineDeps): SupportPipeline {
  // 1. Reply Composer (no dependencies on other pipeline components)
  const replyComposer = new SupportReplyComposer(deps.brandConfig);

  // 2. Auto Responder (depends on reply composer)
  // Build options object, only including optional fields when defined
  const autoResponderDeps: ConstructorParameters<typeof AutoResponder>[0] = {
    replyComposer,
    duplicateStore: deps.duplicateStore,
    unsubscribeService: deps.unsubscribeService,
  };
  if (deps.followUpService !== undefined) {
    autoResponderDeps.followUpService = deps.followUpService;
  }
  if (deps.duplicateTtlSeconds !== undefined) {
    autoResponderDeps.duplicateTtlSeconds = deps.duplicateTtlSeconds;
  }
  const autoResponder = new AutoResponder(autoResponderDeps);

  // 3. Learning Engine (depends on knowledge base)
  const learningEngine = new SupportLearningEngine({
    store: deps.learningStore,
    knowledgeBase: deps.knowledgeBase,
  });

  // 4. Satisfaction Tracker (depends on reply composer, email queue)
  const satDeps: ConstructorParameters<typeof SatisfactionTracker>[0] = {
    store: deps.surveyStore,
    replyComposer,
    emailQueue: deps.emailQueue,
    alertService: deps.alertService,
    ticketLookup: deps.ticketLookup,
  };
  if (deps.lowScoreThreshold !== undefined) {
    satDeps.lowScoreThreshold = deps.lowScoreThreshold;
  }
  if (deps.surveyDelayMs !== undefined) {
    satDeps.surveyDelayMs = deps.surveyDelayMs;
  }
  const satisfactionTracker = new SatisfactionTracker(satDeps);

  // 5. Email Pipeline (depends on everything above)
  const pipelineDeps: ConstructorParameters<typeof SupportEmailPipeline>[0] = {
    agent: deps.agent,
    tickets: deps.tickets,
    escalationRouter: deps.escalationRouter,
    replyComposer,
    autoResponder,
    learningEngine,
    emailQueue: deps.emailQueue,
    accountLookup: deps.accountLookup,
    threadStore: deps.threadStore,
    conversationStore: deps.conversationStore,
  };
  if (deps.pipelineConfig !== undefined) {
    pipelineDeps.config = deps.pipelineConfig;
  }
  const emailPipeline = new SupportEmailPipeline(pipelineDeps);

  return {
    emailPipeline,
    replyComposer,
    autoResponder,
    satisfactionTracker,
    learningEngine,
  };
}
