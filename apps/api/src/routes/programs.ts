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
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  runProgram,
  type ProgramAction,
  type ProgramEmail,
  type ProgramResult,
} from "../../../../services/ai-engine/src/programs/runtime.js";

// ─── Domain types ────────────────────────────────────────────────────────────

type ProgramTrigger = "email.received" | "email.sent";

interface Program {
  id: string;
  accountId: string;
  name: string;
  description: string;
  code: string;
  triggers: ProgramTrigger[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** Lifetime invocation counter. */
  runCount: number;
  /** Lifetime error counter. */
  errorCount: number;
}

interface ProgramRun {
  id: string;
  programId: string;
  emailId: string | null;
  startedAt: string;
  durationMs: number;
  actions: readonly ProgramAction[];
  logs: readonly string[];
  error: string | null;
}

// In-memory stores. Production: move to Postgres tables `programs` and
// `program_runs`. Mirrors the pattern used by `ai-rules.ts`.
const programStore = new Map<string, Program[]>();
const runStore = new Map<string, ProgramRun[]>();
const RUN_HISTORY_LIMIT = 50;

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function findProgram(accountId: string, id: string): Program | undefined {
  return (programStore.get(accountId) ?? []).find((p) => p.id === id);
}

function recordRun(programId: string, run: ProgramRun): void {
  const list = runStore.get(programId) ?? [];
  list.unshift(run);
  if (list.length > RUN_HISTORY_LIMIT) list.length = RUN_HISTORY_LIMIT;
  runStore.set(programId, list);
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
  (c) => {
    const input = getValidatedBody<z.infer<typeof CreateProgramSchema>>(c);
    const auth = c.get("auth");

    const now = new Date().toISOString();
    const program: Program = {
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

    const existing = programStore.get(auth.accountId) ?? [];
    programStore.set(auth.accountId, [...existing, program]);
    return c.json({ data: program }, 201);
  },
);

// GET /v1/programs — list
programs.get("/", requireScope("programs:read"), (c) => {
  const auth = c.get("auth");
  const list = programStore.get(auth.accountId) ?? [];
  return c.json({ data: list });
});

// GET /v1/programs/:id — single
programs.get("/:id", requireScope("programs:read"), (c) => {
  const auth = c.get("auth");
  const program = findProgram(auth.accountId, c.req.param("id"));
  if (!program) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }
  return c.json({ data: program });
});

// PUT /v1/programs/:id — update
programs.put(
  "/:id",
  requireScope("programs:write"),
  validateBody(UpdateProgramSchema),
  (c) => {
    const auth = c.get("auth");
    const input = getValidatedBody<z.infer<typeof UpdateProgramSchema>>(c);
    const program = findProgram(auth.accountId, c.req.param("id"));
    if (!program) {
      return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
    }

    if (input.name !== undefined) program.name = input.name;
    if (input.description !== undefined) program.description = input.description;
    if (input.code !== undefined) program.code = input.code;
    if (input.triggers !== undefined) program.triggers = input.triggers;
    if (input.enabled !== undefined) program.enabled = input.enabled;
    program.updatedAt = new Date().toISOString();

    return c.json({ data: program });
  },
);

// DELETE /v1/programs/:id
programs.delete("/:id", requireScope("programs:write"), (c) => {
  const auth = c.get("auth");
  const id = c.req.param("id");
  const list = programStore.get(auth.accountId) ?? [];
  const filtered = list.filter((p) => p.id !== id);
  if (filtered.length === list.length) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }
  programStore.set(auth.accountId, filtered);
  runStore.delete(id);
  return c.json({ data: { deleted: true, id } });
});

// POST /v1/programs/:id/test — dry-run with a sample email
programs.post(
  "/:id/test",
  requireScope("programs:write"),
  validateBody(TestProgramSchema),
  async (c) => {
    const auth = c.get("auth");
    const program = findProgram(auth.accountId, c.req.param("id"));
    if (!program) {
      return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
    }

    const input = getValidatedBody<z.infer<typeof TestProgramSchema>>(c);
    const code = input.code ?? program.code;
    const sample = input.email as ProgramEmail;

    const result: ProgramResult = await runProgram(code, sample, {
      timeoutMs: input.timeoutMs ?? 5_000,
    });

    const run: ProgramRun = {
      id: generateId(),
      programId: program.id,
      emailId: sample.id,
      startedAt: new Date().toISOString(),
      durationMs: result.durationMs,
      actions: result.actions,
      logs: result.logs,
      error: result.error ?? null,
    };
    recordRun(program.id, run);
    program.runCount += 1;
    if (result.error) program.errorCount += 1;

    return c.json({
      data: {
        dryRun: true,
        result,
        run,
      },
    });
  },
);

// GET /v1/programs/:id/runs — recent runs
programs.get("/:id/runs", requireScope("programs:read"), (c) => {
  const auth = c.get("auth");
  const program = findProgram(auth.accountId, c.req.param("id"));
  if (!program) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }
  const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, RUN_HISTORY_LIMIT);
  const runs = (runStore.get(program.id) ?? []).slice(0, limit);
  return c.json({ data: runs });
});

// POST /v1/programs/:id/toggle — flip enabled
programs.post("/:id/toggle", requireScope("programs:write"), (c) => {
  const auth = c.get("auth");
  const program = findProgram(auth.accountId, c.req.param("id"));
  if (!program) {
    return c.json({ error: { message: "Program not found", code: "not_found" } }, 404);
  }
  program.enabled = !program.enabled;
  program.updatedAt = new Date().toISOString();
  return c.json({ data: program });
});

export { programs };
