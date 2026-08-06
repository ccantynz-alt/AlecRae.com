/**
 * Programmable Email Route (B1) — TypeScript Snippets
 *
 * Like Google Apps Script but better: type-safe TypeScript snippets
 * that run on every email with full sandboxing.
 *
 * POST   /v1/scripts            — Create a new script
 * GET    /v1/scripts            — List user's scripts
 * GET    /v1/scripts/:id        — Get script details + recent runs
 * PUT    /v1/scripts/:id        — Update script code/name/trigger
 * DELETE /v1/scripts/:id        — Delete script (soft-delete)
 * POST   /v1/scripts/:id/test   — Dry-run against a sample email
 * POST   /v1/scripts/:id/toggle — Enable/disable
 * GET    /v1/scripts/:id/runs   — Get execution history
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, emailScripts, scriptRuns } from "@alecrae/db";
import { SCRIPT_TEMPLATES } from "@alecrae/ai-engine/scripts/snippet-runner";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const TriggerEnum = z.enum(["on_receive", "on_send", "manual", "scheduled"]);

const CreateScriptSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  code: z.string().min(1).max(50_000),
  trigger: TriggerEnum.default("on_receive"),
  schedule: z
    .string()
    .max(100)
    .optional()
    .nullable(),
  isActive: z.boolean().default(true),
});

type CreateScriptInput = z.infer<typeof CreateScriptSchema>;

const UpdateScriptSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  code: z.string().min(1).max(50_000).optional(),
  trigger: TriggerEnum.optional(),
  schedule: z
    .string()
    .max(100)
    .optional()
    .nullable(),
});

type UpdateScriptInput = z.infer<typeof UpdateScriptSchema>;

const TestScriptSchema = z.object({
  /** Optional sample email to test against. If omitted, a default sample is used. */
  sampleEmail: z
    .object({
      id: z.string().optional(),
      from: z.object({ name: z.string().optional(), address: z.string() }),
      to: z.array(z.object({ name: z.string().optional(), address: z.string() })).optional(),
      cc: z.array(z.object({ name: z.string().optional(), address: z.string() })).optional(),
      subject: z.string(),
      body: z.string(),
      headers: z.record(z.string()).optional(),
      attachments: z
        .array(
          z.object({
            filename: z.string(),
            contentType: z.string(),
            size: z.number(),
          }),
        )
        .optional(),
      threadId: z.string().optional(),
      receivedAt: z.string().optional(),
    })
    .optional(),
});

// TestScriptSchema still validates the request; the inferred type is unused
// only while execution is disabled (see POST /:id/test), so it is not deleted.

const ListQuerySchema = z.object({
  trigger: TriggerEnum.optional(),
  active: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type ListQuery = z.infer<typeof ListQuerySchema>;

const RunsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

type RunsQuery = z.infer<typeof RunsQuerySchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ─── Route ────────────────────────────────────────────────────────────────────

const scripts = new Hono();

// ─── POST / — Create a new script ────────────────────────────────────────────

scripts.post(
  "/",
  requireScope("scripts:write"),
  validateBody(CreateScriptSchema),
  async (c) => {
    const auth = c.get("auth");
    const body = getValidatedBody<CreateScriptInput>(c);
    const db = getDatabase();

    // Validate: scheduled trigger requires a schedule string
    if (body.trigger === "scheduled" && !body.schedule) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "A schedule (cron expression) is required for scheduled triggers",
            code: "missing_schedule",
          },
        },
        422,
      );
    }

    const id = generateId("scr");
    const [created] = await db
      .insert(emailScripts)
      .values({
        id,
        accountId: auth.accountId,
        name: body.name,
        description: body.description ?? null,
        code: body.code,
        trigger: body.trigger,
        schedule: body.schedule ?? null,
        isActive: body.isActive,
      })
      .returning();

    return c.json({ data: created }, 201);
  },
);

// ─── GET / — List user's scripts ──────────────────────────────────────────────

scripts.get(
  "/",
  requireScope("scripts:read"),
  validateQuery(ListQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const query = getValidatedQuery<ListQuery>(c);
    const db = getDatabase();

    const conditions = [eq(emailScripts.accountId, auth.accountId)];

    if (query.trigger !== undefined) {
      conditions.push(eq(emailScripts.trigger, query.trigger));
    }
    if (query.active !== undefined) {
      conditions.push(eq(emailScripts.isActive, query.active));
    }

    const rows = await db
      .select()
      .from(emailScripts)
      .where(and(...conditions))
      .orderBy(desc(emailScripts.updatedAt))
      .limit(query.limit)
      .offset(query.offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailScripts)
      .where(and(...conditions));

    return c.json({
      data: rows,
      pagination: {
        total: countResult?.count ?? 0,
        limit: query.limit,
        offset: query.offset,
      },
    });
  },
);

// ─── GET /templates — Get available script templates ──────────────────────────

scripts.get("/templates", requireScope("scripts:read"), (c) => {
  return c.json({
    data: SCRIPT_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      trigger: t.trigger,
      category: t.category,
      code: t.code,
    })),
  });
});

// ─── GET /:id — Get script details + recent runs ─────────────────────────────

scripts.get("/:id", requireScope("scripts:read"), async (c) => {
  const auth = c.get("auth");
  const scriptId = c.req.param("id");
  const db = getDatabase();

  const [script] = await db
    .select()
    .from(emailScripts)
    .where(
      and(
        eq(emailScripts.id, scriptId),
        eq(emailScripts.accountId, auth.accountId),
      ),
    )
    .limit(1);

  if (!script) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Script not found",
          code: "script_not_found",
        },
      },
      404,
    );
  }

  // Fetch recent runs
  const recentRuns = await db
    .select()
    .from(scriptRuns)
    .where(eq(scriptRuns.scriptId, scriptId))
    .orderBy(desc(scriptRuns.createdAt))
    .limit(10);

  return c.json({
    data: {
      ...script,
      recentRuns,
    },
  });
});

// ─── PUT /:id — Update script ────────────────────────────────────────────────

scripts.put(
  "/:id",
  requireScope("scripts:write"),
  validateBody(UpdateScriptSchema),
  async (c) => {
    const auth = c.get("auth");
    const scriptId = c.req.param("id");
    const body = getValidatedBody<UpdateScriptInput>(c);
    const db = getDatabase();

    // Verify ownership
    const [existing] = await db
      .select()
      .from(emailScripts)
      .where(
        and(
          eq(emailScripts.id, scriptId),
          eq(emailScripts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Script not found",
            code: "script_not_found",
          },
        },
        404,
      );
    }

    // Validate: scheduled trigger requires a schedule string
    const newTrigger = body.trigger ?? existing.trigger;
    const newSchedule = body.schedule !== undefined ? body.schedule : existing.schedule;
    if (newTrigger === "scheduled" && !newSchedule) {
      return c.json(
        {
          error: {
            type: "validation_error",
            message: "A schedule (cron expression) is required for scheduled triggers",
            code: "missing_schedule",
          },
        },
        422,
      );
    }

    const setClause: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) setClause["name"] = body.name;
    if (body.description !== undefined) setClause["description"] = body.description;
    if (body.code !== undefined) setClause["code"] = body.code;
    if (body.trigger !== undefined) setClause["trigger"] = body.trigger;
    if (body.schedule !== undefined) setClause["schedule"] = body.schedule;

    await db
      .update(emailScripts)
      .set(setClause)
      .where(eq(emailScripts.id, scriptId));

    const [updated] = await db
      .select()
      .from(emailScripts)
      .where(eq(emailScripts.id, scriptId))
      .limit(1);

    return c.json({ data: updated });
  },
);

// ─── DELETE /:id — Delete script ──────────────────────────────────────────────

scripts.delete("/:id", requireScope("scripts:write"), async (c) => {
  const auth = c.get("auth");
  const scriptId = c.req.param("id");
  const db = getDatabase();

  const [existing] = await db
    .select()
    .from(emailScripts)
    .where(
      and(
        eq(emailScripts.id, scriptId),
        eq(emailScripts.accountId, auth.accountId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Script not found",
          code: "script_not_found",
        },
      },
      404,
    );
  }

  // Hard delete — runs cascade due to FK
  await db.delete(emailScripts).where(eq(emailScripts.id, scriptId));

  return c.json({ data: { deleted: true, id: scriptId } });
});

// ─── POST /:id/test — Dry-run against a sample email ─────────────────────────

scripts.post(
  "/:id/test",
  requireScope("scripts:write"),
  validateBody(TestScriptSchema),
  async (c) => {
    const auth = c.get("auth");
    const scriptId = c.req.param("id");
    // Body is still VALIDATED (the schema stays on the route, so a malformed
    // request is still a 422 and the contract is unchanged for when execution
    // returns) — it is simply not read while the endpoint refuses.
    const db = getDatabase();

    const [script] = await db
      .select()
      .from(emailScripts)
      .where(
        and(
          eq(emailScripts.id, scriptId),
          eq(emailScripts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!script) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Script not found",
            code: "script_not_found",
          },
        },
        404,
      );
    }

    // Deliberately disabled, AFTER the ownership check so a 404 still means
    // what it meant. The previous executor (`runSnippet`) ran user code with
    // `new Function(...)` in the API process behind a parameter-shadowing
    // "sandbox" that does not hold: any function literal reaches the real
    // Function constructor via `.constructor`, handing back process.env
    // (JWT_SECRET, DATABASE_URL, API keys) to any registered user — and a
    // synchronous infinite loop blocks the event loop for every tenant,
    // because a Promise.race timeout cannot interrupt synchronous code.
    // The real fix is porting this endpoint onto the QuickJS-WASM sandbox
    // that /v1/programs already uses (hard memory/time limits, no host
    // access) — a deliberate build, not a patch on an escape-prone boundary.
    return c.json(
      {
        error: {
          type: "not_implemented",
          message:
            "Script test runs are temporarily disabled while the execution " +
            "sandbox is rebuilt. Your script was not run and no result was " +
            "recorded.",
          code: "script_execution_unavailable",
        },
      },
      501,
    );
  },
);

// ─── POST /:id/toggle — Enable/disable ───────────────────────────────────────

scripts.post("/:id/toggle", requireScope("scripts:write"), async (c) => {
  const auth = c.get("auth");
  const scriptId = c.req.param("id");
  const db = getDatabase();

  const [existing] = await db
    .select()
    .from(emailScripts)
    .where(
      and(
        eq(emailScripts.id, scriptId),
        eq(emailScripts.accountId, auth.accountId),
      ),
    )
    .limit(1);

  if (!existing) {
    return c.json(
      {
        error: {
          type: "not_found",
          message: "Script not found",
          code: "script_not_found",
        },
      },
      404,
    );
  }

  const newActive = !existing.isActive;
  await db
    .update(emailScripts)
    .set({ isActive: newActive, updatedAt: new Date() })
    .where(eq(emailScripts.id, scriptId));

  return c.json({
    data: { id: scriptId, isActive: newActive },
  });
});

// ─── GET /:id/runs — Get execution history ───────────────────────────────────

scripts.get(
  "/:id/runs",
  requireScope("scripts:read"),
  validateQuery(RunsQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const scriptId = c.req.param("id");
    const query = getValidatedQuery<RunsQuery>(c);
    const db = getDatabase();

    // Verify ownership
    const [script] = await db
      .select({ id: emailScripts.id })
      .from(emailScripts)
      .where(
        and(
          eq(emailScripts.id, scriptId),
          eq(emailScripts.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!script) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Script not found",
            code: "script_not_found",
          },
        },
        404,
      );
    }

    const runs = await db
      .select()
      .from(scriptRuns)
      .where(eq(scriptRuns.scriptId, scriptId))
      .orderBy(desc(scriptRuns.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const [countResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scriptRuns)
      .where(eq(scriptRuns.scriptId, scriptId));

    return c.json({
      data: runs,
      pagination: {
        total: countResult?.count ?? 0,
        limit: query.limit,
        offset: query.offset,
      },
    });
  },
);

export { scripts };
