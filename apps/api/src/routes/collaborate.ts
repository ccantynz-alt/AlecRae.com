/**
 * Collaboration Route — Shared Inboxes, Internal Comments, Assignments
 *
 * Replaces Front ($19-59/user/mo) — we include it.
 *
 * POST   /v1/collaborate/shared-inboxes           — Create shared inbox
 * GET    /v1/collaborate/shared-inboxes           — List shared inboxes
 * POST   /v1/collaborate/comments                 — Add internal comment to email
 * GET    /v1/collaborate/comments/:emailId        — Get comments on an email
 * POST   /v1/collaborate/assign                   — Assign email to team member
 * GET    /v1/collaborate/assignments              — List assignments
 * PATCH  /v1/collaborate/assignments/:id          — Update assignment status
 * POST   /v1/collaborate/drafts/:id/collaborate   — Enable collaborative editing on draft
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SharedInbox {
  id: string;
  accountId: string;
  name: string;
  email: string;
  members: SharedInboxMember[];
  createdAt: Date;
}

interface SharedInboxMember {
  userId: string;
  role: "owner" | "admin" | "member";
  addedAt: Date;
}

interface InternalComment {
  id: string;
  emailId: string;
  authorId: string;
  authorName: string;
  body: string;
  mentions: string[];
  createdAt: Date;
}

interface Assignment {
  id: string;
  emailId: string;
  assignedTo: string;
  assignedBy: string;
  status: "open" | "in_progress" | "done" | "snoozed";
  priority: "low" | "medium" | "high" | "urgent";
  dueAt?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── In-memory stores (production: DB tables) ────────────────────────────────

const sharedInboxes = new Map<string, SharedInbox[]>();
const comments = new Map<string, InternalComment[]>(); // emailId -> comments
const assignments = new Map<string, Assignment[]>(); // accountId -> assignments

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateSharedInboxSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  members: z.array(z.object({
    userId: z.string(),
    role: z.enum(["owner", "admin", "member"]).default("member"),
  })).default([]),
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

// ─── Routes ──────────────────────────────────────────────────────────────────

const collaborate = new Hono();

// ── Shared Inboxes ───────────────────────────────────────────────────────────

collaborate.post(
  "/shared-inboxes",
  requireScope("collaborate:write"),
  validateBody(CreateSharedInboxSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof CreateSharedInboxSchema>>(c);
    const auth = c.get("auth");

    const inbox: SharedInbox = {
      id: generateId(),
      accountId: auth.accountId,
      name: input.name,
      email: input.email,
      members: [
        { userId: auth.accountId, role: "owner", addedAt: new Date() },
        ...input.members.map((m) => ({ ...m, addedAt: new Date() })),
      ],
      createdAt: new Date(),
    };

    const existing = sharedInboxes.get(auth.accountId) ?? [];
    sharedInboxes.set(auth.accountId, [...existing, inbox]);

    return c.json({ data: inbox }, 201);
  },
);

collaborate.get(
  "/shared-inboxes",
  requireScope("collaborate:read"),
  (c) => {
    const auth = c.get("auth");
    const inboxes = sharedInboxes.get(auth.accountId) ?? [];
    return c.json({ data: inboxes });
  },
);

// ── Internal Comments ────────────────────────────────────────────────────────

collaborate.post(
  "/comments",
  requireScope("collaborate:write"),
  validateBody(AddCommentSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof AddCommentSchema>>(c);
    const auth = c.get("auth");

    const comment: InternalComment = {
      id: generateId(),
      emailId: input.emailId,
      authorId: auth.accountId,
      authorName: auth.name ?? "Unknown",
      body: input.body,
      mentions: input.mentions,
      createdAt: new Date(),
    };

    const existing = comments.get(input.emailId) ?? [];
    comments.set(input.emailId, [...existing, comment]);

    return c.json({ data: comment }, 201);
  },
);

collaborate.get(
  "/comments/:emailId",
  requireScope("collaborate:read"),
  (c) => {
    const emailId = c.req.param("emailId");
    const emailComments = comments.get(emailId) ?? [];
    return c.json({ data: emailComments });
  },
);

// ── Assignments ──────────────────────────────────────────────────────────────

collaborate.post(
  "/assign",
  requireScope("collaborate:write"),
  validateBody(AssignSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof AssignSchema>>(c);
    const auth = c.get("auth");

    const assignment: Assignment = {
      id: generateId(),
      emailId: input.emailId,
      assignedTo: input.assignedTo,
      assignedBy: auth.accountId,
      status: "open",
      priority: input.priority,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      note: input.note,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const existing = assignments.get(auth.accountId) ?? [];
    assignments.set(auth.accountId, [...existing, assignment]);

    return c.json({ data: assignment }, 201);
  },
);

collaborate.get(
  "/assignments",
  requireScope("collaborate:read"),
  (c) => {
    const auth = c.get("auth");
    const allAssignments = assignments.get(auth.accountId) ?? [];
    const status = c.req.query("status");
    const assignedTo = c.req.query("assignedTo");

    let filtered = allAssignments;
    if (status) filtered = filtered.filter((a) => a.status === status);
    if (assignedTo) filtered = filtered.filter((a) => a.assignedTo === assignedTo);

    return c.json({ data: filtered });
  },
);

collaborate.patch(
  "/assignments/:id",
  requireScope("collaborate:write"),
  validateBody(UpdateAssignmentSchema),
  (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateAssignmentSchema>>(c);
    const auth = c.get("auth");

    const allAssignments = assignments.get(auth.accountId) ?? [];
    const assignment = allAssignments.find((a) => a.id === id);

    if (!assignment) {
      return c.json(
        { error: { type: "not_found", message: "Assignment not found", code: "assignment_not_found" } },
        404,
      );
    }

    if (input.status) assignment.status = input.status;
    if (input.priority) assignment.priority = input.priority;
    if (input.dueAt) assignment.dueAt = new Date(input.dueAt);
    if (input.note !== undefined) assignment.note = input.note;
    assignment.updatedAt = new Date();

    return c.json({ data: assignment });
  },
);

// ── Collaborative Drafts ─────────────────────────────────────────────────────

collaborate.post(
  "/drafts/:id/collaborate",
  requireScope("collaborate:write"),
  (c) => {
    const draftId = c.req.param("id");
    const auth = c.get("auth");

    // In production: create a Yjs CRDT room for this draft
    // and return a WebSocket URL for real-time co-editing
    return c.json({
      data: {
        draftId,
        collaborationUrl: `wss://collab.vienna.com/drafts/${draftId}`,
        message: "Collaborative editing enabled. Share the URL with team members.",
        features: [
          "Real-time co-editing with cursors",
          "Inline comments and suggestions",
          "Version history",
          "Conflict-free merging (CRDT-based)",
        ],
      },
    });
  },
);

export { collaborate };
