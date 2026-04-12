/**
 * AI Inbox Agent — REST API (S3: Industry First)
 *
 * Vienna's flagship overnight agent. While the user sleeps, the agent
 * triages every new email, drafts replies in the user's voice, identifies
 * commitments, flags suspicious senders, and produces a one-tap morning
 * briefing.
 *
 * Endpoints:
 *
 *   POST   /v1/agent/run                    — Trigger an agent run
 *   GET    /v1/agent/briefing               — Get the latest morning briefing
 *   GET    /v1/agent/drafts                 — List auto-drafted replies awaiting approval
 *   POST   /v1/agent/drafts/:id/approve     — Approve and send a draft
 *   POST   /v1/agent/drafts/:id/reject      — Reject a draft
 *   POST   /v1/agent/drafts/:id/edit        — Edit a draft before sending
 *   PUT    /v1/agent/config                 — Configure agent behaviour
 *   GET    /v1/agent/config                 — Get current config
 *   GET    /v1/agent/runs                   — List recent runs
 *   GET    /v1/agent/runs/:id               — Full report for a single run
 *   POST   /v1/agent/runs/:id/approve       — Approve ALL drafted replies for a run
 *   POST   /v1/agent/runs/:id/approve-batch — Approve a subset of replies by draftId
 *
 * Auth: every endpoint requires `agent:read` or `agent:write` scope.
 * Rate-limit: write-level (200/min) — these are heavy operations.
 *
 * NOTE: Run execution is asynchronous. POST /run kicks the agent off via
 *       queueMicrotask so the HTTP request returns immediately with a runId
 *       the client can poll. In production this should be a BullMQ job.
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  InboxAgent,
  type AgentEmail,
  type AgentReport,
} from "@emailed/ai-engine/agent";
import {
  getDatabase,
  agentRuns,
  agentDrafts,
  agentConfigs,
  type AgentRunStats,
  type StoredTriageDecision,
  type StoredCommitment,
  type StoredAgentSuggestion,
  type AgentCategoryRule,
  type AgentScheduleConfig,
} from "@emailed/db";
import {
  enqueueAgentDraftForSend,
  AgentSendError,
} from "../lib/agent-send.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

// ─── Zod Schemas ────────────────────────────────────────────────────────────

const RunSchema = z.object({
  since: z.string().datetime().optional(),
  maxEmails: z.number().int().min(1).max(500).default(200),
  dryRun: z.boolean().default(false),
  morningHour: z.number().int().min(0).max(23).default(8),
});

const ApproveBatchSchema = z.object({
  draftIds: z.array(z.string()).min(1).max(200),
});

const EditDraftSchema = z.object({
  body: z.string().min(1).max(50000),
});

const AgentCategoryRuleSchema = z.object({
  category: z.string(),
  autoDraft: z.boolean(),
  autoArchive: z.boolean(),
  minConfidence: z.number().min(0).max(1),
});

const AgentScheduleConfigSchema = z.object({
  cron: z.string().min(9).max(100),
  timezone: z.string().default("UTC"),
});

const ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  schedule: AgentScheduleConfigSchema.nullable().optional(),
  morningHour: z.number().int().min(0).max(23).optional(),
  maxEmailsPerRun: z.number().int().min(1).max(500).optional(),
  minDraftConfidence: z.number().min(0).max(1).optional(),
  categoryRules: z.array(AgentCategoryRuleSchema).optional(),
  autoDraftCategories: z.array(z.string()).optional(),
  skipCategories: z.array(z.string()).optional(),
  enableCleanupSuggestions: z.boolean().optional(),
  enableCommitments: z.boolean().optional(),
  enableSecurityScan: z.boolean().optional(),
});

// ─── Report ↔ DB serialisation helpers ──────────────────────────────────────

function reportToStoredTriageDecisions(
  report: AgentReport,
): StoredTriageDecision[] {
  return report.triageDecisions.map((d) => ({
    emailId: d.emailId,
    category: d.category,
    priority: d.priority,
    action: d.action,
    confidence: d.confidence,
    reasoning: d.reasoning,
    suspicious: d.suspicious,
    suspicionReasons: d.suspicionReasons,
    needsReply: d.needsReply,
  }));
}

function reportToStoredCommitments(report: AgentReport): StoredCommitment[] {
  return report.commitments.map((c) => ({
    id: c.id,
    actor: c.actor,
    actorName: c.actorName,
    description: c.description,
    deadline: c.deadline ? c.deadline.toISOString() : undefined,
    status: c.status,
    sourceEmailId: c.sourceEmailId,
    sourceQuote: c.sourceQuote,
  }));
}

function reportToStoredSuggestions(
  report: AgentReport,
): StoredAgentSuggestion[] {
  return report.suggestions.map((s) => ({
    type: s.type,
    target: s.target,
    action: s.action,
    reasoning: s.reasoning,
    confidence: s.confidence,
    affectedCount: s.affectedCount,
  }));
}

function reportToStoredFlaggedSuspicious(
  report: AgentReport,
): StoredTriageDecision[] {
  return report.flaggedSuspicious.map((d) => ({
    emailId: d.emailId,
    category: d.category,
    priority: d.priority,
    action: d.action,
    confidence: d.confidence,
    reasoning: d.reasoning,
    suspicious: d.suspicious,
    suspicionReasons: d.suspicionReasons,
    needsReply: d.needsReply,
  }));
}

// ─── Agent singleton ────────────────────────────────────────────────────────
//
// The agent needs three things wired in:
//   1. an AI client (Claude)
//   2. an email loader  (DB query)
//   3. a draft queue    (schedule-send pipeline)
//
// We lazily construct it so the API server can boot without Claude creds in
// dev. The first /run call will surface a clear error if creds are missing.

let _agent: InboxAgent | null = null;
let _emailLoaderOverride:
  | ((accountId: string, since: Date, limit: number) => Promise<AgentEmail[]>)
  | undefined;

/**
 * Inject a custom email loader for the agent. Used by the imap service when
 * it boots to wire its inbox projection into the agent. Also used by tests.
 */
export function setAgentEmailLoader(
  loader: (
    accountId: string,
    since: Date,
    limit: number,
  ) => Promise<AgentEmail[]>,
): void {
  _emailLoaderOverride = loader;
  _agent = null; // Force re-init so the new loader takes effect
}

function getAgent(): InboxAgent {
  if (_agent) return _agent;

  const apiKey = process.env["ANTHROPIC_API_KEY"];

  // Real Claude client. Uses the Anthropic Messages API directly via fetch
  // so we don't introduce a new dependency. Returns either parsed JSON or
  // raw text depending on the helper called.
  const ai = {
    async generateJSON<T>(args: {
      system: string;
      prompt: string;
      maxTokens?: number;
      temperature?: number;
      model?: string;
    }): Promise<T> {
      const text = await this.generateText(args);
      // Strip code fences the model sometimes adds even when asked not to.
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();
      return JSON.parse(cleaned) as T;
    },
    async generateText(args: {
      system: string;
      prompt: string;
      maxTokens?: number;
      temperature?: number;
      model?: string;
    }): Promise<string> {
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: args.model ?? "claude-haiku-4-5",
          max_tokens: args.maxTokens ?? 1024,
          temperature: args.temperature ?? 0.4,
          system: args.system,
          messages: [{ role: "user", content: args.prompt }],
        }),
      });
      if (!res.ok) {
        throw new Error(
          `Claude API error: ${res.status} ${await res.text()}`,
        );
      }
      const json = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      const block = json.content?.find((b) => b.type === "text");
      return block?.text ?? "";
    },
  };

  // Email loader.
  //
  // The agent reads from the account's IMAP-synced inbox, which lives in the
  // imap service (services/imap) rather than in @emailed/db's outbound
  // `emails` table. When the imap service exposes a projection API the loader
  // will call it here. Until then loadEmails returns an empty list so the
  // agent still runs end-to-end (triage + briefing paths) and unit-level
  // integrations can inject a test loader via `setAgentEmailLoader` below.
  const loadEmails: (
    accountId: string,
    since: Date,
    limit: number,
  ) => Promise<AgentEmail[]> =
    _emailLoaderOverride ??
    (async () => {
      return [];
    });

  // Draft queueing is intentionally omitted from the agent factory. Drafts in
  // Vienna ALWAYS require explicit user approval (DraftedReply.requiresApproval
  // is hard-coded to true), so the queueDraft hook would only fire for drafts
  // the user has *not* yet approved. The real send path lives in the
  // /drafts/:id/approve and /runs/:id/approve routes below, which call
  // enqueueAgentDraftForSend() once the user has confirmed.
  _agent = new InboxAgent({
    ai,
    loadEmails,
    persistReport: async (report) => {
      await persistReportToDb(report);
    },
  });

  return _agent;
}

// ─── DB persistence helpers ─────────────────────────────────────────────────

async function persistReportToDb(
  report: AgentReport,
  overrideRunId?: string,
): Promise<void> {
  const db = getDatabase();
  const runId = overrideRunId ?? report.runId;

  // Upsert the run record
  const existingRuns = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.id, runId))
    .limit(1);

  const runData = {
    status: "completed" as const,
    totalProcessed: report.totalProcessed,
    stats: report.stats as AgentRunStats,
    triageDecisions: reportToStoredTriageDecisions(report),
    commitmentsList: reportToStoredCommitments(report),
    suggestions: reportToStoredSuggestions(report),
    flaggedSuspicious: reportToStoredFlaggedSuspicious(report),
    briefingMarkdown: report.briefingMarkdown,
    dryRun: report.dryRun,
    durationMs: report.durationMs,
    startedAt: report.runAt,
    finishedAt: report.finishedAt,
  };

  if (existingRuns.length > 0) {
    await db.update(agentRuns).set(runData).where(eq(agentRuns.id, runId));
  } else {
    await db.insert(agentRuns).values({
      id: runId,
      accountId: report.accountId,
      ...runData,
    });
  }

  // Persist each drafted reply
  if (!report.dryRun) {
    for (const draft of report.draftedReplies) {
      const draftId = generateId("draft");
      // Find the corresponding triage decision for this email
      const decision = report.triageDecisions.find(
        (d) => d.emailId === draft.emailId,
      );
      await db.insert(agentDrafts).values({
        id: draftId,
        accountId: report.accountId,
        runId,
        emailId: draft.emailId,
        threadId: draft.threadId ?? null,
        toAddresses: draft.to,
        subject: draft.subject,
        body: draft.draft,
        tone: draft.tone,
        confidence: draft.confidence,
        reasoning: draft.reasoning,
        category: decision?.category ?? null,
        priority: decision?.priority ?? null,
        action: decision?.action ?? null,
        status: "pending",
        scheduledFor: draft.scheduledFor ?? null,
      });
    }
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

const agent = new Hono();

// ─── POST /v1/agent/run — Kick off a run. Returns a runId immediately. ────

agent.post(
  "/run",
  requireScope("agent:write"),
  validateBody(RunSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RunSchema>>(c);
    const auth = c.get("auth");
    const runId = generateId("agent");
    const db = getDatabase();

    // Create a pending run record in the DB immediately.
    await db.insert(agentRuns).values({
      id: runId,
      accountId: auth.accountId,
      status: "running",
      dryRun: input.dryRun,
      startedAt: new Date(),
    });

    // Fire-and-forget. Real prod: enqueue a BullMQ job and return runId.
    queueMicrotask(async () => {
      try {
        // Build options without undefined values (exactOptionalPropertyTypes)
        const runOptions: {
          since?: Date;
          maxEmails: number;
          dryRun: boolean;
          morningHour: number;
        } = {
          maxEmails: input.maxEmails,
          dryRun: input.dryRun,
          morningHour: input.morningHour,
        };
        if (input.since) {
          runOptions.since = new Date(input.since);
        }
        const report = await getAgent().run(auth.accountId, runOptions);
        // Persist to DB with the pre-allocated runId.
        await persistReportToDb(report, runId);
      } catch (err) {
        console.error("[agent] run failed:", err);
        try {
          await db
            .update(agentRuns)
            .set({
              status: "failed",
              errorMessage:
                err instanceof Error ? err.message : "Unknown error",
              finishedAt: new Date(),
            })
            .where(eq(agentRuns.id, runId));
        } catch (dbErr) {
          console.error("[agent] failed to update run status:", dbErr);
        }
      }
    });

    return c.json(
      {
        data: {
          runId,
          status: "running",
          message:
            "Agent run started. Poll GET /v1/agent/runs/:id for the report.",
        },
      },
      202,
    );
  },
);

// ─── GET /v1/agent/briefing — Latest morning briefing ─────────────────────

agent.get("/briefing", requireScope("agent:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const [latestRun] = await db
    .select({
      id: agentRuns.id,
      briefingMarkdown: agentRuns.briefingMarkdown,
      stats: agentRuns.stats,
      totalProcessed: agentRuns.totalProcessed,
      durationMs: agentRuns.durationMs,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      status: agentRuns.status,
    })
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.accountId, auth.accountId),
        eq(agentRuns.status, "completed"),
      ),
    )
    .orderBy(desc(agentRuns.createdAt))
    .limit(1);

  if (!latestRun) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "No completed agent runs found. Trigger a run first.",
          code: "no_briefing",
        },
      },
      404,
    );
  }

  // Count pending drafts for this run
  const pendingDrafts = await db
    .select({ id: agentDrafts.id })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.runId, latestRun.id),
        eq(agentDrafts.status, "pending"),
      ),
    );

  return c.json({
    data: {
      runId: latestRun.id,
      briefingMarkdown: latestRun.briefingMarkdown,
      stats: latestRun.stats,
      totalProcessed: latestRun.totalProcessed,
      durationMs: latestRun.durationMs,
      startedAt: latestRun.startedAt,
      finishedAt: latestRun.finishedAt,
      pendingDraftCount: pendingDrafts.length,
    },
  });
});

// ─── GET /v1/agent/drafts — List auto-drafted replies ─────────────────────

agent.get("/drafts", requireScope("agent:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();
  const statusFilter = c.req.query("status") ?? "pending";
  const limit = Math.min(
    parseInt(c.req.query("limit") ?? "50", 10),
    200,
  );
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  // Validate status filter against known values
  const validStatuses = [
    "pending",
    "approved",
    "rejected",
    "edited",
    "sent",
    "expired",
    "all",
  ];
  if (!validStatuses.includes(statusFilter)) {
    return c.json(
      {
        error: {
          type: "validation_error",
          message: `Invalid status filter. Must be one of: ${validStatuses.join(", ")}`,
          code: "invalid_status",
        },
      },
      422,
    );
  }

  const conditions =
    statusFilter === "all"
      ? [eq(agentDrafts.accountId, auth.accountId)]
      : [
          eq(agentDrafts.accountId, auth.accountId),
          eq(
            agentDrafts.status,
            statusFilter as
              | "pending"
              | "approved"
              | "rejected"
              | "edited"
              | "sent"
              | "expired",
          ),
        ];

  const drafts = await db
    .select()
    .from(agentDrafts)
    .where(and(...conditions))
    .orderBy(desc(agentDrafts.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({
    data: {
      drafts: drafts.map((d) => ({
        id: d.id,
        runId: d.runId,
        emailId: d.emailId,
        threadId: d.threadId,
        to: d.toAddresses,
        subject: d.subject,
        body: d.body,
        editedBody: d.editedBody,
        tone: d.tone,
        confidence: d.confidence,
        reasoning: d.reasoning,
        category: d.category,
        priority: d.priority,
        action: d.action,
        status: d.status,
        scheduledFor: d.scheduledFor,
        approvedAt: d.approvedAt,
        rejectedAt: d.rejectedAt,
        sentAt: d.sentAt,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      total: drafts.length,
      limit,
      offset,
    },
  });
});

// ─── POST /v1/agent/drafts/:id/approve — Approve a single draft ──────────

agent.post(
  "/drafts/:id/approve",
  requireScope("agent:write"),
  async (c) => {
    const draftId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [draft] = await db
      .select()
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.id, draftId),
          eq(agentDrafts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!draft) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft not found",
            code: "draft_not_found",
          },
        },
        404,
      );
    }

    if (draft.status !== "pending" && draft.status !== "edited") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Draft is already ${draft.status} and cannot be approved`,
            code: "draft_already_actioned",
          },
        },
        409,
      );
    }

    const now = new Date();
    await db
      .update(agentDrafts)
      .set({
        status: "approved",
        approvedAt: now,
        updatedAt: now,
      })
      .where(eq(agentDrafts.id, draftId));

    // Enqueue the approved draft into the outbound MTA pipeline. We re-read
    // the row so sentAt and delayMs can be returned to the caller.
    const [approvedRow] = await db
      .select()
      .from(agentDrafts)
      .where(eq(agentDrafts.id, draftId))
      .limit(1);

    let sendResult: { emailId: string; delayMs: number } | null = null;
    if (approvedRow) {
      try {
        const result = await enqueueAgentDraftForSend(approvedRow);
        sendResult = { emailId: result.emailId, delayMs: result.delayMs };
      } catch (err) {
        if (err instanceof AgentSendError) {
          return c.json(
            {
              error: {
                type: "validation_error",
                message: err.message,
                code: err.code,
              },
            },
            422,
          );
        }
        throw err;
      }
    }

    return c.json({
      data: {
        id: draftId,
        status: "approved",
        approvedAt: now,
        scheduledFor: draft.scheduledFor,
        emailId: sendResult?.emailId ?? null,
        delayMs: sendResult?.delayMs ?? 0,
        message:
          sendResult && sendResult.delayMs === 0
            ? "Draft approved and queued for immediate delivery."
            : "Draft approved. It will be sent at the scheduled time.",
      },
    });
  },
);

// ─── POST /v1/agent/drafts/:id/reject — Reject a single draft ────────────

agent.post(
  "/drafts/:id/reject",
  requireScope("agent:write"),
  async (c) => {
    const draftId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [draft] = await db
      .select()
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.id, draftId),
          eq(agentDrafts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!draft) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft not found",
            code: "draft_not_found",
          },
        },
        404,
      );
    }

    if (draft.status !== "pending" && draft.status !== "edited") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Draft is already ${draft.status} and cannot be rejected`,
            code: "draft_already_actioned",
          },
        },
        409,
      );
    }

    const now = new Date();
    await db
      .update(agentDrafts)
      .set({
        status: "rejected",
        rejectedAt: now,
        updatedAt: now,
      })
      .where(eq(agentDrafts.id, draftId));

    return c.json({
      data: {
        id: draftId,
        status: "rejected",
        rejectedAt: now,
        message: "Draft rejected. It will not be sent.",
      },
    });
  },
);

// ─── POST /v1/agent/drafts/:id/edit — Edit a draft before sending ────────

agent.post(
  "/drafts/:id/edit",
  requireScope("agent:write"),
  validateBody(EditDraftSchema),
  async (c) => {
    const draftId = c.req.param("id");
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof EditDraftSchema>>(c);
    const db = getDatabase();

    const [draft] = await db
      .select()
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.id, draftId),
          eq(agentDrafts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!draft) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft not found",
            code: "draft_not_found",
          },
        },
        404,
      );
    }

    if (
      draft.status !== "pending" &&
      draft.status !== "edited"
    ) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `Draft is already ${draft.status} and cannot be edited`,
            code: "draft_already_actioned",
          },
        },
        409,
      );
    }

    const now = new Date();
    await db
      .update(agentDrafts)
      .set({
        status: "edited",
        editedBody: input.body,
        updatedAt: now,
      })
      .where(eq(agentDrafts.id, draftId));

    return c.json({
      data: {
        id: draftId,
        status: "edited",
        editedBody: input.body,
        updatedAt: now,
        message:
          "Draft edited. Use /approve to send or /reject to discard.",
      },
    });
  },
);

// ─── PUT /v1/agent/config — Configure agent behaviour ─────────────────────

agent.put(
  "/config",
  requireScope("agent:write"),
  validateBody(ConfigSchema),
  async (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof ConfigSchema>>(c);
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(agentConfigs)
      .where(eq(agentConfigs.accountId, auth.accountId))
      .limit(1);

    const now = new Date();

    if (existing) {
      // Build update payload — only set fields that were provided
      const updatePayload: Record<string, unknown> = { updatedAt: now };
      if (input.enabled !== undefined)
        updatePayload["enabled"] = input.enabled;
      if (input.schedule !== undefined)
        updatePayload["schedule"] = input.schedule as AgentScheduleConfig | null;
      if (input.morningHour !== undefined)
        updatePayload["morningHour"] = input.morningHour;
      if (input.maxEmailsPerRun !== undefined)
        updatePayload["maxEmailsPerRun"] = input.maxEmailsPerRun;
      if (input.minDraftConfidence !== undefined)
        updatePayload["minDraftConfidence"] = input.minDraftConfidence;
      if (input.categoryRules !== undefined)
        updatePayload["categoryRules"] = input.categoryRules as AgentCategoryRule[];
      if (input.autoDraftCategories !== undefined)
        updatePayload["autoDraftCategories"] = input.autoDraftCategories;
      if (input.skipCategories !== undefined)
        updatePayload["skipCategories"] = input.skipCategories;
      if (input.enableCleanupSuggestions !== undefined)
        updatePayload["enableCleanupSuggestions"] =
          input.enableCleanupSuggestions;
      if (input.enableCommitments !== undefined)
        updatePayload["enableCommitments"] = input.enableCommitments;
      if (input.enableSecurityScan !== undefined)
        updatePayload["enableSecurityScan"] = input.enableSecurityScan;

      await db
        .update(agentConfigs)
        .set(updatePayload)
        .where(eq(agentConfigs.accountId, auth.accountId));

      // Re-read to return the current state
      const [updated] = await db
        .select()
        .from(agentConfigs)
        .where(eq(agentConfigs.accountId, auth.accountId))
        .limit(1);

      return c.json({ data: updated });
    }

    // First-time config creation
    const configId = generateId("agcfg");
    const newConfig = {
      id: configId,
      accountId: auth.accountId,
      enabled: input.enabled ?? false,
      schedule: (input.schedule as AgentScheduleConfig | undefined) ?? null,
      morningHour: input.morningHour ?? 8,
      maxEmailsPerRun: input.maxEmailsPerRun ?? 200,
      minDraftConfidence: input.minDraftConfidence ?? 0.5,
      categoryRules: (input.categoryRules as AgentCategoryRule[] | undefined) ?? [],
      autoDraftCategories: input.autoDraftCategories ?? [
        "work",
        "personal",
        "important",
      ],
      skipCategories: input.skipCategories ?? ["spam", "promotional"],
      enableCleanupSuggestions: input.enableCleanupSuggestions ?? true,
      enableCommitments: input.enableCommitments ?? true,
      enableSecurityScan: input.enableSecurityScan ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(agentConfigs).values(newConfig);

    return c.json({ data: newConfig }, 201);
  },
);

// ─── GET /v1/agent/config — Get current config ───────────────────────────

agent.get("/config", requireScope("agent:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const [config] = await db
    .select()
    .from(agentConfigs)
    .where(eq(agentConfigs.accountId, auth.accountId))
    .limit(1);

  if (!config) {
    // Return sensible defaults if no config exists yet
    return c.json({
      data: {
        accountId: auth.accountId,
        enabled: false,
        schedule: null,
        morningHour: 8,
        maxEmailsPerRun: 200,
        minDraftConfidence: 0.5,
        categoryRules: [],
        autoDraftCategories: ["work", "personal", "important"],
        skipCategories: ["spam", "promotional"],
        enableCleanupSuggestions: true,
        enableCommitments: true,
        enableSecurityScan: true,
      },
    });
  }

  return c.json({ data: config });
});

// ─── GET /v1/agent/runs — List recent runs ────────────────────────────────

agent.get("/runs", requireScope("agent:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();
  const limit = Math.min(
    parseInt(c.req.query("limit") ?? "20", 10),
    100,
  );
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const runs = await db
    .select({
      id: agentRuns.id,
      status: agentRuns.status,
      totalProcessed: agentRuns.totalProcessed,
      stats: agentRuns.stats,
      dryRun: agentRuns.dryRun,
      durationMs: agentRuns.durationMs,
      errorMessage: agentRuns.errorMessage,
      startedAt: agentRuns.startedAt,
      finishedAt: agentRuns.finishedAt,
      createdAt: agentRuns.createdAt,
    })
    .from(agentRuns)
    .where(eq(agentRuns.accountId, auth.accountId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ data: runs });
});

// ─── GET /v1/agent/runs/:id — Full report for a single run ───────────────

agent.get("/runs/:id", requireScope("agent:read"), async (c) => {
  const id = c.req.param("id");
  const auth = c.get("auth");
  const db = getDatabase();

  const [run] = await db
    .select()
    .from(agentRuns)
    .where(
      and(eq(agentRuns.id, id), eq(agentRuns.accountId, auth.accountId)),
    )
    .limit(1);

  if (!run) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Run not found",
          code: "agent_run_not_found",
        },
      },
      404,
    );
  }

  if (run.status === "running") {
    return c.json(
      { data: { runId: id, status: "running" } },
      202,
    );
  }

  if (run.status === "failed") {
    return c.json(
      {
        error: {
          type: "internal",
          message: run.errorMessage ?? "Agent run failed",
          code: "agent_run_failed",
        },
      },
      500,
    );
  }

  // Fetch associated drafts
  const drafts = await db
    .select()
    .from(agentDrafts)
    .where(eq(agentDrafts.runId, id))
    .orderBy(desc(agentDrafts.confidence));

  return c.json({
    data: {
      ...run,
      drafts: drafts.map((d) => ({
        id: d.id,
        emailId: d.emailId,
        threadId: d.threadId,
        to: d.toAddresses,
        subject: d.subject,
        body: d.body,
        editedBody: d.editedBody,
        tone: d.tone,
        confidence: d.confidence,
        reasoning: d.reasoning,
        category: d.category,
        priority: d.priority,
        status: d.status,
        scheduledFor: d.scheduledFor,
        approvedAt: d.approvedAt,
        rejectedAt: d.rejectedAt,
        createdAt: d.createdAt,
      })),
    },
  });
});

// ─── POST /v1/agent/runs/:id/approve — Approve ALL drafts for a run ──────

agent.post(
  "/runs/:id/approve",
  requireScope("agent:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify run exists and belongs to account
    const [run] = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, id),
          eq(agentRuns.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!run) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Run not found",
            code: "agent_run_not_found",
          },
        },
        404,
      );
    }

    // Find all pending + edited drafts for this run in one pass so we can
    // both approve them and hand them off to the send pipeline.
    const draftsToApprove = await db
      .select()
      .from(agentDrafts)
      .where(
        and(
          eq(agentDrafts.runId, id),
          eq(agentDrafts.accountId, auth.accountId),
        ),
      );

    const now = new Date();
    let approvedCount = 0;
    let queuedCount = 0;
    const failed: { id: string; reason: string }[] = [];

    for (const draft of draftsToApprove) {
      if (draft.status !== "pending" && draft.status !== "edited") continue;

      await db
        .update(agentDrafts)
        .set({ status: "approved", approvedAt: now, updatedAt: now })
        .where(eq(agentDrafts.id, draft.id));
      approvedCount++;

      try {
        await enqueueAgentDraftForSend({
          ...draft,
          status: "approved",
          approvedAt: now,
          updatedAt: now,
        });
        queuedCount++;
      } catch (err) {
        failed.push({
          id: draft.id,
          reason: err instanceof Error ? err.message : "unknown",
        });
      }
    }

    return c.json({
      data: {
        runId: id,
        approvedCount,
        queuedCount,
        failedCount: failed.length,
        failures: failed,
        message: `Approved ${approvedCount} draft(s); ${queuedCount} queued for send.`,
      },
    });
  },
);

// ─── POST /v1/agent/runs/:id/approve-batch — Approve specific drafts ─────

agent.post(
  "/runs/:id/approve-batch",
  requireScope("agent:write"),
  validateBody(ApproveBatchSchema),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof ApproveBatchSchema>>(c);
    const db = getDatabase();

    // Verify run exists and belongs to account
    const [run] = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.id, id),
          eq(agentRuns.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!run) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Run not found",
            code: "agent_run_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const approvedIds: string[] = [];

    for (const draftId of input.draftIds) {
      const [draft] = await db
        .select({ id: agentDrafts.id, status: agentDrafts.status })
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.id, draftId),
            eq(agentDrafts.runId, id),
          ),
        )
        .limit(1);

      if (
        draft &&
        (draft.status === "pending" || draft.status === "edited")
      ) {
        await db
          .update(agentDrafts)
          .set({
            status: "approved",
            approvedAt: now,
            updatedAt: now,
          })
          .where(eq(agentDrafts.id, draftId));
        approvedIds.push(draftId);
      }
    }

    return c.json({
      data: {
        runId: id,
        approvedCount: approvedIds.length,
        approvedIds,
      },
    });
  },
);

export { agent };
