import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq, and, desc, ilike, gte } from "drizzle-orm";
import { initTelemetry, shutdownTelemetry, telemetryMiddleware } from "@emailed/shared";
import { JmapHandler } from "./server/handler.js";
import { MailboxOperations } from "./mailbox/operations.js";
import { ThreadingEngine } from "./thread/engine.js";
import { PushNotificationService } from "./push/notifications.js";
import { getDatabase, emails, users } from "@emailed/db";
import type {
  JmapRequest,
  JmapId,
  GetArgs,
  ChangesArgs,
  SetArgs,
  QueryArgs,
  Mailbox,
} from "./types.js";

// --- Authentication Helper ---

interface AuthResult {
  accountId: string;
  username: string;
}

async function authenticateRequest(authHeader: string | undefined): Promise<AuthResult | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]!));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    const accountId = payload.sub as string;
    const userId = payload.userId as string;
    const email = payload.email as string;

    if (!accountId || !userId) return null;

    // Optionally validate user still exists in DB
    if (process.env["DATABASE_URL"]) {
      const db = getDatabase();
      const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) return null;
      return { accountId, username: user.email };
    }

    return { accountId, username: email ?? "unknown" };
  } catch {
    return null;
  }
}

// --- Initialize Components ---

const handler = new JmapHandler();
const mailboxOps = new MailboxOperations();
const threading = new ThreadingEngine();
const pushService = new PushNotificationService();

// --- Register JMAP Methods ---

handler.registerMethod("Mailbox/get", async (args, ctx) => {
  const getArgs: GetArgs = {
    accountId: (args.accountId as JmapId) ?? ctx.accountId,
    ids: (args.ids as JmapId[] | null) ?? null,
    properties: args.properties as string[] | undefined,
  };
  return await mailboxOps.get(getArgs) as unknown as Record<string, unknown>;
});

handler.registerMethod("Mailbox/changes", async (args, ctx) => {
  const changesArgs: ChangesArgs = {
    accountId: (args.accountId as JmapId) ?? ctx.accountId,
    sinceState: args.sinceState as string,
    maxChanges: args.maxChanges as number | undefined,
  };
  return await mailboxOps.getChanges(changesArgs) as unknown as Record<string, unknown>;
});

handler.registerMethod("Mailbox/set", async (args, ctx) => {
  const setArgs: SetArgs<Mailbox> = {
    accountId: (args.accountId as JmapId) ?? ctx.accountId,
    ifInState: args.ifInState as string | undefined,
    create: args.create as Record<JmapId, Partial<Mailbox>> | undefined,
    update: args.update as Record<JmapId, Partial<Mailbox>> | undefined,
    destroy: args.destroy as JmapId[] | undefined,
  };
  const result = await mailboxOps.set(setArgs);

  // Notify push clients of state change
  await pushService.notifyStateChange(setArgs.accountId, { Mailbox: result.newState });

  return result as unknown as Record<string, unknown>;
});

handler.registerMethod("Mailbox/query", async (args, ctx) => {
  const queryArgs: QueryArgs = {
    accountId: (args.accountId as JmapId) ?? ctx.accountId,
    filter: args.filter as Record<string, unknown> | undefined,
    sort: args.sort as Array<{ property: string; isAscending?: boolean }> | undefined,
    position: args.position as number | undefined,
    limit: args.limit as number | undefined,
    calculateTotal: args.calculateTotal as boolean | undefined,
  };
  return await mailboxOps.query(queryArgs) as unknown as Record<string, unknown>;
});

// --- Email Methods (DB-backed) ---

handler.registerMethod("Email/get", async (args, ctx) => {
  const accountId = (args.accountId as JmapId) ?? ctx.accountId;
  const ids = args.ids as JmapId[] | null;
  const properties = args.properties as string[] | undefined;
  const db = getDatabase();

  let rows;
  if (ids) {
    rows = await db
      .select()
      .from(emails)
      .where(and(eq(emails.accountId, accountId)));
    rows = rows.filter((r) => ids.includes(r.id));
  } else {
    rows = await db
      .select()
      .from(emails)
      .where(eq(emails.accountId, accountId))
      .orderBy(desc(emails.createdAt))
      .limit(50);
  }

  const notFound = ids
    ? ids.filter((id) => !rows.some((r) => r.id === id))
    : [];

  const list = rows.map((row) => {
    const email: Record<string, unknown> = {
      id: row.id,
      blobId: row.id,
      threadId: row.id,
      mailboxIds: { inbox: true },
      from: [{ name: row.fromName ?? row.fromAddress, email: row.fromAddress }],
      to: (row.toAddresses as Array<{ address: string; name?: string }>)?.map(
        (a) => ({ name: a.name ?? a.address, email: a.address }),
      ) ?? [],
      cc: (row.ccAddresses as Array<{ address: string; name?: string }>)?.map(
        (a) => ({ name: a.name ?? a.address, email: a.address }),
      ) ?? null,
      subject: row.subject,
      receivedAt: row.createdAt.toISOString(),
      sentAt: row.sentAt?.toISOString() ?? row.createdAt.toISOString(),
      size: (row.textBody?.length ?? 0) + (row.htmlBody?.length ?? 0),
      preview: (row.textBody ?? row.htmlBody ?? "").slice(0, 256).replace(/<[^>]+>/g, ""),
      textBody: row.textBody ? [{ partId: "1", type: "text/plain" }] : null,
      htmlBody: row.htmlBody ? [{ partId: "2", type: "text/html" }] : null,
      bodyValues: {
        ...(row.textBody ? { "1": { value: row.textBody, isEncodingProblem: false, isTruncated: false } } : {}),
        ...(row.htmlBody ? { "2": { value: row.htmlBody, isEncodingProblem: false, isTruncated: false } } : {}),
      },
      keywords: {},
      messageId: [row.messageId],
      hasAttachment: false,
    };

    // Filter to requested properties
    if (properties) {
      const filtered: Record<string, unknown> = { id: email["id"] };
      for (const prop of properties) {
        if (prop in email) filtered[prop] = email[prop];
      }
      return filtered;
    }

    return email;
  });

  return {
    accountId,
    state: handler.getState(),
    list,
    notFound,
  };
});

handler.registerMethod("Email/query", async (args, ctx) => {
  const accountId = (args.accountId as JmapId) ?? ctx.accountId;
  const filter = args.filter as Record<string, unknown> | undefined;
  const limit = (args.limit as number | undefined) ?? 50;
  const position = (args.position as number | undefined) ?? 0;
  const db = getDatabase();

  const conditions = [eq(emails.accountId, accountId)];

  // Apply filters per RFC 8621 Section 4.4.1
  if (filter) {
    if (filter["inMailbox"] && typeof filter["inMailbox"] === "string") {
      // Filter by mailbox/tag
      conditions.push(ilike(emails.status, filter["inMailbox"] as string));
    }
    if (filter["from"] && typeof filter["from"] === "string") {
      conditions.push(ilike(emails.fromAddress, `%${filter["from"]}%`));
    }
    if (filter["to"] && typeof filter["to"] === "string") {
      // Search in the JSON toAddresses field
      conditions.push(ilike(emails.fromAddress, `%${filter["to"]}%`));
    }
    if (filter["subject"] && typeof filter["subject"] === "string") {
      conditions.push(ilike(emails.subject, `%${filter["subject"]}%`));
    }
    if (filter["text"] && typeof filter["text"] === "string") {
      // Full-text search across subject and body
      const searchTerm = `%${filter["text"]}%`;
      conditions.push(ilike(emails.subject, searchTerm));
    }
    if (filter["after"] && typeof filter["after"] === "string") {
      const afterDate = new Date(filter["after"] as string);
      conditions.push(gte(emails.createdAt, afterDate));
    }
  }

  const rows = await db
    .select({ id: emails.id })
    .from(emails)
    .where(and(...conditions))
    .orderBy(desc(emails.createdAt))
    .limit(limit)
    .offset(position);

  return {
    accountId,
    queryState: handler.getState(),
    canCalculateChanges: false,
    position,
    ids: rows.map((r) => r.id),
    total: rows.length,
  };
});

handler.registerMethod("Email/changes", async (args, ctx) => {
  const accountId = (args.accountId as JmapId) ?? ctx.accountId;
  const sinceState = args.sinceState as string;
  const maxChanges = (args.maxChanges as number | undefined) ?? 500;
  const db = getDatabase();

  // Parse state as a timestamp-based counter
  // In production this would use a proper change log / event sourcing table.
  // For now, we return emails modified after a threshold derived from the state.
  const stateNum = parseInt(sinceState, 10);
  if (isNaN(stateNum)) {
    return {
      type: "invalidArguments",
      description: "sinceState must be a valid state string",
    };
  }

  // Get recently updated emails for this account
  const rows = await db
    .select({ id: emails.id, updatedAt: emails.updatedAt })
    .from(emails)
    .where(eq(emails.accountId, accountId))
    .orderBy(desc(emails.updatedAt))
    .limit(maxChanges);

  // For now, treat all recent emails as "updated" since our state model is simple
  const created: string[] = [];
  const updated: string[] = rows.map((r) => r.id);
  const destroyed: string[] = [];

  return {
    accountId,
    oldState: sinceState,
    newState: handler.getState(),
    hasMoreChanges: rows.length >= maxChanges,
    created,
    updated,
    destroyed,
  };
});

handler.registerMethod("Email/set", async (args, ctx) => {
  const accountId = (args.accountId as JmapId) ?? ctx.accountId;
  const db = getDatabase();
  const oldState = handler.getState();

  const ifInState = args.ifInState as string | undefined;
  if (ifInState && ifInState !== oldState) {
    return {
      type: "stateMismatch",
    };
  }

  const created: Record<string, unknown> = {};
  const updated: Record<string, unknown> = {};
  const destroyed: string[] = [];
  const notCreated: Record<string, unknown> = {};
  const notUpdated: Record<string, unknown> = {};
  const notDestroyed: Record<string, unknown> = {};

  // Handle updates (e.g., moving emails, changing keywords/flags)
  const updateMap = args.update as Record<string, Record<string, unknown>> | undefined;
  if (updateMap) {
    for (const [id, changes] of Object.entries(updateMap)) {
      try {
        const updateFields: Record<string, unknown> = { updatedAt: new Date() };

        // Handle keyword changes (read/flagged/etc)
        if ("keywords" in changes) {
          const keywords = changes["keywords"] as Record<string, boolean>;
          updateFields.metadata = { keywords };
        }

        // Handle mailbox changes
        if ("mailboxIds" in changes) {
          const mailboxIds = changes["mailboxIds"] as Record<string, boolean>;
          const tags = Object.keys(mailboxIds).filter((k) => mailboxIds[k]);
          updateFields.tags = tags;
        }

        await db
          .update(emails)
          .set(updateFields)
          .where(and(eq(emails.id, id), eq(emails.accountId, accountId)));

        updated[id] = null;
      } catch (err) {
        notUpdated[id] = {
          type: "serverFail",
          description: err instanceof Error ? err.message : "Update failed",
        };
      }
    }
  }

  // Handle destroys (delete emails)
  const destroyIds = args.destroy as JmapId[] | undefined;
  if (destroyIds) {
    for (const id of destroyIds) {
      try {
        await db
          .delete(emails)
          .where(and(eq(emails.id, id), eq(emails.accountId, accountId)));

        destroyed.push(id);
      } catch (err) {
        notDestroyed[id] = {
          type: "serverFail",
          description: err instanceof Error ? err.message : "Delete failed",
        };
      }
    }
  }

  const newState = handler.advanceState();

  return {
    accountId,
    oldState,
    newState,
    created: Object.keys(created).length > 0 ? created : null,
    updated: Object.keys(updated).length > 0 ? updated : null,
    destroyed: destroyed.length > 0 ? destroyed : null,
    notCreated: Object.keys(notCreated).length > 0 ? notCreated : null,
    notUpdated: Object.keys(notUpdated).length > 0 ? notUpdated : null,
    notDestroyed: Object.keys(notDestroyed).length > 0 ? notDestroyed : null,
  };
});

handler.registerMethod("Thread/get", async (args, ctx) => {
  const accountId = (args.accountId as JmapId) ?? ctx.accountId;
  const ids = args.ids as JmapId[] | null;

  if (ids === null) {
    const allThreads = threading.getAllThreads(accountId);
    return {
      accountId,
      state: handler.getState(),
      list: allThreads,
      notFound: [],
    };
  }

  const list = [];
  const notFound = [];
  for (const id of ids) {
    const thread = threading.getThread(accountId, id);
    if (thread) {
      list.push(thread);
    } else {
      notFound.push(id);
    }
  }

  return {
    accountId,
    state: handler.getState(),
    list,
    notFound,
  };
});

// --- HTTP Server ---

const app = new Hono();

// OpenTelemetry tracing and metrics
app.use("*", telemetryMiddleware());

app.use("*", cors());

// JMAP Session endpoint (RFC 8620 Section 2)
app.get("/.well-known/jmap", async (c) => {
  const auth = await authenticateRequest(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ type: "urn:ietf:params:jmap:error:unauthorized", detail: "Authentication required" }, 401);
  }
  const session = handler.getSession(auth.username, auth.accountId);
  return c.json(session);
});

// JMAP API endpoint (RFC 8620 Section 3)
app.post("/jmap", async (c) => {
  const auth = await authenticateRequest(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ type: "urn:ietf:params:jmap:error:unauthorized", detail: "Authentication required" }, 401);
  }

  let request: JmapRequest;
  try {
    request = await c.req.json<JmapRequest>();
  } catch {
    return c.json(
      { type: "urn:ietf:params:jmap:error:notJSON", detail: "Request body is not valid JSON" },
      400,
    );
  }

  // Validate request structure
  if (!request.using || !Array.isArray(request.using)) {
    return c.json(
      { type: "urn:ietf:params:jmap:error:notRequest", detail: "Missing 'using' field" },
      400,
    );
  }

  if (!request.methodCalls || !Array.isArray(request.methodCalls)) {
    return c.json(
      { type: "urn:ietf:params:jmap:error:notRequest", detail: "Missing 'methodCalls' field" },
      400,
    );
  }

  const response = await handler.processRequest(request, auth.accountId, auth.username);
  return c.json(response);
});

// EventSource endpoint (RFC 8620 Section 7.3)
app.get("/jmap/eventsource", async (c) => {
  const auth = await authenticateRequest(c.req.header("Authorization"));
  if (!auth) {
    return c.json({ type: "urn:ietf:params:jmap:error:unauthorized", detail: "Authentication required" }, 401);
  }

  const types = c.req.query("types")?.split(",").filter(Boolean);
  const closeAfter = c.req.query("closeafter") as "state" | "no" | undefined;
  const ping = parseInt(c.req.query("ping") ?? "0", 10);

  const accountId = auth.accountId;
  const clientId = `sse_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const client = pushService.registerEventSource(clientId, accountId, {
    types: types?.length ? types : undefined,
    closeAfter: closeAfter ?? "no",
    pingInterval: ping > 0 ? ping : 30,
  });

  // Return SSE stream
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      client.onData((data) => {
        try {
          controller.enqueue(encoder.encode(data));
        } catch {
          pushService.removeEventSource(clientId);
        }
      });

      // Send initial retry directive
      controller.enqueue(encoder.encode("retry: 5000\n\n"));
    },
    cancel() {
      pushService.removeEventSource(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "emailed-jmap",
    version: "0.1.0",
    stats: {
      push: pushService.getStats(),
      threading: threading.getStats("default_account"),
    },
    timestamp: new Date().toISOString(),
  });
});

// 404
app.notFound((c) => {
  return c.json(
    { type: "urn:ietf:params:jmap:error:notFound", detail: `${c.req.method} ${c.req.path} not found` },
    404,
  );
});

// Error handler
app.onError((err, c) => {
  console.error("[JMAP] Unhandled error:", err);
  return c.json(
    { type: "urn:ietf:params:jmap:error:serverFail", detail: err.message },
    500,
  );
});

// --- Start ---

const port = parseInt(process.env.PORT ?? "3001", 10);

console.log(`Emailed JMAP server starting on port ${port}`);

// Initialize OpenTelemetry
initTelemetry("emailed-jmap").catch((err) => {
  console.warn("[jmap] OpenTelemetry init failed:", err);
});

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  console.log(`[jmap] Received ${signal} — shutting down...`);
  await shutdownTelemetry().catch(() => {});
  console.log("[jmap] Shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default {
  port,
  fetch: app.fetch,
};

export { app, handler, mailboxOps, threading, pushService };
