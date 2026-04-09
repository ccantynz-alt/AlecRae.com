/**
 * Vienna Collaboration Service
 * ────────────────────────────
 * Real-time collaborative draft editing via Yjs CRDTs.
 *
 *   - One Y.Doc room per draft id
 *   - JWT auth on the WebSocket handshake (token in `?token=` or `Sec-WebSocket-Protocol`)
 *   - Awareness state for live cursors + presence
 *   - State persisted to Postgres so reconnects resume cleanly
 *   - Version history tracked per-update in collaboration_history
 *   - Auth: only invited collaborators can join a draft
 *   - Runs as a standalone Bun process — deployable to Fly.io
 *
 * Hono handles HTTP (health, stats, admin, history), Bun's native WebSocket
 * server handles the long-lived collab connections.
 */

import { Hono } from "hono";
import { jwtVerify, type JWTPayload } from "jose";
import type { ServerWebSocket } from "bun";
import { RoomManager, type ClientContext, type Room } from "./room-manager.js";
import { DraftPersistence } from "./persistence.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const PORT = Number(process.env.COLLAB_PORT ?? 8787);
const HOST = process.env.COLLAB_HOST ?? "0.0.0.0";
const JWT_SECRET = new TextEncoder().encode(
  process.env.COLLAB_JWT_SECRET ??
    process.env.JWT_SECRET ??
    "dev-collab-secret-change-me",
);
const JWT_ISSUER = process.env.JWT_ISSUER ?? "vienna";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "vienna-collab";

interface CollabJwtClaims extends JWTPayload {
  sub: string;
  accountId: string;
  draftId: string;
  sessionId?: string;
  userName?: string;
  avatarUrl?: string;
  scope?: string;
}

// ─── App wiring ──────────────────────────────────────────────────────────────

const persistence = new DraftPersistence({ recordHistory: true });
const rooms = new RoomManager(persistence);

const app = new Hono();

app.get("/health", (c) =>
  c.json({ status: "ok", service: "collab", ...rooms.stats() }),
);

app.get("/stats", (c) => c.json(rooms.detailedStats()));

// Admin: forcibly close a room. Requires a JWT signed with the shared secret
// and `scope: "collab:admin"`. Used by the API server's DELETE collaborate route.
app.delete("/admin/rooms/:draftId", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "missing token" }, 401);
  }
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.scope !== "collab:admin") {
      return c.json({ error: "insufficient scope" }, 403);
    }
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
  const draftId = c.req.param("draftId");
  const closed = await rooms.closeRoom(draftId);
  return c.json({ closed }, closed ? 200 : 404);
});

// Admin: remove a specific user from a room.
app.delete("/admin/rooms/:draftId/users/:userId", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "missing token" }, 401);
  }
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.scope !== "collab:admin") {
      return c.json({ error: "insufficient scope" }, 403);
    }
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
  const draftId = c.req.param("draftId");
  const userId = c.req.param("userId");
  const removed = await rooms.removeUserFromRoom(draftId, userId);
  return c.json({ removed }, removed ? 200 : 404);
});

// Get connected users for a room (used by API server to populate UI).
app.get("/admin/rooms/:draftId/users", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "missing token" }, 401);
  }
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.scope !== "collab:admin") {
      return c.json({ error: "insufficient scope" }, 403);
    }
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
  const draftId = c.req.param("draftId");
  const users = rooms.getConnectedUsers(draftId);
  return c.json({ data: users });
});

// Get version history for a session.
app.get("/admin/sessions/:sessionId/history", async (c) => {
  const authHeader = c.req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "missing token" }, 401);
  }
  try {
    const { payload } = await jwtVerify(authHeader.slice(7), JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (payload.scope !== "collab:admin") {
      return c.json({ error: "insufficient scope" }, 403);
    }
  } catch {
    return c.json({ error: "invalid token" }, 401);
  }
  const sessionId = c.req.param("sessionId");
  const limitParam = c.req.query("limit");
  const offsetParam = c.req.query("offset");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;
  const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
  const history = await persistence.getHistory(sessionId, limit, offset);
  return c.json({ data: history });
});

// ─── Auth helper ─────────────────────────────────────────────────────────────

async function verifyToken(token: string): Promise<CollabJwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.accountId !== "string" ||
      typeof payload.draftId !== "string"
    ) {
      return null;
    }
    return payload as CollabJwtClaims;
  } catch (err) {
    console.warn("[collab:auth] token verify failed:", (err as Error).message);
    return null;
  }
}

function extractToken(req: Request): string | null {
  const url = new URL(req.url);
  const qp = url.searchParams.get("token");
  if (qp) return qp;
  const protoHeader = req.headers.get("sec-websocket-protocol");
  if (protoHeader) {
    // y-websocket clients can pass `auth.<jwt>` as a subprotocol
    const parts = protoHeader.split(",").map((s) => s.trim());
    for (const p of parts) {
      if (p.startsWith("auth.")) return p.slice(5);
    }
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

// ─── Bun server (HTTP + WebSocket) ───────────────────────────────────────────

const server = Bun.serve<ClientContext>({
  port: PORT,
  hostname: HOST,

  async fetch(req, srv) {
    const url = new URL(req.url);

    // WebSocket upgrade for `/collab/:draftId`
    const wsMatch = url.pathname.match(/^\/collab\/([A-Za-z0-9_-]+)$/);
    if (wsMatch) {
      const draftId = wsMatch[1]!;
      const token = extractToken(req);
      if (!token) {
        return new Response("missing token", { status: 401 });
      }
      const claims = await verifyToken(token);
      if (!claims) {
        return new Response("invalid token", { status: 401 });
      }
      if (claims.draftId !== draftId) {
        return new Response("token/draft mismatch", { status: 403 });
      }

      const ctx: ClientContext = {
        userId: claims.sub,
        accountId: claims.accountId,
        draftId,
        sessionId: claims.sessionId,
        userName: claims.userName,
        avatarUrl: claims.avatarUrl,
      };
      const ok = srv.upgrade(req, { data: ctx });
      if (ok) return undefined;
      return new Response("upgrade failed", { status: 400 });
    }

    // Otherwise hand off to Hono for HTTP routes.
    return app.fetch(req);
  },

  websocket: {
    maxPayloadLength: 16 * 1024 * 1024, // 16 MB
    idleTimeout: 120,

    async open(ws: ServerWebSocket<ClientContext>) {
      const room: Room = await rooms.getOrCreateRoom(
        ws.data.draftId,
        ws.data.accountId,
        ws.data.sessionId,
      );
      rooms.addClient(room, ws);
      rooms.sendSyncStep1(room, ws);
    },

    message(ws: ServerWebSocket<ClientContext>, raw: string | Buffer) {
      const room = rooms.getRoom(ws.data.draftId);
      if (!room) {
        ws.close(1011, "room gone");
        return;
      }
      const bytes =
        typeof raw === "string"
          ? new TextEncoder().encode(raw)
          : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
      try {
        rooms.handleMessage(room, ws, bytes);
      } catch (err) {
        console.error("[collab:ws] message error:", err);
      }
    },

    async close(ws: ServerWebSocket<ClientContext>) {
      const room = rooms.getRoom(ws.data.draftId);
      if (room) await rooms.removeClient(room, ws);
    },
  },
});

console.log(
  `[collab] listening on ws://${HOST}:${PORT}/collab/:draftId  (http://${HOST}:${PORT}/health)`,
);

// Graceful shutdown — flush all rooms.
async function shutdown(signal: string): Promise<void> {
  console.log(`[collab] received ${signal}, flushing rooms...`);
  const stats = rooms.stats();
  console.log(`[collab] active rooms=${stats.rooms} clients=${stats.clients}`);
  server.stop();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { app, server, rooms, persistence };
