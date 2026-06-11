/**
 * Programs Route — Programmable Email
 *
 * Users write TypeScript snippets that run on every email. Apps Script,
 * but type-safe and sandboxed via QuickJS.
 *
 *   POST   /v1/programs            — Create
 *   GET    /v1/programs            — List
 *   GET    /v1/programs/:id        — Get one
 *   PUT    /v1/programs/:id        — Update
 *   DELETE /v1/programs/:id        — Delete
 *   POST   /v1/programs/:id/test   — Dry-run against a sample email
 *   GET    /v1/programs/:id/runs   — Recent execution history
 *   POST   /v1/programs/:id/toggle — Enable/disable
 *
 * Programs + run history are persisted in the `programs` / `program_runs`
 * tables (Drizzle) so they survive API restarts.
 *
 * @example A user program that auto-files Stripe receipts
 * ```ts
 * export default (email, actions) => {
 *   if (email.from.email.endsWith("@stripe.com") && email.subject.includes("receipt")) {
 *     actions.label("Receipts/Stripe");
 *     actions.archive();
 *   }
 * };
 * ```
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getDatabase,
  programs as programsTable,
  programRuns,
  type Program,
  type ProgramRun as ProgramRunRow,
  type ProgramRunAction,
} from "@alecrae/db";
import {
  runProgram,
  type ProgramEmail,
  type ProgramResult,
} from "../../../../services/ai-engine/src/programs/runtime.js";

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize a DB program row into the API response shape (ISO timestamps).
 * Exported for unit tests.
 */
export function serializeProgram(row: Program): {
  id: string;
  accountId: string;
  name: string;
  description: string;
  code: string;
  triggers: ("email.received" | "email.sent")[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  errorCount: number;
} {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    description: row.description,
    code: row.code,
    triggers: row.triggers,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    runCount: row.runCount,
    errorCount: row.errorCount,
  };
}

/** Serialize a DB run row into the API response shape. Exported for tests. */
export function serializeRun(row: ProgramRunRow): {
  id: string;
  programId: string;
  emailId: string | null;
  startedAt: string;
  durationMs: number;
  actions: ProgramRunAction[];
  logs: string[];
  error: string | null;
} {
  return {
    id: row.id,
    programId: row.programId,
    emailId: row.emailId,
    startedAt: row.startedAt.toISOString(),
    durationMs: row.durationMs,
    actions: row.actions,
    logs: row.logs,
    error: row.error,
  };
}

const RUN_HISTORY_LIMIT = 50;

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function findProgram(accountId: string, id: string): Promise<Program | undefined> {
  const db = getDatabase();
  const [row] = await db
    .select()
    .from(programsTable)
    .where(and(eq(programsTable.id, id), eq(programsTable.accountId, accountId)))
    .limit(1);
  return row;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const TriggerSchema = z.enum(["email.received", "email.sent"]);

const CreateProgramSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).default(""),
  code: z.string().min(1).max(64 * 1024),
  triggers: z.array(TriggerSchema).min(1).default(["email.received"]),
  enabled: z.boolean().default(true),
});

const UpdateProgramSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  code: z.string().min(1).max(64 * 1024).optional(),
  triggers: z.array(TriggerSchema).min(1).optional(),
  enabled: z.boolean().optional(),
});

const SampleAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable().default(null),
});

const SampleEmailSchema = z.object({
  id: z.string().default(() => generateId()),
  messageId: z.string().default(() => `<${generateId()}@alecrae.local>`),
  threadId: z.string().nullable().default(null),
  from: SampleAddressSchema,
  to: z.array(SampleAddressSchema).default([]),
  cc: z.array(SampleAddressSchema).default([]),
  bcc: z.array(SampleAddressSchema).default([]),
  replyTo: SampleAddressSchema.nullable().default(null),
  subject: z.string().default(""),
  body: z.string().default(""),
  bodyHtml: z.string().nullable().default(null),
  snippet: z.string().default(""),
  headers: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .default([]),
  labels: z.array(z.string()).default([]),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        contentType: z.string(),
        sizeBytes: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  isUnread: z.boolean().default(true),
  isStarred: z.boolean().default(false),
  isNewsletter: z.boolean().default(false),
  isTransactional: z.boolean().default(false),
  receivedAt: z.string().default(() => new Date().toISOString()),
  sizeBytes: z.number().int().nonnegative().default(0),
});

const TestProgramSchema = z.object({
  email: SampleEmailSchema,
  /** Optional override of the stored code (for live editor previews). */
  code: z.string().min(1).max(64 * 1024).optional(),
  timeoutMs: z.number().int().min(50).max(10_000).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const programs = new Hono();

// POST /v1/programs — create
programs.post(
  "/",
  requireScope("programs:write"),
  validateBody(CreateProgramSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateProgramSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();
    const row: Program = {
      id: generateId(),
      accountId: auth.accountId,
      name: input.name,
      description: input.description,
      code: input.code,
      triggers: input.triggers,
      enabled: input.enabled,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
      errorCount: 0,
    };

    await db.insert(programsTable).values(row);
    return c.json({ data: serializeProgram(row) }, 201);
  },
);

// GET /v1/programs — list
programs.get("/", requireScope("programs:read"), async (c) => {
  const auth = c.get("auth");
  const db = getDatabase();

  const rows = await db
    .select()
    .from(programsTable)
    .where(eq(programsTable.accountId, auth.accountId))
    .orderBy(desc(programsTable.createdAt));

  return c.json({ data: rows.map(serializeProgram) });
});

// GET /v1/programs/:id — single
programs.get("/:id", requireScope("programs:read"), async (c) => {
  const auth = c.get("auth");
  const program = await findProgram(auth.accountId, c.req.param("id"));
  if (!program) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }
  return c.json({ data: serializeProgram(program) });
});

// PUT /v1/programs/:id — update
programs.put(
  "/:id",
  requireScope("programs:write"),
  validateBody(UpdateProgramSchema),
  async (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof UpdateProgramSchema>>(c);
    const program = await findProgram(auth.accountId, c.req.param("id"));
    if (!program) {
      return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
    }

    const now = new Date();
    const db = getDatabase();

    await db
      .update(programsTable)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.triggers !== undefined ? { triggers: input.triggers } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        updatedAt: now,
      })
      .where(
        and(
          eq(programsTable.id, program.id),
          eq(programsTable.accountId, auth.accountId),
        ),
      );

    const updated: Program = {
      ...program,
      name: input.name ?? program.name,
      description: input.description ?? program.description,
      code: input.code ?? program.code,
      triggers: input.triggers ?? program.triggers,
      enabled: input.enabled ?? program.enabled,
      updatedAt: now,
    };

    return c.json({ data: serializeProgram(updated) });
  },
);

// DELETE /v1/programs/:id
programs.delete("/:id", requireScope("programs:write"), async (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const db = getDatabase();

  const [existing] = await db
    .select({ id: programsTable.id })
    .from(programsTable)
    .where(and(eq(programsTable.id, id), eq(programsTable.accountId, auth.accountId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }

  // program_runs rows cascade-delete with the program.
  await db
    .delete(programsTable)
    .where(and(eq(programsTable.id, id), eq(programsTable.accountId, auth.accountId)));

  return c.json({ data: { deleted: true, id } });
});

// POST /v1/programs/:id/test — dry-run with a sample email
programs.post(
  "/:id/test",
  requireScope("programs:write"),
  validateBody(TestProgramSchema),
  async (c) => {
    const auth = c.get("auth");
    const program = await findProgram(auth.accountId, c.req.param("id"));
    if (!program) {
      return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
    }

    const input = getValidatedBody<z.infer<typeof TestProgramSchema>>(c);
    const code = input.code ?? program.code;
    const sample = input.email as ProgramEmail;

    const result: ProgramResult = await runProgram(code, sample, {
      timeoutMs: input.timeoutMs ?? 5_000,
    });

    const runRow: ProgramRunRow = {
      id: generateId(),
      programId: program.id,
      emailId: sample.id,
      startedAt: new Date(),
      durationMs: result.durationMs,
      actions: [...result.actions] as ProgramRunAction[],
      logs: [...result.logs],
      error: result.error ?? null,
    };

    const db = getDatabase();
    await db.insert(programRuns).values(runRow);
    await db
      .update(programsTable)
      .set({
        runCount: sql`${programsTable.runCount} + 1`,
        ...(result.error ? { errorCount: sql`${programsTable.errorCount} + 1` } : {}),
      })
      .where(eq(programsTable.id, program.id));

    return c.json({
      data: {
        dryRun: true,
        result,
        run: serializeRun(runRow),
      },
    });
  },
);

// GET /v1/programs/:id/runs — recent runs
programs.get("/:id/runs", requireScope("programs:read"), async (c) => {
  const auth = c.get("auth");
  const program = await findProgram(auth.accountId, c.req.param("id"));
  if (!program) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, RUN_HISTORY_LIMIT);

  const db = getDatabase();
  const rows = await db
    .select()
    .from(programRuns)
    .where(eq(programRuns.programId, program.id))
    .orderBy(desc(programRuns.startedAt))
    .limit(limit);

  return c.json({ data: rows.map(serializeRun) });
});

// POST /v1/programs/:id/toggle — flip enabled
programs.post("/:id/toggle", requireScope("programs:write"), async (c) => {
  const auth = c.get("auth");
  const program = await findProgram(auth.accountId, c.req.param("id"));
  if (!program) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }

  const now = new Date();
  const db = getDatabase();
  await db
    .update(programsTable)
    .set({ enabled: !program.enabled, updatedAt: now })
    .where(eq(programsTable.id, program.id));

  return c.json({
    data: serializeProgram({ ...program, enabled: !program.enabled, updatedAt: now }),
  });
});

export { programs };
