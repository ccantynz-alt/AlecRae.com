import { Hono } from "hono";
import { cors } from "hono/cors";
import { JmapHandler } from "./server/handler.js";
import { MailboxOperations } from "./mailbox/operations.js";
import { ThreadingEngine } from "./thread/engine.js";
import { PushNotificationService } from "./push/notifications.js";
import type {
  JmapRequest,
  JmapId,
  GetArgs,
  ChangesArgs,
  SetArgs,
  QueryArgs,
  Mailbox,
} from "./types.js";

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

app.use("*", cors());

// JMAP Session endpoint (RFC 8620 Section 2)
app.get("/.well-known/jmap", (c) => {
  // In production: extract account from authentication
  const accountId = "default_account";
  const username = "user@example.com";
  const session = handler.getSession(username, accountId);
  return c.json(session);
});

// JMAP API endpoint (RFC 8620 Section 3)
app.post("/jmap", async (c) => {
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

  // In production: extract account from authentication
  const accountId = "default_account";
  const username = "user@example.com";

  const response = await handler.processRequest(request, accountId, username);
  return c.json(response);
});

// EventSource endpoint (RFC 8620 Section 7.3)
app.get("/jmap/eventsource", (c) => {
  const types = c.req.query("types")?.split(",").filter(Boolean);
  const closeAfter = c.req.query("closeafter") as "state" | "no" | undefined;
  const ping = parseInt(c.req.query("ping") ?? "0", 10);

  const accountId = "default_account";
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

export default {
  port,
  fetch: app.fetch,
};

export { app, handler, mailboxOps, threading, pushService };
