/**
 * AI Inbox Agent — REST API
 *
 * Vienna's flagship overnight agent. Endpoints:
 *
 *   POST   /v1/agent/run                    — Trigger an agent run (returns runId)
 *   GET    /v1/agent/runs                   — List recent runs for the account
 *   GET    /v1/agent/runs/:id               — Full report for a single run
 *   POST   /v1/agent/runs/:id/approve       — Approve and send ALL drafted replies
 *   POST   /v1/agent/runs/:id/approve-batch — Approve a subset of replies by emailId
 *   POST   /v1/agent/schedule               — Configure the recurring schedule (cron)
 *   GET    /v1/agent/schedule               — Read the current schedule
 *   DELETE /v1/agent/schedule               — Disable the recurring schedule
 *
 * Auth: every endpoint requires `agent:read` or `agent:write` scope.
 * Rate-limit: write-level (200/min) — these are heavy operations.
 *
 * NOTE: Run execution is asynchronous. POST /run kicks the agent off via
 *       setImmediate so the HTTP request returns immediately with a runId
 *       the client can poll. In production this should be a BullMQ job.
 */

import { Hono } from "hono";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  InboxAgent,
  type AgentEmail,
  type AgentReport,
  type DraftedReply,
} from "@emailed/ai-engine/agent";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const RunSchema = z.object({
  since: z.string().datetime().optional(),
  maxEmails: z.number().int().min(1).max(500).default(200),
  dryRun: z.boolean().default(false),
  morningHour: z.number().int().min(0).max(23).default(8),
});

const ApproveBatchSchema = z.object({
  emailIds: z.array(z.string()).min(1).max(200),
});

const ScheduleSchema = z.object({
  /** Cron expression — e.g. "0 5 * * *" for every day at 05:00 */
  cron: z.string().min(9).max(100),
  /** IANA tz, e.g. "America/Los_Angeles" */
  timezone: z.string().default("UTC"),
  morningHour: z.number().int().min(0).max(23).default(8),
  enabled: z.boolean().default(true),
});

interface AgentSchedule {
  accountId: string;
  cron: string;
  timezone: string;
  morningHour: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── In-memory stores ────────────────────────────────────────────────────────
// Production: persist these to Postgres. Kept in-memory here so the route is
// runnable without a migration (matches the pattern used by inbox.ts).

const runStore = new Map<string, AgentReport[]>();          // accountId → reports
const runIndex = new Map<string, AgentReport>();             // runId → report
const inflightRuns = new Map<string, "running" | "done" | "failed">();
const scheduleStore = new Map<string, AgentSchedule>();      // accountId → schedule
const approvedDrafts = new Set<string>();                    // runId:emailId

// ─── Agent singleton ─────────────────────────────────────────────────────────
//
// The agent needs three things wired in:
//   1. an AI client (Claude)
//   2. an email loader  (DB query)
//   3. a draft queue    (schedule-send pipeline)
//
// We lazily construct it so the API server can boot without Claude creds in
// dev. The first /run call will surface a clear error if creds are missing.

let _agent: InboxAgent | null = null;
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
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
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
        throw new Error(`Claude API error: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const block = json.content?.find((b) => b.type === "text");
      return block?.text ?? "";
    },
  };

  // Email loader — production should query the messages table for the
  // account. For now we return an empty list so the agent runs cleanly in
  // dev without a DB. Wire this to your DB layer in production.
  const loadEmails = async (
    _accountId: string,
    _since: Date,
    _limit: number,
  ): Promise<AgentEmail[]> => {
    // TODO: integrate with @emailed/db messages query.
    return [];
  };

  _agent = new InboxAgent({
    ai,
    loadEmails,
    persistReport: async (report) => {
      runIndex.set(report.runId, report);
      const list = runStore.get(report.accountId) ?? [];
      list.unshift(report);
      runStore.set(report.accountId, list.slice(0, 100));
    },
    queueDraft: async (_draft) => {
      // TODO: hand off to schedule-send queue. Kept as a no-op so the agent
      // can run in dev without the full send pipeline.
    },
  });

  return _agent;
}

// ─── Router ──────────────────────────────────────────────────────────────────

const agent = new Hono();

// POST /v1/agent/run — Kick off a run. Returns a runId immediately.
agent.post(
  "/run",
  requireScope("agent:write"),
  validateBody(RunSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof RunSchema>>(c);
    const auth = c.get("auth");
    const runId = `agent_${Date.now()}_${randomUUID().slice(0, 8)}`;

    inflightRuns.set(runId, "running");

    // Fire-and-forget. Real prod: enqueue a BullMQ job and return runId.
    queueMicrotask(async () => {
      try {
        const report = await getAgent().run(auth.accountId, {
          since: input.since ? new Date(input.since) : undefined,
          maxEmails: input.maxEmails,
          dryRun: input.dryRun,
          morningHour: input.morningHour,
        });
        // Override runId so it matches the one returned to the caller.
        const stored: AgentReport = { ...report, runId };
        runIndex.set(runId, stored);
        const list = runStore.get(auth.accountId) ?? [];
        list.unshift(stored);
        runStore.set(auth.accountId, list.slice(0, 100));
        inflightRuns.set(runId, "done");
      } catch (err) {
        console.error("[agent] run failed:", err);
        inflightRuns.set(runId, "failed");
      }
    });

    return c.json(
      {
        data: {
          runId,
          status: "running",
          message: "Agent run started. Poll GET /v1/agent/runs/:id for the report.",
        },
      },
      202,
    );
  },
);

// GET /v1/agent/runs — List recent runs for the account.
agent.get(
  "/runs",
  requireScope("agent:read"),
  (c) => {
    const auth = c.get("auth");
    const list = runStore.get(auth.accountId) ?? [];
    return c.json({
      data: list.map((r) => ({
        runId: r.runId,
        runAt: r.runAt,
        finishedAt: r.finishedAt,
        durationMs: r.durationMs,
        totalProcessed: r.totalProcessed,
        stats: r.stats,
        dryRun: r.dryRun,
      })),
    });
  },
);

// GET /v1/agent/runs/:id — Full report including briefing markdown.
agent.get(
  "/runs/:id",
  requireScope("agent:read"),
  (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const report = runIndex.get(id);
    const status = inflightRuns.get(id);

    if (!report) {
      if (status === "running") {
        return c.json({ data: { runId: id, status: "running" } }, 202);
      }
      if (status === "failed") {
        return c.json(
          { error: { type: "internal", message: "Agent run failed", code: "agent_run_failed" } },
          500,
        );
      }
      return c.json(
        { error: { type: "not_found", message: "Run not found", code: "agent_run_not_found" } },
        404,
      );
    }

    if (report.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "forbidden", message: "Run belongs to another account", code: "forbidden" } },
        403,
      );
    }

    return c.json({ data: report });
  },
);

// POST /v1/agent/runs/:id/approve — Approve and send ALL drafted replies.
agent.post(
  "/runs/:id/approve",
  requireScope("agent:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const report = runIndex.get(id);

    if (!report || report.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "not_found", message: "Run not found", code: "agent_run_not_found" } },
        404,
      );
    }

    const approved: DraftedReply[] = [];
    for (const draft of report.draftedReplies) {
      const key = `${id}:${draft.emailId}`;
      if (approvedDrafts.has(key)) continue;
      approvedDrafts.add(key);
      approved.push(draft);
      // TODO: actually enqueue these into the schedule-send pipeline.
    }

    return c.json({
      data: {
        runId: id,
        approvedCount: approved.length,
        message: `Approved ${approved.length} draft(s) for scheduled send.`,
      },
    });
  },
);

// POST /v1/agent/runs/:id/approve-batch — Approve specific drafts by emailId.
agent.post(
  "/runs/:id/approve-batch",
  requireScope("agent:write"),
  validateBody(ApproveBatchSchema),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof ApproveBatchSchema>>(c);
    const report = runIndex.get(id);

    if (!report || report.accountId !== auth.accountId) {
      return c.json(
        { error: { type: "not_found", message: "Run not found", code: "agent_run_not_found" } },
        404,
      );
    }

    const requested = new Set(input.emailIds);
    const approved: DraftedReply[] = [];
    for (const draft of report.draftedReplies) {
      if (!requested.has(draft.emailId)) continue;
      const key = `${id}:${draft.emailId}`;
      if (approvedDrafts.has(key)) continue;
      approvedDrafts.add(key);
      approved.push(draft);
    }

    return c.json({
      data: {
        runId: id,
        approvedCount: approved.length,
        approvedIds: approved.map((d) => d.emailId),
      },
    });
  },
);

// POST /v1/agent/schedule — Configure the recurring schedule.
agent.post(
  "/schedule",
  requireScope("agent:write"),
  validateBody(ScheduleSchema),
  (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof ScheduleSchema>>(c);
    const now = new Date();
    const existing = scheduleStore.get(auth.accountId);
    const schedule: AgentSchedule = {
      accountId: auth.accountId,
      cron: input.cron,
      timezone: input.timezone,
      morningHour: input.morningHour,
      enabled: input.enabled,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    scheduleStore.set(auth.accountId, schedule);
    return c.json({ data: schedule }, existing ? 200 : 201);
  },
);

// GET /v1/agent/schedule — Read the current schedule.
agent.get(
  "/schedule",
  requireScope("agent:read"),
  (c) => {
    const auth = c.get("auth");
    const schedule = scheduleStore.get(auth.accountId) ?? null;
    return c.json({ data: schedule });
  },
);

// DELETE /v1/agent/schedule — Disable / remove the schedule.
agent.delete(
  "/schedule",
  requireScope("agent:write"),
  (c) => {
    const auth = c.get("auth");
    scheduleStore.delete(auth.accountId);
    return c.json({ data: { disabled: true } });
  },
);

export { agent };
