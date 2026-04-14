import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  index,
  real,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { accounts } from "./users.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const agentRunStatusEnum = pgEnum("agent_run_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const agentDraftStatusEnum = pgEnum("agent_draft_status", [
  "pending",
  "approved",
  "rejected",
  "edited",
  "sent",
  "expired",
]);

export const triageCategoryEnum = pgEnum("triage_category", [
  "urgent",
  "important",
  "personal",
  "work",
  "newsletter",
  "transactional",
  "promotional",
  "social",
  "spam",
  "suspicious",
  "other",
]);

export const triagePriorityEnum = pgEnum("triage_priority", [
  "now",
  "today",
  "this_week",
  "whenever",
  "never",
]);

export const triageActionEnum = pgEnum("triage_action", [
  "draft_reply",
  "schedule_reply",
  "flag_for_review",
  "archive",
  "mark_read",
  "snooze",
  "quarantine",
  "ignore",
]);

// ---------------------------------------------------------------------------
// Agent Runs — History of every agent execution
// ---------------------------------------------------------------------------

/** JSON shape stored in the stats column of agent_runs. */
export interface AgentRunStats {
  urgent: number;
  needsReply: number;
  drafted: number;
  suspicious: number;
  archivable: number;
  newsletters: number;
}

/** JSON shape stored in the triage_decisions column. */
export interface StoredTriageDecision {
  emailId: string;
  category: string;
  priority: string;
  action: string;
  confidence: number;
  reasoning: string;
  suspicious: boolean;
  suspicionReasons: string[] | undefined;
  needsReply: boolean;
}

/** JSON shape stored in the commitments column. */
export interface StoredCommitment {
  id: string;
  actor: string;
  actorName: string;
  description: string;
  deadline: string | undefined;
  status: string;
  sourceEmailId: string;
  sourceQuote: string;
}

/** JSON shape stored in the suggestions column. */
export interface StoredAgentSuggestion {
  type: string;
  target: string;
  action: string;
  reasoning: string;
  confidence: number;
  affectedCount: number | undefined;
}

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    status: agentRunStatusEnum("status").notNull().default("pending"),
    /** Number of emails processed in this run. */
    totalProcessed: integer("total_processed").notNull().default(0),
    /** High-level stats for quick display. */
    stats: jsonb("stats").$type<AgentRunStats>(),
    /** Per-email triage decisions (full array). */
    triageDecisions: jsonb("triage_decisions")
      .$type<StoredTriageDecision[]>()
      .notNull()
      .default([]),
    /** Commitments extracted during this run. */
    commitmentsList: jsonb("commitments_list")
      .$type<StoredCommitment[]>()
      .notNull()
      .default([]),
    /** Cleanup suggestions generated during this run. */
    suggestions: jsonb("suggestions")
      .$type<StoredAgentSuggestion[]>()
      .notNull()
      .default([]),
    /** Suspicious email IDs flagged during this run. */
    flaggedSuspicious: jsonb("flagged_suspicious")
      .$type<StoredTriageDecision[]>()
      .notNull()
      .default([]),
    /** Markdown morning briefing text. */
    briefingMarkdown: text("briefing_markdown").notNull().default(""),
    /** Whether this was a dry run (no side-effects). */
    dryRun: boolean("dry_run").notNull().default(false),
    /** Total wall-clock time in milliseconds. */
    durationMs: integer("duration_ms"),
    /** Optional error message if the run failed. */
    errorMessage: text("error_message"),
    /** When the run started. */
    startedAt: timestamp("started_at", { withTimezone: true }),
    /** When the run finished. */
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_runs_account_id_idx").on(table.accountId),
    index("agent_runs_status_idx").on(table.accountId, table.status),
    index("agent_runs_created_at_idx").on(table.accountId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Agent Drafts — Auto-generated replies awaiting user approval
// ---------------------------------------------------------------------------

export const agentDrafts = pgTable(
  "agent_drafts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The run that produced this draft. */
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    /** The email this draft is replying to. */
    emailId: text("email_id").notNull(),
    /** Optional thread ID for threading. */
    threadId: text("thread_id"),
    /** Recipient address(es). */
    toAddresses: jsonb("to_addresses").notNull().$type<string[]>(),
    /** Reply subject line. */
    subject: text("subject").notNull(),
    /** The drafted reply body. */
    body: text("body").notNull(),
    /** The user-edited body (if status is "edited"). */
    editedBody: text("edited_body"),
    /** Tone of the draft (e.g. professional, friendly). */
    tone: text("tone").notNull().default("friendly"),
    /** AI confidence in this draft (0..1). */
    confidence: real("confidence").notNull().default(0),
    /** Why the agent wrote this draft. */
    reasoning: text("reasoning").notNull().default(""),
    /** Triage category of the original email. */
    category: triageCategoryEnum("category"),
    /** Triage priority of the original email. */
    priority: triagePriorityEnum("priority"),
    /** Triage action recommended for the original email. */
    action: triageActionEnum("action"),
    /** Current status of this draft. */
    status: agentDraftStatusEnum("status").notNull().default("pending"),
    /** When the draft is scheduled to send (after approval). */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    /** When the user approved this draft. */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    /** When the user rejected this draft. */
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    /** When the draft was actually sent. */
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_drafts_account_id_idx").on(table.accountId),
    index("agent_drafts_run_id_idx").on(table.runId),
    index("agent_drafts_status_idx").on(table.accountId, table.status),
    index("agent_drafts_email_id_idx").on(table.emailId),
    index("agent_drafts_created_at_idx").on(table.accountId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Agent Config — Per-account settings for the AI agent
// ---------------------------------------------------------------------------

/** JSON shape for category-specific auto-handling rules. */
export interface AgentCategoryRule {
  /** Triage category name. */
  category: string;
  /** Whether the agent should auto-draft replies for this category. */
  autoDraft: boolean;
  /** Whether the agent should auto-archive for this category. */
  autoArchive: boolean;
  /** Minimum confidence to auto-act. */
  minConfidence: number;
}

/** JSON shape for the full agent schedule. */
export interface AgentScheduleConfig {
  /** Cron expression, e.g. "0 5 * * *" for 05:00 daily. */
  cron: string;
  /** IANA timezone, e.g. "America/Los_Angeles". */
  timezone: string;
}

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .unique(),
    /** Is the agent enabled for this account? */
    enabled: boolean("enabled").notNull().default(false),
    /** Schedule config (cron + timezone). Null = manual only. */
    schedule: jsonb("schedule").$type<AgentScheduleConfig>(),
    /** The local hour at which morning briefings / sends fire. */
    morningHour: integer("morning_hour").notNull().default(8),
    /** Maximum emails to process per run. */
    maxEmailsPerRun: integer("max_emails_per_run").notNull().default(200),
    /** Minimum confidence threshold for auto-drafting (0..1). */
    minDraftConfidence: real("min_draft_confidence").notNull().default(0.5),
    /** Per-category rules for what the agent auto-handles. */
    categoryRules: jsonb("category_rules")
      .$type<AgentCategoryRule[]>()
      .notNull()
      .default([]),
    /** Categories the agent should auto-draft replies for. */
    autoDraftCategories: jsonb("auto_draft_categories")
      .$type<string[]>()
      .notNull()
      .default(["work", "personal", "important"]),
    /** Categories the agent should skip entirely. */
    skipCategories: jsonb("skip_categories")
      .$type<string[]>()
      .notNull()
      .default(["spam", "promotional"]),
    /** Whether the agent should generate cleanup suggestions. */
    enableCleanupSuggestions: boolean("enable_cleanup_suggestions")
      .notNull()
      .default(true),
    /** Whether the agent should extract commitments. */
    enableCommitments: boolean("enable_commitments").notNull().default(true),
    /** Whether the agent should scan for phishing/suspicious emails. */
    enableSecurityScan: boolean("enable_security_scan").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("agent_configs_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const agentRunsRelations = relations(agentRuns, ({ one, many }) => ({
  account: one(accounts, {
    fields: [agentRuns.accountId],
    references: [accounts.id],
  }),
  drafts: many(agentDrafts),
}));

export const agentDraftsRelations = relations(agentDrafts, ({ one }) => ({
  account: one(accounts, {
    fields: [agentDrafts.accountId],
    references: [accounts.id],
  }),
  run: one(agentRuns, {
    fields: [agentDrafts.runId],
    references: [agentRuns.id],
  }),
}));

export const agentConfigsRelations = relations(agentConfigs, ({ one }) => ({
  account: one(accounts, {
    fields: [agentConfigs.accountId],
    references: [accounts.id],
  }),
}));
