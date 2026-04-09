/**
 * Todo App Integrations Route (S8)
 *
 * One-click sending of email threads / commitments / AI-extracted action items
 * to the user's todo app of choice. Supports Things 3, Apple Reminders, Todoist,
 * Linear, Notion, and Microsoft To Do.
 *
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
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  buildProvider,
  connectTodoApp,
  disconnectTodoApp,
  extractActionItem,
  getConnectedTodoApp,
  listConnectedTodoApps,
  listProviders,
  actionItemToTaskInput,
  type ConnectedTodoApp,
  type TodoCredentials,
  type TodoProviderName,
  type TodoTaskInput,
} from "@emailed/ai-engine/todo";
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

const PrioritySchema = z.enum(["low", "normal", "high", "urgent"]).optional();

const TaskInputSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(10_000).optional(),
  dueDate: z.string().datetime().optional(),
  projectId: z.string().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  priority: PrioritySchema,
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
  // For URL-scheme providers we don't need any stored credentials.
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

// ─── Router ───────────────────────────────────────────────────────────────

const todo = new Hono();

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

    // Validate that auth model matches what the provider needs.
    const validation = validateCredentialShape(input.provider, input.credentials);
    if (validation !== null) {
      return c.json(
        { error: { type: "invalid_request", message: validation, code: "invalid_credentials" } },
        400,
      );
    }

    const record = connectTodoApp(auth.accountId, {
      provider: input.provider,
      credentials: input.credentials,
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

export { todo };
