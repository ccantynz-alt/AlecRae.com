/**
 * Collaboration Route — CRDT Real-Time Collaborative Drafting (S2)
 *
 * Two people editing the same email draft with live cursors, like Google Docs.
 * Uses Yjs CRDTs for conflict-free merging, WebSocket for real-time sync.
 *
 * Shared Inboxes, Internal Comments, Assignments (existing)
 * + Collaborative Draft Sessions (new — S2)
 *
 * POST   /v1/collaborate/shared-inboxes           — Create shared inbox
 * GET    /v1/collaborate/shared-inboxes           — List shared inboxes
 * POST   /v1/collaborate/comments                 — Add internal comment to email
 * GET    /v1/collaborate/comments/:emailId        — Get comments on an email
 * POST   /v1/collaborate/assign                   — Assign email to team member
 * GET    /v1/collaborate/assignments              — List assignments
 * PATCH  /v1/collaborate/assignments/:id          — Update assignment status
 * POST   /v1/collaborate/draft                    — Create a shared draft session (S2)
 * GET    /v1/collaborate/draft/:id                — Get draft state + collaborators (S2)
 * POST   /v1/collaborate/draft/:id/invite         — Invite a collaborator (S2)
 * DELETE /v1/collaborate/draft/:id/collaborator/:userId — Remove collaborator (S2)
 * GET    /v1/collaborate/draft/:id/history         — Version history (S2)
 * POST   /v1/collaborate/drafts/:id/collaborate    — Enable collaborative editing on draft (existing)
 */

import { Hono } from "hono";
import { z } from "zod";
import { SignJWT } from "jose";
import { eq, and, desc } from "drizzle-orm";
import {
  getDb,
  collaborationSessions,
  collaborationInvites,
  collaborationParticipants,
  collaborationHistory,
  sharedInboxes,
  emailComments,
  emailAssignments,
  type SharedInboxMemberEntry,
} from "@alecrae/db";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

// ─── Collab service config ───────────────────────────────────────────────────

const COLLAB_WS_URL = process.env.COLLAB_WS_URL ?? "wss://collab.alecrae.com";
const COLLAB_HTTP_URL =
  process.env.COLLAB_HTTP_URL ?? "https://collab.alecrae.com";
/**
 * Resolve the collab JWT signing secret. In production we refuse to fall back to
 * a hardcoded default — an unset secret there would make collab tokens forgeable.
 * The dev fallback is kept ONLY for non-production.
 */
function getCollabJwtSecret(): Uint8Array {
  const secret = process.env.COLLAB_JWT_SECRET ?? process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[collaborate] Refusing to operate in production without COLLAB_JWT_SECRET or JWT_SECRET. " +
          "Set one of these env vars before starting the API.",
      );
    }
    return new TextEncoder().encode("dev-collab-secret-change-me");
  }
  if (secret.length < 32 && process.env.NODE_ENV === "production") {
    throw new Error(
      "[collaborate] COLLAB_JWT_SECRET / JWT_SECRET must be at least 32 characters in production.",
    );
  }
  return new TextEncoder().encode(secret);
}
const JWT_ISSUER = process.env.JWT_ISSUER ?? "alecrae";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "alecrae-collab";
const COLLAB_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const INVITE_TTL_DAYS = 7;

// ─── Cursor color palette ────────────────────────────────────────────────────

const CURSOR_COLORS: readonly string[] = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
] as const;

function pickCursorColor(index: number): string {
  return CURSOR_COLORS[index % CURSOR_COLORS.length] ?? "#3b82f6";
}

// ─── JWT helpers ─────────────────────────────────────────────────────────────

async function mintCollabToken(params: {
  userId: string;
  accountId: string;
  draftId: string;
  sessionId: string;
  userName?: string;
  avatarUrl?: string;
}): Promise<string> {
  return await new SignJWT({
    accountId: params.accountId,
    draftId: params.draftId,
    sessionId: params.sessionId,
    userName: params.userName,
    avatarUrl: params.avatarUrl,
    scope: "collab:rw",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${COLLAB_TOKEN_TTL_SECONDS}s`)
    .sign(getCollabJwtSecret());
}

async function mintAdminToken(): Promise<string> {
  return await new SignJWT({ scope: "collab:admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("api-server")
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(getCollabJwtSecret());
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// Shared inboxes, internal comments, and assignments are persisted in the
// `shared_inboxes`, `email_comments`, and `email_assignments` tables (Drizzle)
// so they survive API restarts.

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateSharedInboxSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  members: z
    .array(
      z.object({
        userId: z.string(),
        role: z.enum(["owner", "admin", "member"]).default("member"),
      }),
    )
    .default([]),
});

const AddCommentSchema = z.object({
  emailId: z.string(),
  body: z.string().min(1).max(5000),
  mentions: z.array(z.string()).default([]),
});

const AssignSchema = z.object({
  emailId: z.string(),
  assignedTo: z.string(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

const UpdateAssignmentSchema = z.object({
  status: z.enum(["open", "in_progress", "done", "snoozed"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueAt: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

// ─── S2 Schemas ──────────────────────────────────────────────────────────────

const CreateDraftSessionSchema = z.object({
  draftId: z.string().min(1).max(255),
  title: z.string().min(1).max(500).default("Untitled Draft"),
  maxCollaborators: z.number().int().min(2).max(50).default(10),
});

const InviteCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(["editor", "viewer"]).default("editor"),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const collaborate = new Hono();

// ── Shared Inboxes ───────────────────────────────────────────────────────────

collaborate.post(
  "/shared-inboxes",
  requireScope("collaborate:write"),
  validateBody(CreateSharedInboxSchema),
  async (c) => {
    const input =
      getValidatedBody<z.infer<typeof CreateSharedInboxSchema>>(c);
    const auth = c.get("auth");
    const db = getDb();

    const now = new Date();
    const members: SharedInboxMemberEntry[] = [
      { userId: auth.accountId, role: "owner", addedAt: now.toISOString() },
      ...input.members.map((m) => ({ ...m, addedAt: now.toISOString() })),
    ];

    const inbox = {
      id: generateId(),
      accountId: auth.accountId,
      name: input.name,
      email: input.email,
      members,
      createdAt: now,
    };

    await db.insert(sharedInboxes).values(inbox);

    return c.json({ data: inbox }, 201);
  },
);

collaborate.get(
  "/shared-inboxes",
  requireScope("collaborate:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDb();

    const inboxes = await db
      .select()
      .from(sharedInboxes)
      .where(eq(sharedInboxes.accountId, auth.accountId))
      .orderBy(sharedInboxes.createdAt);

    return c.json({ data: inboxes });
  },
);

// ── Internal Comments ────────────────────────────────────────────────────────

collaborate.post(
  "/comments",
  requireScope("collaborate:write"),
  validateBody(AddCommentSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AddCommentSchema>>(c);
    const auth = c.get("auth");
    const db = getDb();

    const comment = {
      id: generateId(),
      accountId: auth.accountId,
      emailId: input.emailId,
      authorId: auth.accountId,
      authorName: auth.accountId,
      body: input.body,
      mentions: input.mentions,
      createdAt: new Date(),
    };

    await db.insert(emailComments).values(comment);

    return c.json(
      {
        data: {
          id: comment.id,
          emailId: comment.emailId,
          authorId: comment.authorId,
          authorName: comment.authorName,
          body: comment.body,
          mentions: comment.mentions,
          createdAt: comment.createdAt,
        },
      },
      201,
    );
  },
);

collaborate.get(
  "/comments/:emailId",
  requireScope("collaborate:read"),
  async (c) => {
    const emailId = c.req.param("emailId");
    const auth = c.get("auth");
    const db = getDb();

    const rows = await db
      .select({
        id: emailComments.id,
        emailId: emailComments.emailId,
        authorId: emailComments.authorId,
        authorName: emailComments.authorName,
        body: emailComments.body,
        mentions: emailComments.mentions,
        createdAt: emailComments.createdAt,
      })
      .from(emailComments)
      .where(
        and(
          eq(emailComments.emailId, emailId),
          eq(emailComments.accountId, auth.accountId),
        ),
      )
      .orderBy(emailComments.createdAt);

    return c.json({ data: rows });
  },
);

// ── Assignments ──────────────────────────────────────────────────────────────

/**
 * Serialize an assignment row into the legacy response shape: dueAt/note are
 * OMITTED (not null) when unset, matching the original in-memory behavior.
 */
function serializeAssignment(row: {
  id: string;
  emailId: string;
  assignedTo: string;
  assignedBy: string;
  status: "open" | "in_progress" | "done" | "snoozed";
  priority: "low" | "medium" | "high" | "urgent";
  dueAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Record<string, unknown> {
  return {
    id: row.id,
    emailId: row.emailId,
    assignedTo: row.assignedTo,
    assignedBy: row.assignedBy,
    status: row.status,
    priority: row.priority,
    ...(row.dueAt !== null ? { dueAt: row.dueAt } : {}),
    ...(row.note !== null ? { note: row.note } : {}),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

collaborate.post(
  "/assign",
  requireScope("collaborate:write"),
  validateBody(AssignSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AssignSchema>>(c);
    const auth = c.get("auth");
    const db = getDb();

    const now = new Date();
    const assignment = {
      id: generateId(),
      accountId: auth.accountId,
      emailId: input.emailId,
      assignedTo: input.assignedTo,
      assignedBy: auth.accountId,
      status: "open" as const,
      priority: input.priority,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      note: input.note ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(emailAssignments).values(assignment);

    return c.json({ data: serializeAssignment(assignment) }, 201);
  },
);

collaborate.get(
  "/assignments",
  requireScope("collaborate:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDb();
    const status = c.req.query("status");
    const assignedTo = c.req.query("assignedTo");

    const rows = await db
      .select()
      .from(emailAssignments)
      .where(eq(emailAssignments.accountId, auth.accountId))
      .orderBy(emailAssignments.createdAt);

    let filtered = rows;
    if (status) filtered = filtered.filter((a) => a.status === status);
    if (assignedTo)
      filtered = filtered.filter((a) => a.assignedTo === assignedTo);

    return c.json({ data: filtered.map(serializeAssignment) });
  },
);

collaborate.patch(
  "/assignments/:id",
  requireScope("collaborate:write"),
  validateBody(UpdateAssignmentSchema),
  async (c) => {
    const id = c.req.param("id");
    const input =
      getValidatedBody<z.infer<typeof UpdateAssignmentSchema>>(c);
    const auth = c.get("auth");
    const db = getDb();

    const [assignment] = await db
      .select()
      .from(emailAssignments)
      .where(
        and(
          eq(emailAssignments.id, id),
          eq(emailAssignments.accountId, auth.accountId),
        ),
      )
      .limit(1);

    if (!assignment) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Assignment not found",
            code: "assignment_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();
    const updated = {
      ...assignment,
      status: input.status ?? assignment.status,
      priority: input.priority ?? assignment.priority,
      dueAt: input.dueAt ? new Date(input.dueAt) : assignment.dueAt,
      note: input.note !== undefined ? input.note : assignment.note,
      updatedAt: now,
    };

    await db
      .update(emailAssignments)
      .set({
        status: updated.status,
        priority: updated.priority,
        dueAt: updated.dueAt,
        note: updated.note,
        updatedAt: now,
      })
      .where(
        and(
          eq(emailAssignments.id, id),
          eq(emailAssignments.accountId, auth.accountId),
        ),
      );

    return c.json({ data: serializeAssignment(updated) });
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// S2: CRDT Real-Time Collaborative Drafting
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /v1/collaborate/draft — Create a shared draft session ───────────────

collaborate.post(
  "/draft",
  requireScope("collaborate:write"),
  validateBody(CreateDraftSessionSchema),
  async (c) => {
    const input =
      getValidatedBody<z.infer<typeof CreateDraftSessionSchema>>(c);
    const auth = c.get("auth");
    const db = getDb();

    const sessionId = generateId();
    const participantId = generateId();

    // Create the collaboration session.
    await db.insert(collaborationSessions).values({
      id: sessionId,
      draftId: input.draftId,
      accountId: auth.accountId,
      createdBy: auth.accountId,
      title: input.title,
      status: "active",
      currentVersion: 0,
      maxCollaborators: input.maxCollaborators,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add the creator as the first participant (owner).
    await db.insert(collaborationParticipants).values({
      id: participantId,
      sessionId,
      userId: auth.accountId,
      role: "owner",
      isOnline: false,
      cursorColor: pickCursorColor(0),
      joinedAt: new Date(),
    });

    // Mint a collab token for the creator.
    const token = await mintCollabToken({
      userId: auth.accountId,
      accountId: auth.accountId,
      draftId: input.draftId,
      sessionId,
    });

    const websocketUrl = `${COLLAB_WS_URL.replace(/\/$/, "")}/collab/${input.draftId}?token=${encodeURIComponent(token)}`;

    return c.json(
      {
        data: {
          sessionId,
          draftId: input.draftId,
          title: input.title,
          websocketUrl,
          token,
          expiresIn: COLLAB_TOKEN_TTL_SECONDS,
          participants: [
            {
              userId: auth.accountId,
              role: "owner",
              cursorColor: pickCursorColor(0),
            },
          ],
          features: [
            "Real-time co-editing with live cursors",
            "Awareness presence + selections",
            "CRDT conflict-free merging (Yjs)",
            "Version history with per-edit tracking",
            "Resume on reconnect (Postgres-backed snapshots)",
            "Invite collaborators by email",
          ],
        },
      },
      201,
    );
  },
);

// ── GET /v1/collaborate/draft/:id — Get draft state + collaborators ──────────

collaborate.get(
  "/draft/:id",
  requireScope("collaborate:read"),
  async (c) => {
    const sessionId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDb();

    // Fetch session.
    const sessions = await db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.id, sessionId),
          eq(collaborationSessions.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const session = sessions[0];
    if (!session) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft session not found",
            code: "session_not_found",
          },
        },
        404,
      );
    }

    // Fetch participants.
    const participants = await db
      .select()
      .from(collaborationParticipants)
      .where(eq(collaborationParticipants.sessionId, sessionId));

    // Fetch pending invites.
    const invites = await db
      .select()
      .from(collaborationInvites)
      .where(
        and(
          eq(collaborationInvites.sessionId, sessionId),
          eq(collaborationInvites.status, "pending"),
        ),
      );

    // Fetch connected users from collab service.
    let connectedUsers: {
      userId: string;
      name: string;
      avatarUrl: string | undefined;
      joinedAt: string;
    }[] = [];
    try {
      const adminToken = await mintAdminToken();
      const res = await fetch(
        `${COLLAB_HTTP_URL.replace(/\/$/, "")}/admin/rooms/${encodeURIComponent(session.draftId)}/users`,
        { headers: { authorization: `Bearer ${adminToken}` } },
      );
      if (res.ok) {
        const body = (await res.json()) as {
          data: typeof connectedUsers;
        };
        connectedUsers = body.data;
      }
    } catch {
      // Collab service might not be running; non-fatal.
    }

    // Mint a token for the requesting user so they can connect.
    const isParticipant = participants.some(
      (p) => p.userId === auth.accountId,
    );
    let token: string | undefined;
    let websocketUrl: string | undefined;

    if (isParticipant) {
      token = await mintCollabToken({
        userId: auth.accountId,
        accountId: auth.accountId,
        draftId: session.draftId,
        sessionId,
      });
      websocketUrl = `${COLLAB_WS_URL.replace(/\/$/, "")}/collab/${session.draftId}?token=${encodeURIComponent(token)}`;
    }

    return c.json({
      data: {
        session: {
          id: session.id,
          draftId: session.draftId,
          title: session.title,
          status: session.status,
          currentVersion: session.currentVersion,
          maxCollaborators: session.maxCollaborators,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        participants: participants.map((p) => ({
          id: p.id,
          userId: p.userId,
          role: p.role,
          cursorColor: p.cursorColor,
          isOnline: connectedUsers.some((cu) => cu.userId === p.userId),
          joinedAt: p.joinedAt,
          lastSeenAt: p.lastSeenAt,
        })),
        pendingInvites: invites.map((inv) => ({
          id: inv.id,
          inviteeEmail: inv.inviteeEmail,
          role: inv.role,
          status: inv.status,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        })),
        connection: isParticipant
          ? { token, websocketUrl, expiresIn: COLLAB_TOKEN_TTL_SECONDS }
          : null,
      },
    });
  },
);

// ── POST /v1/collaborate/draft/:id/invite — Invite a collaborator ────────────

collaborate.post(
  "/draft/:id/invite",
  requireScope("collaborate:write"),
  validateBody(InviteCollaboratorSchema),
  async (c) => {
    const sessionId = c.req.param("id");
    const input =
      getValidatedBody<z.infer<typeof InviteCollaboratorSchema>>(c);
    const auth = c.get("auth");
    const db = getDb();

    // Verify session exists and user is owner or editor.
    const sessions = await db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.id, sessionId),
          eq(collaborationSessions.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const session = sessions[0];
    if (!session) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft session not found",
            code: "session_not_found",
          },
        },
        404,
      );
    }

    if (session.status !== "active") {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "Session is not active",
            code: "session_not_active",
          },
        },
        409,
      );
    }

    // Check participant count.
    const existingParticipants = await db
      .select()
      .from(collaborationParticipants)
      .where(eq(collaborationParticipants.sessionId, sessionId));

    if (existingParticipants.length >= session.maxCollaborators) {
      return c.json(
        {
          error: {
            type: "limit_reached",
            message: `Maximum of ${session.maxCollaborators} collaborators reached`,
            code: "max_collaborators",
          },
        },
        422,
      );
    }

    // Check for duplicate invite.
    const existingInvites = await db
      .select()
      .from(collaborationInvites)
      .where(
        and(
          eq(collaborationInvites.sessionId, sessionId),
          eq(collaborationInvites.inviteeEmail, input.email),
          eq(collaborationInvites.status, "pending"),
        ),
      )
      .limit(1);

    if (existingInvites.length > 0) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: "Invite already sent to this email",
            code: "invite_exists",
          },
        },
        409,
      );
    }

    const inviteId = generateId();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    await db.insert(collaborationInvites).values({
      id: inviteId,
      sessionId,
      invitedBy: auth.accountId,
      inviteeEmail: input.email,
      role: input.role,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    });

    return c.json(
      {
        data: {
          inviteId,
          sessionId,
          inviteeEmail: input.email,
          role: input.role,
          expiresAt: expiresAt.toISOString(),
        },
      },
      201,
    );
  },
);

// ── DELETE /v1/collaborate/draft/:id/collaborator/:userId — Remove collaborator

collaborate.delete(
  "/draft/:id/collaborator/:userId",
  requireScope("collaborate:write"),
  async (c) => {
    const sessionId = c.req.param("id");
    const targetUserId = c.req.param("userId");
    const auth = c.get("auth");
    const db = getDb();

    // Verify session exists and requesting user has permission.
    const sessions = await db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.id, sessionId),
          eq(collaborationSessions.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const session = sessions[0];
    if (!session) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft session not found",
            code: "session_not_found",
          },
        },
        404,
      );
    }

    // Cannot remove the owner.
    if (targetUserId === session.createdBy) {
      return c.json(
        {
          error: {
            type: "forbidden",
            message: "Cannot remove the session owner",
            code: "cannot_remove_owner",
          },
        },
        403,
      );
    }

    // Remove participant from DB.
    await db
      .delete(collaborationParticipants)
      .where(
        and(
          eq(collaborationParticipants.sessionId, sessionId),
          eq(collaborationParticipants.userId, targetUserId),
        ),
      );

    // Kick from live room if connected.
    try {
      const adminToken = await mintAdminToken();
      await fetch(
        `${COLLAB_HTTP_URL.replace(/\/$/, "")}/admin/rooms/${encodeURIComponent(session.draftId)}/users/${encodeURIComponent(targetUserId)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${adminToken}` },
        },
      );
    } catch {
      // Non-fatal if collab service is unreachable.
    }

    return c.json({
      data: { sessionId, removedUserId: targetUserId, removed: true },
    });
  },
);

// ── GET /v1/collaborate/draft/:id/history — Version history ──────────────────

collaborate.get(
  "/draft/:id/history",
  requireScope("collaborate:read"),
  async (c) => {
    const sessionId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDb();

    // Verify session exists and user has access.
    const sessions = await db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.id, sessionId),
          eq(collaborationSessions.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const session = sessions[0];
    if (!session) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: "Draft session not found",
            code: "session_not_found",
          },
        },
        404,
      );
    }

    const limitParam = c.req.query("limit");
    const offsetParam = c.req.query("offset");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;

    const history = await db
      .select({
        id: collaborationHistory.id,
        version: collaborationHistory.version,
        editedBy: collaborationHistory.editedBy,
        updateSize: collaborationHistory.updateSize,
        summary: collaborationHistory.summary,
        createdAt: collaborationHistory.createdAt,
      })
      .from(collaborationHistory)
      .where(eq(collaborationHistory.sessionId, sessionId))
      .orderBy(desc(collaborationHistory.version))
      .limit(limit)
      .offset(offset);

    return c.json({
      data: {
        sessionId,
        currentVersion: session.currentVersion,
        entries: history,
        pagination: { limit, offset },
      },
    });
  },
);

// ── POST /v1/collaborate/drafts/:id/collaborate — Legacy endpoint ────────────
// Kept for backward compatibility. Creates a session if none exists.

collaborate.post(
  "/drafts/:id/collaborate",
  requireScope("collaborate:write"),
  async (c) => {
    const draftId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDb();

    // Check if session already exists for this draft.
    const existingSessions = await db
      .select()
      .from(collaborationSessions)
      .where(
        and(
          eq(collaborationSessions.draftId, draftId),
          eq(collaborationSessions.accountId, auth.accountId),
          eq(collaborationSessions.status, "active"),
        ),
      )
      .limit(1);

    let sessionId: string;

    if (existingSessions[0]) {
      sessionId = existingSessions[0].id;
    } else {
      sessionId = generateId();
      await db.insert(collaborationSessions).values({
        id: sessionId,
        draftId,
        accountId: auth.accountId,
        createdBy: auth.accountId,
        title: "Untitled Draft",
        status: "active",
        currentVersion: 0,
        maxCollaborators: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await db.insert(collaborationParticipants).values({
        id: generateId(),
        sessionId,
        userId: auth.accountId,
        role: "owner",
        isOnline: false,
        cursorColor: pickCursorColor(0),
        joinedAt: new Date(),
      });
    }

    const token = await mintCollabToken({
      userId: auth.accountId,
      accountId: auth.accountId,
      draftId,
      sessionId,
    });

    const websocketUrl = `${COLLAB_WS_URL.replace(/\/$/, "")}/collab/${draftId}?token=${encodeURIComponent(token)}`;

    return c.json({
      data: {
        draftId,
        sessionId,
        websocketUrl,
        token,
        expiresIn: COLLAB_TOKEN_TTL_SECONDS,
        features: [
          "Real-time co-editing with live cursors",
          "Awareness presence + selections",
          "CRDT conflict-free merging (Yjs)",
          "Version history with per-edit tracking",
          "Resume on reconnect (Postgres-backed snapshots)",
          "Invite collaborators by email",
        ],
      },
    });
  },
);

// ── DELETE /v1/collaborate/drafts/:id/collaborate — Close session ─────────────

collaborate.delete(
  "/drafts/:id/collaborate",
  requireScope("collaborate:write"),
  async (c) => {
    const draftId = c.req.param("id");
    const auth = c.get("auth");
    const db = getDb();

    // Close any active session for this draft.
    await db
      .update(collaborationSessions)
      .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(collaborationSessions.draftId, draftId),
          eq(collaborationSessions.accountId, auth.accountId),
          eq(collaborationSessions.status, "active"),
        ),
      );

    // Ask the collab service to forcibly close the room.
    try {
      const adminToken = await mintAdminToken();
      const res = await fetch(
        `${COLLAB_HTTP_URL.replace(/\/$/, "")}/admin/rooms/${encodeURIComponent(draftId)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${adminToken}` },
        },
      );
      if (!res.ok && res.status !== 404) {
        return c.json(
          {
            error: {
              type: "upstream_error",
              message: `collab service returned ${res.status}`,
              code: "collab_close_failed",
            },
          },
          502,
        );
      }
    } catch (err) {
      return c.json(
        {
          error: {
            type: "upstream_error",
            message: (err as Error).message,
            code: "collab_unreachable",
          },
        },
        502,
      );
    }

    return c.json({ data: { draftId, closed: true } });
  },
);

export { collaborate };
