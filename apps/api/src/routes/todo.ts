/**
 * Todo App Integrations Route (S8) — Thread → Action Items → Todo Apps
 *
 * Core endpoints:
 * POST   /v1/emails/:threadId/extract-tasks  — AI extracts action items from thread
 * POST   /v1/tasks/create                    — Create task in chosen provider
 * POST   /v1/tasks/create-batch              — Create multiple tasks at once
 * GET    /v1/tasks/providers                 — List configured providers
 * PUT    /v1/tasks/providers/:provider/config — Configure API keys for providers
 * GET    /v1/tasks                           — List tasks from built-in task list
 *
 * Legacy endpoints (existing):
 * GET    /v1/todo/providers              — List supported providers
 * POST   /v1/todo/connect                — Connect a provider with credentials
 * GET    /v1/todo/connected              — List connected providers
 * DELETE /v1/todo/connected/:provider    — Disconnect a provider
 * POST   /v1/todo/create                 — Create a task on a chosen provider
 * POST   /v1/todo/from-email             — AI-extract an action item from an email and create a task
 * POST   /v1/todo/from-commitment        — Convert an inbox commitment into a task
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  buildProvider,
  connectTodoApp,
  disconnectTodoApp,
  extractActionItem,
  extractThreadActionItems,
  getConnectedTodoApp,
  listConnectedTodoApps,
  listProviders,
  actionItemToTaskInput,
  type ConnectedTodoApp,
  type TodoCredentials,
  type TodoProviderName,
  type TodoTaskInput,
  type ThreadForExtraction,
  type ExtractedTask,
} from "@emailed/ai-engine/todo";
import {
  getDatabase,
  tasks as tasksTable,
  taskProviderConfigs as configsTable,
} from "@emailed/db";
import type { TaskSource, ProviderCredentials } from "@emailed/db";
import { getCommitmentsForAccount } from "./inbox.js";

// ─── Schemas ──────────────────────────────────────────────────────────────

const ProviderNameSchema = z.enum([
  "things3",
  "apple_reminders",
  "todoist",
  "linear",
  "notion",
  "microsoft_todo",
]);

const TaskProviderNameSchema = z.enum([
  "builtin",
  "things3",
  "apple_reminders",
  "todoist",
  "linear",
  "notion",
  "microsoft_todo",
]);

const PrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

const TaskInputSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(10_000).optional(),
  dueDate: z.string().datetime().optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  priority: PrioritySchema.optional(),
  sourceEmailId: z.string().optional(),
  sourceEmailLink: z.string().url().optional(),
});

const ConnectSchema = z.object({
  provider: ProviderNameSchema,
  isDefault: z.boolean().default(false),
  credentials: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("api_key"), token: z.string().min(1) }),
    z.object({
      kind: z.literal("oauth"),
      accessToken: z.string().min(1),
      refreshToken: z.string().optional(),
      expiresAt: z.number().int().optional(),
    }),
    z.object({
      kind: z.literal("notion"),
      accessToken: z.string().min(1),
      databaseId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("microsoft"),
      accessToken: z.string().min(1),
      listId: z.string().min(1),
    }),
  ]),
});

const CreateTaskSchema = z.object({
  provider: ProviderNameSchema,
  task: TaskInputSchema,
});

const FromEmailSchema = z.object({
  provider: ProviderNameSchema,
  emailId: z.string().min(1),
  from: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  receivedAt: z.string().datetime().optional(),
  sourceEmailLink: z.string().url().optional(),
});

const FromCommitmentSchema = z.object({
  provider: ProviderNameSchema,
  commitmentId: z.string().min(1),
  sourceEmailLink: z.string().url().optional(),
});

// ─── New S8 schemas ─────────────────────────────────────────────────────

const ExtractTasksSchema = z.object({
  emails: z.array(z.object({
    emailId: z.string().min(1),
    from: z.string().min(1),
    subject: z.string(),
    body: z.string(),
    receivedAt: z.string().datetime().optional(),
  })).min(1).max(50),
});

const CreateTaskNewSchema = z.object({
  provider: TaskProviderNameSchema,
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  dueDate: z.string().datetime().optional(),
  assignee: z.string().max(200).optional(),
  priority: PrioritySchema.optional().default("normal"),
  tags: z.array(z.string().max(60)).max(20).optional(),
  source: z.object({
    threadId: z.string(),
    emailId: z.string(),
    emailSubject: z.string(),
    emailFrom: z.string(),
  }).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const CreateBatchSchema = z.object({
  provider: TaskProviderNameSchema,
  tasks: z.array(z.object({
    title: z.string().min(1).max(500),
    description: z.string().max(10_000).optional(),
    dueDate: z.string().datetime().optional(),
    assignee: z.string().max(200).optional(),
    priority: PrioritySchema.optional().default("normal"),
    tags: z.array(z.string().max(60)).max(20).optional(),
    source: z.object({
      threadId: z.string(),
      emailId: z.string(),
      emailSubject: z.string(),
      emailFrom: z.string(),
    }).optional(),
    confidence: z.number().min(0).max(1).optional(),
  })).min(1).max(25),
});

const ProviderConfigSchema = z.object({
  isDefault: z.boolean().optional(),
  credentials: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("none") }),
    z.object({ kind: z.literal("api_key"), token: z.string().min(1) }),
    z.object({
      kind: z.literal("oauth"),
      accessToken: z.string().min(1),
      refreshToken: z.string().optional(),
      expiresAt: z.number().int().optional(),
    }),
    z.object({
      kind: z.literal("notion"),
      accessToken: z.string().min(1),
      databaseId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("microsoft"),
      accessToken: z.string().min(1),
      listId: z.string().min(1),
    }),
  ]),
});

const TaskListQuerySchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  priority: PrioritySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function toTaskInput(raw: z.infer<typeof TaskInputSchema>): TodoTaskInput {
  const out: TodoTaskInput = {
    title: raw.title,
    ...(raw.notes !== undefined ? { notes: raw.notes } : {}),
    ...(raw.dueDate !== undefined ? { dueDate: new Date(raw.dueDate) } : {}),
    ...(raw.projectId !== undefined ? { projectId: raw.projectId } : {}),
    ...(raw.tags !== undefined ? { tags: raw.tags } : {}),
    ...(raw.priority !== undefined ? { priority: raw.priority } : {}),
    ...(raw.sourceEmailId !== undefined ? { sourceEmailId: raw.sourceEmailId } : {}),
    ...(raw.sourceEmailLink !== undefined ? { sourceEmailLink: raw.sourceEmailLink } : {}),
  };
  return out;
}

function ephemeralConnection(provider: TodoProviderName): ConnectedTodoApp {
  return {
    provider,
    credentials: { kind: "none" } satisfies TodoCredentials,
    isDefault: false,
    connectedAt: new Date(),
  };
}

function resolveConnection(
  accountId: string,
  provider: TodoProviderName,
): ConnectedTodoApp | { error: string } {
  if (provider === "things3" || provider === "apple_reminders") {
    return ephemeralConnection(provider);
  }
  const conn = getConnectedTodoApp(accountId, provider);
  if (conn === undefined) {
    return { error: `${provider}_not_connected` };
  }
  return conn;
}

function maskCredentials(c: TodoCredentials): TodoCredentials {
  switch (c.kind) {
    case "none":
      return c;
    case "api_key":
      return { kind: "api_key", token: maskString(c.token) };
    case "oauth":
      return {
        kind: "oauth",
        accessToken: maskString(c.accessToken),
        ...(c.refreshToken !== undefined ? { refreshToken: maskString(c.refreshToken) } : {}),
        ...(c.expiresAt !== undefined ? { expiresAt: c.expiresAt } : {}),
      };
    case "notion":
      return {
        kind: "notion",
        accessToken: maskString(c.accessToken),
        databaseId: c.databaseId,
      };
    case "microsoft":
      return {
        kind: "microsoft",
        accessToken: maskString(c.accessToken),
        listId: c.listId,
      };
  }
}

function maskString(s: string): string {
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function generateId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateConfigId(): string {
  return `tpc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function maskProviderCredentials(c: ProviderCredentials): ProviderCredentials {
  const masked: ProviderCredentials = { kind: c.kind };
  if (c.token !== undefined) masked.token = maskString(c.token);
  if (c.accessToken !== undefined) masked.accessToken = maskString(c.accessToken);
  if (c.refreshToken !== undefined) masked.refreshToken = maskString(c.refreshToken);
  if (c.expiresAt !== undefined) masked.expiresAt = c.expiresAt;
  if (c.databaseId !== undefined) masked.databaseId = c.databaseId;
  if (c.listId !== undefined) masked.listId = c.listId;
  if (c.teamId !== undefined) masked.teamId = c.teamId;
  return masked;
}

// ─── Router ───────────────────────────────────────────────────────────────

const todo = new Hono();

// ═══════════════════════════════════════════════════════════════════════════
// NEW S8 ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// ─── Email endpoints (mounted at /v1/emails via emailTasks) ──────────────

const emailTasks = new Hono();

// POST /v1/emails/:threadId/extract-tasks
emailTasks.post(
  "/:threadId/extract-tasks",
  requireScope("inbox:read"),
  validateBody(ExtractTasksSchema),
  async (c) => {
    const threadId = c.req.param("threadId");
    const input = getValidatedBody<z.infer<typeof ExtractTasksSchema>>(c);

    const thread: ThreadForExtraction = {
      threadId,
      emails: input.emails.map((e) => ({
        emailId: e.emailId,
        from: e.from,
        subject: e.subject,
        body: e.body,
        ...(e.receivedAt !== undefined ? { receivedAt: new Date(e.receivedAt) } : {}),
      })),
    };

    try {
      const result = await extractThreadActionItems(thread);
      return c.json({ data: result });
    } catch (err) {
      return c.json(
        {
          error: {
            type: "extraction_failed",
            message: err instanceof Error ? err.message : "Action item extraction failed",
            code: "extraction_failed",
          },
        },
        500,
      );
    }
  },
);

// ─── Task endpoints (mounted at /v1/tasks via taskRoutes) ────────────────

const taskRoutes = new Hono();

// POST /v1/tasks/create — create a single task in chosen provider
taskRoutes.post(
  "/create",
  requireScope("inbox:write"),
  validateBody(CreateTaskNewSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateTaskNewSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const taskId = generateId();
    const now = new Date();

    const source: TaskSource | undefined = input.source !== undefined
      ? {
          threadId: input.source.threadId,
          emailId: input.source.emailId,
          emailSubject: input.source.emailSubject,
          emailFrom: input.source.emailFrom,
          extractedAt: now.toISOString(),
        }
      : undefined;

    // If provider is "builtin", store in our DB only
    if (input.provider === "builtin") {
      await db.insert(tasksTable).values({
        id: taskId,
        accountId: auth.accountId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate !== undefined ? new Date(input.dueDate) : null,
        assignee: input.assignee ?? null,
        priority: input.priority,
        status: "pending",
        provider: "builtin",
        confidence: input.confidence ?? null,
        source: source ?? null,
        tags: input.tags ?? [],
        isManual: input.source === undefined,
      });

      return c.json({
        data: {
          taskId,
          provider: "builtin",
          success: true,
        },
      }, 201);
    }

    // External provider — also store a record in our DB for tracking
    const providerName = input.provider as TodoProviderName;
    const conn = resolveConnection(auth.accountId, providerName);
    if ("error" in conn) {
      return c.json(
        { error: { type: "not_connected", message: conn.error, code: "not_connected" } },
        409,
      );
    }

    try {
      const providerInstance = buildProvider(conn);
      const todoInput: TodoTaskInput = {
        title: input.title,
        ...(input.description !== undefined ? { notes: input.description } : {}),
        ...(input.dueDate !== undefined ? { dueDate: new Date(input.dueDate) } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      };
      const result = await providerInstance.createTask(todoInput);

      // Store in our DB for tracking regardless of external result
      await db.insert(tasksTable).values({
        id: taskId,
        accountId: auth.accountId,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate !== undefined ? new Date(input.dueDate) : null,
        assignee: input.assignee ?? null,
        priority: input.priority,
        status: "pending",
        provider: input.provider,
        externalTaskId: result.taskId ?? null,
        externalTaskUrl: result.taskUrl ?? null,
        confidence: input.confidence ?? null,
        source: source ?? null,
        tags: input.tags ?? [],
        isManual: input.source === undefined,
      });

      return c.json({
        data: {
          taskId,
          provider: input.provider,
          success: result.success,
          externalTaskId: result.taskId ?? null,
          externalTaskUrl: result.taskUrl ?? null,
          error: result.error ?? null,
        },
      }, result.success ? 201 : 502);
    } catch (err) {
      return c.json(
        {
          error: {
            type: "provider_error",
            message: err instanceof Error ? err.message : "provider_failed",
            code: "provider_failed",
          },
        },
        502,
      );
    }
  },
);

// POST /v1/tasks/create-batch — create multiple tasks at once
taskRoutes.post(
  "/create-batch",
  requireScope("inbox:write"),
  validateBody(CreateBatchSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateBatchSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const now = new Date();

    interface BatchResult {
      index: number;
      taskId: string;
      title: string;
      success: boolean;
      externalTaskId: string | null;
      externalTaskUrl: string | null;
      error: string | null;
    }

    const results: BatchResult[] = [];

    for (let i = 0; i < input.tasks.length; i++) {
      const task = input.tasks[i];
      if (task === undefined) continue;

      const taskId = generateId();
      const source: TaskSource | undefined = task.source !== undefined
        ? {
            threadId: task.source.threadId,
            emailId: task.source.emailId,
            emailSubject: task.source.emailSubject,
            emailFrom: task.source.emailFrom,
            extractedAt: now.toISOString(),
          }
        : undefined;

      if (input.provider === "builtin") {
        await db.insert(tasksTable).values({
          id: taskId,
          accountId: auth.accountId,
          title: task.title,
          description: task.description ?? null,
          dueDate: task.dueDate !== undefined ? new Date(task.dueDate) : null,
          assignee: task.assignee ?? null,
          priority: task.priority ?? "normal",
          status: "pending",
          provider: "builtin",
          confidence: task.confidence ?? null,
          source: source ?? null,
          tags: task.tags ?? [],
          isManual: task.source === undefined,
        });

        results.push({
          index: i,
          taskId,
          title: task.title,
          success: true,
          externalTaskId: null,
          externalTaskUrl: null,
          error: null,
        });
        continue;
      }

      // External provider
      const providerName = input.provider as TodoProviderName;
      const conn = resolveConnection(auth.accountId, providerName);
      if ("error" in conn) {
        results.push({
          index: i,
          taskId,
          title: task.title,
          success: false,
          externalTaskId: null,
          externalTaskUrl: null,
          error: conn.error,
        });
        continue;
      }

      try {
        const providerInstance = buildProvider(conn);
        const todoInput: TodoTaskInput = {
          title: task.title,
          ...(task.description !== undefined ? { notes: task.description } : {}),
          ...(task.dueDate !== undefined ? { dueDate: new Date(task.dueDate) } : {}),
          ...(task.tags !== undefined ? { tags: task.tags } : {}),
          ...(task.priority !== undefined ? { priority: task.priority } : {}),
        };
        const result = await providerInstance.createTask(todoInput);

        await db.insert(tasksTable).values({
          id: taskId,
          accountId: auth.accountId,
          title: task.title,
          description: task.description ?? null,
          dueDate: task.dueDate !== undefined ? new Date(task.dueDate) : null,
          assignee: task.assignee ?? null,
          priority: task.priority ?? "normal",
          status: "pending",
          provider: input.provider,
          externalTaskId: result.taskId ?? null,
          externalTaskUrl: result.taskUrl ?? null,
          confidence: task.confidence ?? null,
          source: source ?? null,
          tags: task.tags ?? [],
          isManual: task.source === undefined,
        });

        results.push({
          index: i,
          taskId,
          title: task.title,
          success: result.success,
          externalTaskId: result.taskId ?? null,
          externalTaskUrl: result.taskUrl ?? null,
          error: result.error ?? null,
        });
      } catch (err) {
        results.push({
          index: i,
          taskId,
          title: task.title,
          success: false,
          externalTaskId: null,
          externalTaskUrl: null,
          error: err instanceof Error ? err.message : "provider_failed",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    return c.json({
      data: {
        provider: input.provider,
        total: results.length,
        succeeded: successCount,
        failed: results.length - successCount,
        results,
      },
    }, successCount > 0 ? 201 : 502);
  },
);

// GET /v1/tasks/providers — list configured providers with connection status
taskRoutes.get("/providers", requireScope("inbox:read"), async (c) => {
  const auth = c.get("auth");
  const allProviders = listProviders();
  const connected = listConnectedTodoApps(auth.accountId);

  const providers = allProviders.map((meta) => {
    const conn = connected.find((c) => c.provider === meta.name);
    return {
      name: meta.name,
      displayName: meta.displayName,
      authType: meta.authType,
      description: meta.description,
      supportsProjects: meta.supportsProjects,
      connected: conn !== undefined,
      isDefault: conn?.isDefault ?? false,
    };
  });

  // Add the built-in provider at the top
  providers.unshift({
    name: "builtin" as TodoProviderName,
    displayName: "Vienna Tasks",
    authType: "api_key" as const,
    description: "Built-in task list — no configuration needed.",
    supportsProjects: false,
    connected: true,
    isDefault: !connected.some((c) => c.isDefault),
  });

  return c.json({ data: providers });
});

// PUT /v1/tasks/providers/:provider/config — configure provider API keys
taskRoutes.put(
  "/providers/:provider/config",
  requireScope("inbox:write"),
  validateBody(ProviderConfigSchema),
  async (c) => {
    const auth = c.get("auth");
    const providerParam = c.req.param("provider");
    const parsed = ProviderNameSchema.safeParse(providerParam);
    if (!parsed.success) {
      return c.json(
        { error: { type: "invalid_request", message: "Unknown provider", code: "unknown_provider" } },
        400,
      );
    }
    const provider = parsed.data;
    const input = getValidatedBody<z.infer<typeof ProviderConfigSchema>>(c);

    const creds = input.credentials as TodoCredentials;
    const validation = validateCredentialShape(provider, creds);
    if (validation !== null) {
      return c.json(
        { error: { type: "invalid_request", message: validation, code: "invalid_credentials" } },
        400,
      );
    }

    // Store in DB
    const db = getDatabase();
    const configId = generateConfigId();

    const credentialsForDb: ProviderCredentials = {
      kind: input.credentials.kind,
      ...("token" in input.credentials && input.credentials.token !== undefined
        ? { token: input.credentials.token }
        : {}),
      ...("accessToken" in input.credentials && input.credentials.accessToken !== undefined
        ? { accessToken: input.credentials.accessToken }
        : {}),
      ...("refreshToken" in input.credentials && "refreshToken" in input.credentials && input.credentials.refreshToken !== undefined
        ? { refreshToken: input.credentials.refreshToken }
        : {}),
      ...("expiresAt" in input.credentials && input.credentials.expiresAt !== undefined
        ? { expiresAt: input.credentials.expiresAt }
        : {}),
      ...("databaseId" in input.credentials && input.credentials.databaseId !== undefined
        ? { databaseId: input.credentials.databaseId }
        : {}),
      ...("listId" in input.credentials && input.credentials.listId !== undefined
        ? { listId: input.credentials.listId }
        : {}),
    };

    // Upsert: delete existing config for this account+provider, then insert
    await db
      .delete(configsTable)
      .where(
        and(
          eq(configsTable.accountId, auth.accountId),
          eq(configsTable.provider, provider),
        ),
      );

    await db.insert(configsTable).values({
      id: configId,
      accountId: auth.accountId,
      provider,
      isDefault: input.isDefault ?? false,
      credentials: credentialsForDb,
    });

    // Also sync to in-memory store for immediate use
    connectTodoApp(auth.accountId, {
      provider,
      credentials: creds,
      isDefault: input.isDefault ?? false,
    });

    return c.json({
      data: {
        provider,
        isDefault: input.isDefault ?? false,
        credentials: maskProviderCredentials(credentialsForDb),
        configuredAt: new Date().toISOString(),
      },
    });
  },
);

// GET /v1/tasks — list tasks from built-in task list
taskRoutes.get("/", requireScope("inbox:read"), async (c) => {
  const auth = c.get("auth");
  const query = c.req.query();

  const parsed = TaskListQuerySchema.safeParse(query);
  if (!parsed.success) {
    return c.json(
      { error: { type: "validation_error", message: "Invalid query parameters", code: "invalid_query" } },
      422,
    );
  }
  const params = parsed.data;
  const db = getDatabase();

  const conditions = [
    eq(tasksTable.accountId, auth.accountId),
    isNull(tasksTable.deletedAt),
  ];
  if (params.status !== undefined) {
    conditions.push(eq(tasksTable.status, params.status));
  }
  if (params.priority !== undefined) {
    conditions.push(eq(tasksTable.priority, params.priority));
  }

  const rows = await db
    .select()
    .from(tasksTable)
    .where(and(...conditions))
    .orderBy(desc(tasksTable.createdAt))
    .limit(params.limit)
    .offset(params.offset);

  const total = rows.length;

  const data = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate?.toISOString() ?? null,
    assignee: row.assignee,
    priority: row.priority,
    status: row.status,
    provider: row.provider,
    externalTaskId: row.externalTaskId,
    externalTaskUrl: row.externalTaskUrl,
    confidence: row.confidence,
    source: row.source,
    tags: row.tags,
    isManual: row.isManual,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  return c.json({
    data: {
      tasks: data,
      total,
      limit: params.limit,
      offset: params.offset,
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY ENDPOINTS (preserved from original todo.ts)
// ═══════════════════════════════════════════════════════════════════════════

// GET /v1/todo/providers
todo.get("/providers", requireScope("inbox:read"), (c) => {
  return c.json({ data: listProviders() });
});

// GET /v1/todo/connected
todo.get("/connected", requireScope("inbox:read"), (c) => {
  const auth = c.get("auth");
  const apps = listConnectedTodoApps(auth.accountId).map((a) => ({
    provider: a.provider,
    isDefault: a.isDefault,
    connectedAt: a.connectedAt,
    credentials: maskCredentials(a.credentials),
  }));
  return c.json({ data: apps });
});

// POST /v1/todo/connect
todo.post(
  "/connect",
  requireScope("inbox:write"),
  validateBody(ConnectSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof ConnectSchema>>(c);
    const auth = c.get("auth");
    const connectCreds = input.credentials as TodoCredentials;

    const validation = validateCredentialShape(input.provider, connectCreds);
    if (validation !== null) {
      return c.json(
        { error: { type: "invalid_request", message: validation, code: "invalid_credentials" } },
        400,
      );
    }

    const record = connectTodoApp(auth.accountId, {
      provider: input.provider,
      credentials: connectCreds,
      isDefault: input.isDefault,
    });
    return c.json(
      {
        data: {
          provider: record.provider,
          isDefault: record.isDefault,
          connectedAt: record.connectedAt,
          credentials: maskCredentials(record.credentials),
        },
      },
      201,
    );
  },
);

// DELETE /v1/todo/connected/:provider
todo.delete("/connected/:provider", requireScope("inbox:write"), (c) => {
  const auth = c.get("auth");
  const parsed = ProviderNameSchema.safeParse(c.req.param("provider"));
  if (!parsed.success) {
    return c.json(
      { error: { type: "invalid_request", message: "Unknown provider", code: "unknown_provider" } },
      400,
    );
  }
  const removed = disconnectTodoApp(auth.accountId, parsed.data);
  if (!removed) {
    return c.json(
      { error: { type: "not_found", message: "Provider not connected", code: "not_connected" } },
      404,
    );
  }
  return c.json({ data: { provider: parsed.data, disconnected: true } });
});

// POST /v1/todo/create
todo.post(
  "/create",
  requireScope("inbox:write"),
  validateBody(CreateTaskSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateTaskSchema>>(c);
    const auth = c.get("auth");

    const conn = resolveConnection(auth.accountId, input.provider);
    if ("error" in conn) {
      return c.json(
        { error: { type: "not_connected", message: conn.error, code: "not_connected" } },
        409,
      );
    }
    try {
      const provider = buildProvider(conn);
      const result = await provider.createTask(toTaskInput(input.task));
      return c.json({ data: result }, result.success ? 201 : 502);
    } catch (err) {
      return c.json(
        {
          error: {
            type: "provider_error",
            message: err instanceof Error ? err.message : "provider_failed",
            code: "provider_failed",
          },
        },
        502,
      );
    }
  },
);

// POST /v1/todo/from-email
todo.post(
  "/from-email",
  requireScope("inbox:write"),
  validateBody(FromEmailSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof FromEmailSchema>>(c);
    const auth = c.get("auth");

    const conn = resolveConnection(auth.accountId, input.provider);
    if ("error" in conn) {
      return c.json(
        { error: { type: "not_connected", message: conn.error, code: "not_connected" } },
        409,
      );
    }

    const item = await extractActionItem({
      emailId: input.emailId,
      from: input.from,
      subject: input.subject,
      body: input.body,
      ...(input.receivedAt !== undefined ? { receivedAt: new Date(input.receivedAt) } : {}),
    });

    const taskInput = actionItemToTaskInput(item, {
      emailId: input.emailId,
      ...(input.sourceEmailLink !== undefined ? { emailLink: input.sourceEmailLink } : {}),
    });

    try {
      const provider = buildProvider(conn);
      const result = await provider.createTask(taskInput);
      return c.json(
        { data: { extracted: item, result } },
        result.success ? 201 : 502,
      );
    } catch (err) {
      return c.json(
        {
          error: {
            type: "provider_error",
            message: err instanceof Error ? err.message : "provider_failed",
            code: "provider_failed",
          },
        },
        502,
      );
    }
  },
);

// POST /v1/todo/from-commitment
todo.post(
  "/from-commitment",
  requireScope("inbox:write"),
  validateBody(FromCommitmentSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof FromCommitmentSchema>>(c);
    const auth = c.get("auth");

    const commitments = await getCommitmentsForAccount(auth.accountId);
    const commitment = commitments.find((co) => co.id === input.commitmentId);
    if (commitment === undefined) {
      return c.json(
        { error: { type: "not_found", message: "Commitment not found", code: "commitment_not_found" } },
        404,
      );
    }

    const conn = resolveConnection(auth.accountId, input.provider);
    if ("error" in conn) {
      return c.json(
        { error: { type: "not_connected", message: conn.error, code: "not_connected" } },
        409,
      );
    }

    const taskInput: TodoTaskInput = {
      title: commitment.description.slice(0, 200),
      notes: `Commitment by ${commitment.actorName} (${commitment.actor})\n\n"${commitment.sourceQuote}"`,
      priority: commitment.status === "overdue" ? "urgent" : "normal",
      ...(commitment.deadline !== undefined ? { dueDate: commitment.deadline } : {}),
      sourceEmailId: commitment.sourceEmailId,
      ...(input.sourceEmailLink !== undefined ? { sourceEmailLink: input.sourceEmailLink } : {}),
    };

    try {
      const provider = buildProvider(conn);
      const result = await provider.createTask(taskInput);
      return c.json(
        { data: { commitmentId: commitment.id, result } },
        result.success ? 201 : 502,
      );
    } catch (err) {
      return c.json(
        {
          error: {
            type: "provider_error",
            message: err instanceof Error ? err.message : "provider_failed",
            code: "provider_failed",
          },
        },
        502,
      );
    }
  },
);

// ─── Credential shape validation ──────────────────────────────────────────

function validateCredentialShape(
  provider: TodoProviderName,
  creds: TodoCredentials,
): string | null {
  switch (provider) {
    case "things3":
    case "apple_reminders":
      if (creds.kind !== "none") return `${provider} requires credentials.kind = "none"`;
      return null;
    case "todoist":
      if (creds.kind !== "api_key") return "todoist requires credentials.kind = \"api_key\"";
      return null;
    case "linear":
      if (creds.kind !== "api_key") return "linear requires credentials.kind = \"api_key\" (token must be \"<apiKey>::<teamId>\")";
      if (!creds.token.includes("::")) return "linear token must be formatted as \"<apiKey>::<teamId>\"";
      return null;
    case "notion":
      if (creds.kind !== "notion") return "notion requires credentials.kind = \"notion\"";
      return null;
    case "microsoft_todo":
      if (creds.kind !== "microsoft") return "microsoft_todo requires credentials.kind = \"microsoft\"";
      return null;
  }
}

export { todo, emailTasks, taskRoutes };
