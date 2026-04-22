/**
 * Email Workflows & Automation Engine
 *
 * Automated email workflows with trigger conditions and action chains.
 * Supports manual, event-driven, and scheduled triggers with a library
 * of pre-built templates for common automation patterns.
 *
 * POST   /v1/workflows                       — Create workflow
 * GET    /v1/workflows                       — List workflows (cursor pagination)
 * GET    /v1/workflows/templates             — List workflow templates
 * GET    /v1/workflows/stats                 — Workflow stats overview
 * GET    /v1/workflows/:id                   — Get workflow with recent run stats
 * PUT    /v1/workflows/:id                   — Update workflow
 * DELETE /v1/workflows/:id                   — Delete workflow
 * POST   /v1/workflows/:id/toggle            — Toggle active/inactive
 * POST   /v1/workflows/:id/run               — Manually trigger workflow
 * GET    /v1/workflows/:id/runs              — List runs for workflow (cursor pagination)
 * POST   /v1/workflows/:id/duplicate         — Duplicate a workflow
 * POST   /v1/workflows/from-template/:templateId — Create workflow from template
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, workflows, workflowRuns, workflowTemplates } from "@alecrae/db";
import type { WorkflowTrigger, WorkflowAction } from "@alecrae/db";

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const TriggerConditionsSchema = z.object({
  from: z.string().optional(),
  subject: z.string().optional(),
  labels: z.array(z.string()).optional(),
  hasAttachment: z.boolean().optional(),
});

const TriggerSchema = z.object({
  type: z.enum(["email_received", "email_sent", "schedule", "manual"]),
  conditions: TriggerConditionsSchema,
});

const ActionSchema = z.object({
  type: z.enum([
    "reply",
    "forward",
    "label",
    "archive",
    "move",
    "notify",
    "webhook",
    "ai_classify",
  ]),
  config: z.record(z.unknown()),
});

const CreateWorkflowSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  trigger: TriggerSchema,
  actions: z.array(ActionSchema).min(1).max(20),
  isActive: z.boolean().default(true),
});

type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;

const UpdateWorkflowSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional().nullable(),
  trigger: TriggerSchema.optional(),
  actions: z.array(ActionSchema).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

type UpdateWorkflowInput = z.infer<typeof UpdateWorkflowSchema>;

const RunWorkflowSchema = z.object({
  emailId: z.string().optional(),
});

type RunWorkflowInput = z.infer<typeof RunWorkflowSchema>;

const ListWorkflowsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  active: z.coerce.boolean().optional(),
});

type ListWorkflowsQueryInput = z.infer<typeof ListWorkflowsQuery>;

const ListRunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  status: z.enum(["success", "failed", "skipped"]).optional(),
});

type ListRunsQueryInput = z.infer<typeof ListRunsQuery>;

const ListTemplatesQuery = z.object({
  category: z
    .enum(["productivity", "communication", "organization", "security"])
    .optional(),
});

type ListTemplatesQueryInput = z.infer<typeof ListTemplatesQuery>;

const CreateFromTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

type CreateFromTemplateInput = z.infer<typeof CreateFromTemplateSchema>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Route ───────────────────────────────────────────────────────────────────

const workflowsRouter = new Hono();

// ─── POST / — Create workflow ────────────────────────────────────────────────

workflowsRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateWorkflowSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<CreateWorkflowInput>(c);
    const db = getDatabase();

    const id = generateId("wf");
    const now = new Date();

    const [created] = await db
      .insert(workflows)
      .values({
        id,
        accountId: auth.accountId,
        name: body.name,
        description: body.description ?? null,
        trigger: body.trigger as WorkflowTrigger,
        actions: body.actions as WorkflowAction[],
        isActive: body.isActive,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ data: created }, 201);
  },
);

// ─── GET / — List workflows (cursor pagination) ─────────────────────────────

workflowsRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListWorkflowsQuery),
  async (c) => {
    const auth = c.get("auth");
    const query = getValidatedQuery<ListWorkflowsQueryInput>(c);
    const db = getDatabase();

    const conditions = [eq(workflows.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(workflows.createdAt, new Date(query.cursor)));
    }

    if (query.active !== undefined) {
      conditions.push(eq(workflows.isActive, query.active));
    }

    const rows = await db
      .select()
      .from(workflows)
      .where(and(...conditions))
      .orderBy(desc(workflows.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page,
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── GET /templates — List workflow templates ────────────────────────────────

workflowsRouter.get(
  "/templates",
  requireScope("messages:read"),
  validateQuery(ListTemplatesQuery),
  async (c) => {
    const query = getValidatedQuery<ListTemplatesQueryInput>(c);
    const db = getDatabase();

    const conditions = [];

    if (query.category) {
      conditions.push(eq(workflowTemplates.category, query.category));
    }

    const rows = await db
      .select()
      .from(workflowTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(workflowTemplates.createdAt));

    return c.json({ data: rows });
  },
);

// ─── GET /stats — Workflow stats overview ────────────────────────────────────

workflowsRouter.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    // Total workflows
    const [workflowCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflows)
      .where(eq(workflows.accountId, auth.accountId));

    // Active workflows
    const [activeCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflows)
      .where(
        and(
          eq(workflows.accountId, auth.accountId),
          eq(workflows.isActive, true),
        ),
      );

    // Total runs across all user workflows
    const [runStats] = await db
      .select({
        totalRuns: sql<number>`count(*)::int`,
        successCount: sql<number>`count(*) filter (where ${workflowRuns.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${workflowRuns.status} = 'failed')::int`,
        skippedCount: sql<number>`count(*) filter (where ${workflowRuns.status} = 'skipped')::int`,
      })
      .from(workflowRuns)
      .innerJoin(workflows, eq(workflowRuns.workflowId, workflows.id))
      .where(eq(workflows.accountId, auth.accountId));

    // Most active workflows (top 5 by run count)
    const mostActive = await db
      .select({
        id: workflows.id,
        name: workflows.name,
        runCount: workflows.runCount,
        lastRunAt: workflows.lastRunAt,
      })
      .from(workflows)
      .where(eq(workflows.accountId, auth.accountId))
      .orderBy(desc(workflows.runCount))
      .limit(5);

    const totalRuns = runStats?.totalRuns ?? 0;
    const successCount = runStats?.successCount ?? 0;

    return c.json({
      data: {
        totalWorkflows: workflowCount?.count ?? 0,
        activeWorkflows: activeCount?.count ?? 0,
        totalRuns,
        successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 10000) / 100 : 0,
        successCount,
        failedCount: runStats?.failedCount ?? 0,
        skippedCount: runStats?.skippedCount ?? 0,
        mostActiveWorkflows: mostActive,
      },
    });
  },
);

// ─── POST /from-template/:templateId — Create workflow from template ─────────

workflowsRouter.post(
  "/from-template/:templateId",
  requireScope("messages:write"),
  validateBody(CreateFromTemplateSchema),
  async (c) => {
    const auth = c.get("auth");
    const templateId = c.req.param("templateId");
    const body = getValidatedBody<CreateFromTemplateInput>(c);
    const db = getDatabase();

    // Fetch the template
    const [template] = await db
      .select()
      .from(workflowTemplates)
      .where(eq(workflowTemplates.id, templateId))
      .limit(1);

    if (!template) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow template not found",
            code: "template_not_found",
          },
        },
        404,
      );
    }

    const id = generateId("wf");
    const now = new Date();

    const [created] = await db
      .insert(workflows)
      .values({
        id,
        accountId: auth.accountId,
        name: body.name,
        description: body.description ?? template.description,
        trigger: template.trigger,
        actions: template.actions,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json(
      { data: { ...created, templateId: template.id } },
      201,
    );
  },
);

// ─── GET /:id — Get workflow with recent run stats ───────────────────────────

workflowsRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const db = getDatabase();

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!workflow) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    // Fetch recent runs
    const recentRuns = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(10);

    // Run stats summary
    const [runStats] = await db
      .select({
        totalRuns: sql<number>`count(*)::int`,
        successCount: sql<number>`count(*) filter (where ${workflowRuns.status} = 'success')::int`,
        failedCount: sql<number>`count(*) filter (where ${workflowRuns.status} = 'failed')::int`,
        avgDuration: sql<number>`coalesce(avg(${workflowRuns.duration})::int, 0)`,
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId));

    return c.json({
      data: {
        ...workflow,
        recentRuns,
        stats: {
          totalRuns: runStats?.totalRuns ?? 0,
          successCount: runStats?.successCount ?? 0,
          failedCount: runStats?.failedCount ?? 0,
          avgDurationMs: runStats?.avgDuration ?? 0,
        },
      },
    });
  },
);

// ─── PUT /:id — Update workflow ──────────────────────────────────────────────

workflowsRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateWorkflowSchema),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const body = getValidatedBody<UpdateWorkflowInput>(c);
    const db = getDatabase();

    // Verify ownership
    const [existing] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    const setClause: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) setClause["name"] = body.name;
    if (body.description !== undefined) setClause["description"] = body.description;
    if (body.trigger !== undefined) setClause["trigger"] = body.trigger;
    if (body.actions !== undefined) setClause["actions"] = body.actions;
    if (body.isActive !== undefined) setClause["isActive"] = body.isActive;

    await db
      .update(workflows)
      .set(setClause)
      .where(eq(workflows.id, workflowId));

    const [updated] = await db
      .select()
      .from(workflows)
      .where(eq(workflows.id, workflowId))
      .limit(1);

    return c.json({ data: updated });
  },
);

// ─── DELETE /:id — Delete workflow ───────────────────────────────────────────

workflowsRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    // Hard delete — runs cascade due to FK
    await db.delete(workflows).where(eq(workflows.id, workflowId));

    return c.json({ data: { deleted: true, id: workflowId } });
  },
);

// ─── POST /:id/toggle — Toggle active/inactive ──────────────────────────────

workflowsRouter.post(
  "/:id/toggle",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    const newActive = !existing.isActive;
    await db
      .update(workflows)
      .set({ isActive: newActive, updatedAt: new Date() })
      .where(eq(workflows.id, workflowId));

    return c.json({
      data: { id: workflowId, isActive: newActive },
    });
  },
);

// ─── POST /:id/run — Manually trigger workflow ──────────────────────────────

workflowsRouter.post(
  "/:id/run",
  requireScope("messages:write"),
  validateBody(RunWorkflowSchema),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const body = getValidatedBody<RunWorkflowInput>(c);
    const db = getDatabase();

    const [workflow] = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!workflow) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    // Execute workflow actions (simulated — real execution depends on action runners)
    const startTime = Date.now();
    const actions = workflow.actions as WorkflowAction[];
    let actionsExecuted = 0;
    let runError: string | null = null;

    try {
      for (const _action of actions) {
        // Each action type would have its own executor in production.
        // For now, we count each action as executed successfully.
        actionsExecuted++;
      }
    } catch (err) {
      runError =
        err instanceof Error ? err.message : "Unknown error during execution";
    }

    const duration = Date.now() - startTime;
    const status = runError ? "failed" : "success";

    // Record the run
    const runId = generateId("wfr");
    const [run] = await db
      .insert(workflowRuns)
      .values({
        id: runId,
        workflowId,
        emailId: body.emailId ?? null,
        status: status as "success" | "failed",
        actionsExecuted,
        error: runError,
        duration,
      })
      .returning();

    // Update workflow counters
    await db
      .update(workflows)
      .set({
        runCount: sql`${workflows.runCount} + 1`,
        lastRunAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, workflowId));

    return c.json({
      data: {
        run,
        actionsExecuted,
        totalActions: actions.length,
      },
    });
  },
);

// ─── GET /:id/runs — List runs for workflow (cursor pagination) ──────────────

workflowsRouter.get(
  "/:id/runs",
  requireScope("messages:read"),
  validateQuery(ListRunsQuery),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const query = getValidatedQuery<ListRunsQueryInput>(c);
    const db = getDatabase();

    // Verify ownership
    const [workflow] = await db
      .select({ id: workflows.id })
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!workflow) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    const conditions = [eq(workflowRuns.workflowId, workflowId)];

    if (query.cursor) {
      conditions.push(lt(workflowRuns.createdAt, new Date(query.cursor)));
    }

    if (query.status) {
      conditions.push(eq(workflowRuns.status, query.status));
    }

    const rows = await db
      .select()
      .from(workflowRuns)
      .where(and(...conditions))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page,
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ─── POST /:id/duplicate — Duplicate a workflow ─────────────────────────────

workflowsRouter.post(
  "/:id/duplicate",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const workflowId = c.req.param("id");
    const db = getDatabase();

    const [original] = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.id, workflowId),
          eq(workflows.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!original) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Workflow not found",
            code: "workflow_not_found",
          },
        },
        404,
      );
    }

    const id = generateId("wf");
    const now = new Date();

    const [duplicated] = await db
      .insert(workflows)
      .values({
        id,
        accountId: auth.accountId,
        name: `${original.name} (Copy)`,
        description: original.description,
        trigger: original.trigger,
        actions: original.actions,
        isActive: false, // Duplicates start inactive to prevent accidental execution
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ data: duplicated }, 201);
  },
);

export { workflowsRouter };
