/**
 * @alecrae/support - TypeScript type definitions
 * All types for the AI Support service.
 */

// ─── Result Type ────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ─── Conversation Types ─────────────────────────────────────────────────────

export type ConversationRole = "user" | "assistant" | "system";

export interface ConversationMessage {
  id: string;
  role: ConversationRole;
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface Conversation {
  id: string;
  ticketId: string;
  accountId: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  status: "active" | "waiting_user" | "waiting_agent" | "resolved" | "escalated";
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationContext {
  accountId: string;
  domain?: string;
  recentErrors: ErrorLogEntry[];
  dnsStatus?: DnsStatusSummary;
  reputationScore?: ReputationSummary;
  deliveryStats?: DeliveryStatsSummary;
  accountSettings?: AccountSettings;
  previousTickets: TicketSummary[];
}

// ─── Platform Access Types ──────────────────────────────────────────────────

export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  level: "error" | "warn" | "info";
  service: string;
  message: string;
  recipient?: string;
  errorCode?: string;
  details?: Record<string, unknown>;
}

export interface DnsStatusSummary {
  domain: string;
  spfValid: boolean;
  spfRecord?: string;
  dkimValid: boolean;
  dkimSelector?: string;
  dmarcValid: boolean;
  dmarcPolicy?: string;
  mxRecords: string[];
  lastCheckedAt: Date;
  issues: string[];
}

export interface ReputationSummary {
  domain: string;
  overallScore: number; // 0-100
  spamRate: number; // 0-1
  bounceRate: number; // 0-1
  complaintRate: number; // 0-1
  blacklisted: boolean;
  blacklists: string[];
  trend: "improving" | "stable" | "declining";
  lastUpdatedAt: Date;
}

export interface DeliveryStatsSummary {
  totalSent: number;
  delivered: number;
  bounced: number;
  deferred: number;
  rejected: number;
  deliveryRate: number;
  avgDeliveryTimeMs: number;
  period: "1h" | "24h" | "7d" | "30d";
}

export interface AccountSettings {
  accountId: string;
  plan: "free" | "starter" | "professional" | "enterprise";
  domains: string[];
  sendingLimits: {
    perHour: number;
    perDay: number;
    perMonth: number;
  };
  features: string[];
  createdAt: Date;
}

// ─── Agent Types ────────────────────────────────────────────────────────────

export type AgentActionType =
  | "check_dns"
  | "check_reputation"
  | "check_delivery_logs"
  | "check_authentication"
  | "check_account_settings"
  | "run_diagnostics"
  | "search_knowledge_base"
  | "update_dns_record"
  | "rotate_dkim_key"
  | "adjust_sending_rate"
  | "whitelist_ip"
  | "create_ticket_note"
  | "escalate_to_human";

export interface AgentAction {
  type: AgentActionType;
  params: Record<string, unknown>;
  description: string;
}

export interface AgentActionResult {
  action: AgentAction;
  success: boolean;
  data?: unknown;
  error?: string;
  executedAt: Date;
}

export interface AgentResponse {
  message: string;
  actions: AgentActionResult[];
  confidence: number; // 0-1
  suggestedEscalation: boolean;
  resolvedIssue: boolean;
  followUpNeeded: boolean;
}

export interface AgentConfig {
  modelId: string;
  maxTokens: number;
  temperature: number;
  maxActionsPerTurn: number;
  confidenceThreshold: number;
  escalationThreshold: number;
  systemPrompt: string;
}

// ─── Knowledge Base Types ───────────────────────────────────────────────────

export interface KnowledgeArticle {
  id: string;
  title: string;
  content: string;
  category: ArticleCategory;
  tags: string[];
  embedding?: number[];
  relevanceScore?: number;
  viewCount: number;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type ArticleCategory =
  | "dns_setup"
  | "authentication"
  | "deliverability"
  | "bounces"
  | "reputation"
  | "rate_limiting"
  | "account_management"
  | "api_usage"
  | "billing"
  | "security"
  | "troubleshooting";

export interface KnowledgeSearchResult {
  article: KnowledgeArticle;
  score: number;
  matchedTerms: string[];
  excerpt: string;
}

export interface KnowledgeBaseConfig {
  embeddingDimensions: number;
  maxSearchResults: number;
  minRelevanceScore: number;
}

// ─── Ticket Types ───────────────────────────────────────────────────────────

export type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_customer"
  | "waiting_internal"
  | "resolved"
  | "closed"
  | "escalated";

export type TicketPriority = "low" | "medium" | "high" | "critical";

export type TicketCategory =
  | "delivery_issue"
  | "dns_configuration"
  | "authentication_failure"
  | "reputation_problem"
  | "bounce_issue"
  | "rate_limiting"
  | "account_access"
  | "billing"
  | "feature_request"
  | "bug_report"
  | "general_inquiry";

export interface Ticket {
  id: string;
  accountId: string;
  conversationId: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  assignedTo: string | null;
  tags: string[];
  sla: SlaInfo;
  diagnosticResults?: DiagnosticReport;
  notes: TicketNote[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
}

export interface TicketSummary {
  id: string;
  subject: string;
  status: TicketStatus;
  category: TicketCategory;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface TicketNote {
  id: string;
  author: string;
  authorType: "ai" | "human" | "system";
  content: string;
  internal: boolean;
  createdAt: Date;
}

export interface CreateTicketInput {
  accountId: string;
  subject: string;
  description: string;
  priority?: TicketPriority;
  category?: TicketCategory;
  tags?: string[];
}

export interface UpdateTicketInput {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  assignedTo?: string | null;
  tags?: string[];
}

// ─── SLA Types ──────────────────────────────────────────────────────────────

export interface SlaInfo {
  policy: SlaPolicy;
  firstResponseDue: Date;
  resolutionDue: Date;
  firstResponseAt: Date | null;
  firstResponseBreached: boolean;
  resolutionBreached: boolean;
}

export interface SlaPolicy {
  name: string;
  priority: TicketPriority;
  firstResponseMinutes: number;
  resolutionMinutes: number;
}

export const SLA_POLICIES: Record<TicketPriority, SlaPolicy> = {
  critical: {
    name: "Critical",
    priority: "critical",
    firstResponseMinutes: 15,
    resolutionMinutes: 120,
  },
  high: {
    name: "High",
    priority: "high",
    firstResponseMinutes: 60,
    resolutionMinutes: 480,
  },
  medium: {
    name: "Medium",
    priority: "medium",
    firstResponseMinutes: 240,
    resolutionMinutes: 1440,
  },
  low: {
    name: "Low",
    priority: "low",
    firstResponseMinutes: 1440,
    resolutionMinutes: 4320,
  },
};

// ─── Diagnostics Types ──────────────────────────────────────────────────────

export type DiagnosticCheckType =
  | "dns"
  | "deliverability"
  | "authentication"
  | "reputation"
  | "error_logs"
  | "sending_limits"
  | "blacklist";

export type DiagnosticStatus = "pass" | "warn" | "fail" | "error" | "skipped";

export interface DiagnosticCheck {
  type: DiagnosticCheckType;
  name: string;
  status: DiagnosticStatus;
  message: string;
  details: Record<string, unknown>;
  duration: number; // ms
  timestamp: Date;
}

export interface DiagnosticReport {
  id: string;
  accountId: string;
  domain: string;
  checks: DiagnosticCheck[];
  overallStatus: DiagnosticStatus;
  summary: string;
  recommendations: string[];
  createdAt: Date;
  durationMs: number;
}

export interface DiagnosticRunnerConfig {
  timeoutMs: number;
  parallelChecks: boolean;
  checksToRun: DiagnosticCheckType[];
}

// ─── Escalation Types ───────────────────────────────────────────────────────

export type EscalationReason =
  | "low_confidence"
  | "customer_request"
  | "complex_issue"
  | "billing_issue"
  | "security_concern"
  | "repeated_failure"
  | "sla_breach"
  | "account_suspension"
  | "data_loss";

export type EscalationTeam =
  | "tier2_support"
  | "engineering"
  | "deliverability"
  | "security"
  | "billing"
  | "account_management";

export interface EscalationRequest {
  ticketId: string;
  reason: EscalationReason;
  team: EscalationTeam;
  urgency: "normal" | "urgent" | "emergency";
  context: string;
  aiSummary: string;
  conversationHistory: ConversationMessage[];
  diagnosticReport?: DiagnosticReport;
}

export interface EscalationResult {
  escalated: boolean;
  team?: EscalationTeam;
  assignedTo?: string;
  estimatedResponseTime?: number; // minutes
  reason: string;
}

export interface EscalationRule {
  condition: (context: EscalationContext) => boolean;
  team: EscalationTeam;
  urgency: "normal" | "urgent" | "emergency";
  description: string;
}

export interface EscalationContext {
  ticket: Ticket;
  conversation: Conversation;
  diagnostics?: DiagnosticReport;
  aiConfidence: number;
  turnCount: number;
  customerSentiment: "positive" | "neutral" | "frustrated" | "angry";
  issueComplexity: "simple" | "moderate" | "complex";
  isRepeatIssue: boolean;
}
