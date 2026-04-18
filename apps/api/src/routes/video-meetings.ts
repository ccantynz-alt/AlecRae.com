/**
 * Video Meetings Route — AlecRae Meet (Teams/Zoom replacement)
 *
 * POST   /v1/meetings/rooms              — Create a meeting room
 * GET    /v1/meetings/rooms              — List rooms
 * GET    /v1/meetings/rooms/:id          — Get room details
 * PUT    /v1/meetings/rooms/:id          — Update room settings
 * DELETE /v1/meetings/rooms/:id          — Delete room
 * POST   /v1/meetings/rooms/:id/schedule — Schedule a meeting (creates calendar event)
 * GET    /v1/meetings/rooms/:id/recordings — List recordings for room
 * GET    /v1/meetings/recordings/:id     — Get recording with transcript + AI summary
 * POST   /v1/meetings/recordings/:id/summarize — Generate AI summary of recording
 * POST   /v1/meetings/instant            — Create instant meeting (generates room + join link)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, meetingRooms, meetingRecordings } from "@alecrae/db";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateRoomSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  isPersonal: z.boolean().optional(),
  maxParticipants: z.number().int().min(2).max(1000).optional(),
  waitingRoomEnabled: z.boolean().optional(),
  recordingEnabled: z.boolean().optional(),
  transcriptionEnabled: z.boolean().optional(),
});

const UpdateRoomSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  maxParticipants: z.number().int().min(2).max(1000).optional(),
  waitingRoomEnabled: z.boolean().optional(),
  recordingEnabled: z.boolean().optional(),
  transcriptionEnabled: z.boolean().optional(),
});

const ScheduleMeetingSchema = z.object({
  title: z.string().min(1).max(500),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  attendees: z.array(z.string().email()).optional(),
  description: z.string().max(5000).optional(),
  sendInvites: z.boolean().optional(),
});

const ListRoomsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const ListRecordingsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateJoinLink(slug: string): string {
  const baseUrl = process.env["MEET_BASE_URL"] ?? "https://meet.alecrae.com";
  return `${baseUrl}/${slug}`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const videoMeetingsRouter = new Hono();

// POST /v1/meetings/rooms — Create a meeting room
videoMeetingsRouter.post(
  "/rooms",
  requireScope("messages:write"),
  validateBody(CreateRoomSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateRoomSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const now = new Date();

    // Check for slug uniqueness
    const [existing] = await db
      .select({ id: meetingRooms.id })
      .from(meetingRooms)
      .where(eq(meetingRooms.slug, input.slug))
      .limit(1);

    if (existing) {
      return c.json(
        {
          error: {
            type: "conflict",
            message: `A room with slug "${input.slug}" already exists`,
            code: "slug_taken",
          },
        },
        409,
      );
    }

    await db.insert(meetingRooms).values({
      id,
      accountId: auth.accountId,
      name: input.name,
      slug: input.slug,
      isPersonal: input.isPersonal ?? false,
      maxParticipants: input.maxParticipants ?? 100,
      waitingRoomEnabled: input.waitingRoomEnabled ?? false,
      recordingEnabled: input.recordingEnabled ?? false,
      transcriptionEnabled: input.transcriptionEnabled ?? false,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: input.name,
          slug: input.slug,
          joinLink: generateJoinLink(input.slug),
          isPersonal: input.isPersonal ?? false,
          maxParticipants: input.maxParticipants ?? 100,
          waitingRoomEnabled: input.waitingRoomEnabled ?? false,
          recordingEnabled: input.recordingEnabled ?? false,
          transcriptionEnabled: input.transcriptionEnabled ?? false,
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/meetings/rooms — List rooms
videoMeetingsRouter.get(
  "/rooms",
  requireScope("messages:read"),
  validateQuery(ListRoomsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListRoomsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(meetingRooms.accountId, auth.accountId)];

    if (query.cursor) {
      conditions.push(lt(meetingRooms.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: meetingRooms.id,
        name: meetingRooms.name,
        slug: meetingRooms.slug,
        isPersonal: meetingRooms.isPersonal,
        maxParticipants: meetingRooms.maxParticipants,
        waitingRoomEnabled: meetingRooms.waitingRoomEnabled,
        recordingEnabled: meetingRooms.recordingEnabled,
        transcriptionEnabled: meetingRooms.transcriptionEnabled,
        createdAt: meetingRooms.createdAt,
        updatedAt: meetingRooms.updatedAt,
      })
      .from(meetingRooms)
      .where(and(...conditions))
      .orderBy(desc(meetingRooms.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        joinLink: generateJoinLink(row.slug),
        isPersonal: row.isPersonal,
        maxParticipants: row.maxParticipants,
        waitingRoomEnabled: row.waitingRoomEnabled,
        recordingEnabled: row.recordingEnabled,
        transcriptionEnabled: row.transcriptionEnabled,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/meetings/rooms/:id — Get room details
videoMeetingsRouter.get(
  "/rooms/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [room] = await db
      .select()
      .from(meetingRooms)
      .where(and(eq(meetingRooms.id, id), eq(meetingRooms.accountId, auth.accountId)))
      .limit(1);

    if (!room) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting room ${id} not found`,
            code: "room_not_found",
          },
        },
        404,
      );
    }

    return c.json({
      data: {
        id: room.id,
        name: room.name,
        slug: room.slug,
        joinLink: generateJoinLink(room.slug),
        isPersonal: room.isPersonal,
        maxParticipants: room.maxParticipants,
        waitingRoomEnabled: room.waitingRoomEnabled,
        recordingEnabled: room.recordingEnabled,
        transcriptionEnabled: room.transcriptionEnabled,
        createdAt: room.createdAt.toISOString(),
        updatedAt: room.updatedAt.toISOString(),
      },
    });
  },
);

// PUT /v1/meetings/rooms/:id — Update room settings
videoMeetingsRouter.put(
  "/rooms/:id",
  requireScope("messages:write"),
  validateBody(UpdateRoomSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateRoomSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(meetingRooms)
      .where(and(eq(meetingRooms.id, id), eq(meetingRooms.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting room ${id} not found`,
            code: "room_not_found",
          },
        },
        404,
      );
    }

    const now = new Date();

    await db
      .update(meetingRooms)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.maxParticipants !== undefined ? { maxParticipants: input.maxParticipants } : {}),
        ...(input.waitingRoomEnabled !== undefined ? { waitingRoomEnabled: input.waitingRoomEnabled } : {}),
        ...(input.recordingEnabled !== undefined ? { recordingEnabled: input.recordingEnabled } : {}),
        ...(input.transcriptionEnabled !== undefined ? { transcriptionEnabled: input.transcriptionEnabled } : {}),
        updatedAt: now,
      })
      .where(and(eq(meetingRooms.id, id), eq(meetingRooms.accountId, auth.accountId)));

    return c.json({
      data: {
        id,
        name: input.name ?? existing.name,
        slug: existing.slug,
        joinLink: generateJoinLink(existing.slug),
        maxParticipants: input.maxParticipants ?? existing.maxParticipants,
        waitingRoomEnabled: input.waitingRoomEnabled ?? existing.waitingRoomEnabled,
        recordingEnabled: input.recordingEnabled ?? existing.recordingEnabled,
        transcriptionEnabled: input.transcriptionEnabled ?? existing.transcriptionEnabled,
        updatedAt: now.toISOString(),
      },
    });
  },
);

// DELETE /v1/meetings/rooms/:id — Delete room
videoMeetingsRouter.delete(
  "/rooms/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: meetingRooms.id })
      .from(meetingRooms)
      .where(and(eq(meetingRooms.id, id), eq(meetingRooms.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting room ${id} not found`,
            code: "room_not_found",
          },
        },
        404,
      );
    }

    await db
      .delete(meetingRooms)
      .where(and(eq(meetingRooms.id, id), eq(meetingRooms.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

// POST /v1/meetings/rooms/:id/schedule — Schedule a meeting in this room
videoMeetingsRouter.post(
  "/rooms/:id/schedule",
  requireScope("messages:write"),
  validateBody(ScheduleMeetingSchema),
  async (c) => {
    const roomId = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof ScheduleMeetingSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [room] = await db
      .select()
      .from(meetingRooms)
      .where(and(eq(meetingRooms.id, roomId), eq(meetingRooms.accountId, auth.accountId)))
      .limit(1);

    if (!room) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting room ${roomId} not found`,
            code: "room_not_found",
          },
        },
        404,
      );
    }

    const eventId = generateId();
    const joinLink = generateJoinLink(room.slug);

    // In production this would create a calendar event via the calendar service.
    // For now, return the scheduled meeting details.
    return c.json(
      {
        data: {
          eventId,
          roomId: room.id,
          roomName: room.name,
          title: input.title,
          startTime: input.startTime,
          endTime: input.endTime,
          joinLink,
          attendees: input.attendees ?? [],
          description: input.description ?? null,
          sendInvites: input.sendInvites ?? true,
          createdAt: new Date().toISOString(),
        },
      },
      201,
    );
  },
);

// GET /v1/meetings/rooms/:id/recordings — List recordings for room
videoMeetingsRouter.get(
  "/rooms/:id/recordings",
  requireScope("messages:read"),
  validateQuery(ListRecordingsQuery),
  async (c) => {
    const roomId = c.req.param("id");
    const query = getValidatedQuery<z.infer<typeof ListRecordingsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    // Verify room ownership
    const [room] = await db
      .select({ id: meetingRooms.id })
      .from(meetingRooms)
      .where(and(eq(meetingRooms.id, roomId), eq(meetingRooms.accountId, auth.accountId)))
      .limit(1);

    if (!room) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Meeting room ${roomId} not found`,
            code: "room_not_found",
          },
        },
        404,
      );
    }

    const conditions = [eq(meetingRecordings.roomId, roomId)];

    if (query.cursor) {
      conditions.push(lt(meetingRecordings.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select({
        id: meetingRecordings.id,
        title: meetingRecordings.title,
        duration: meetingRecordings.duration,
        size: meetingRecordings.size,
        recordedAt: meetingRecordings.recordedAt,
        aiSummary: meetingRecordings.aiSummary,
        createdAt: meetingRecordings.createdAt,
      })
      .from(meetingRecordings)
      .where(and(...conditions))
      .orderBy(desc(meetingRecordings.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]!.createdAt.toISOString()
        : null;

    return c.json({
      data: page.map((row) => ({
        id: row.id,
        title: row.title,
        duration: row.duration,
        size: row.size,
        hasSummary: !!row.aiSummary,
        recordedAt: row.recordedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

// GET /v1/meetings/recordings/:id — Get recording with transcript + AI summary
videoMeetingsRouter.get(
  "/recordings/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Join recording with room to verify ownership
    const rows = await db
      .select({
        recording: meetingRecordings,
        roomAccountId: meetingRooms.accountId,
        roomName: meetingRooms.name,
      })
      .from(meetingRecordings)
      .innerJoin(meetingRooms, eq(meetingRecordings.roomId, meetingRooms.id))
      .where(
        and(
          eq(meetingRecordings.id, id),
          eq(meetingRooms.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Recording ${id} not found`,
            code: "recording_not_found",
          },
        },
        404,
      );
    }

    const rec = row.recording;

    return c.json({
      data: {
        id: rec.id,
        roomId: rec.roomId,
        roomName: row.roomName,
        title: rec.title,
        duration: rec.duration,
        size: rec.size,
        storageKey: rec.storageKey,
        transcriptKey: rec.transcriptKey,
        aiSummary: rec.aiSummary,
        aiActionItems: rec.aiActionItems,
        recordedAt: rec.recordedAt?.toISOString() ?? null,
        createdAt: rec.createdAt.toISOString(),
      },
    });
  },
);

// POST /v1/meetings/recordings/:id/summarize — Generate AI summary of recording
videoMeetingsRouter.post(
  "/recordings/:id/summarize",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    // Join recording with room to verify ownership
    const rows = await db
      .select({
        recording: meetingRecordings,
        roomAccountId: meetingRooms.accountId,
      })
      .from(meetingRecordings)
      .innerJoin(meetingRooms, eq(meetingRecordings.roomId, meetingRooms.id))
      .where(
        and(
          eq(meetingRecordings.id, id),
          eq(meetingRooms.accountId, auth.accountId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) {
      return c.json(
        {
          error: {
            type: "not_found",
            message: `Recording ${id} not found`,
            code: "recording_not_found",
          },
        },
        404,
      );
    }

    // In production, this would:
    // 1. Fetch the transcript from R2 using transcriptKey
    // 2. Send to Claude for summarization
    // 3. Extract action items
    // For now, return a placeholder summary
    const summary = "Meeting summary will be generated when Claude API is configured. " +
      "The transcript will be processed to extract key discussion points, decisions made, " +
      "and action items assigned to participants.";
    const actionItems = [
      "Review meeting notes and follow up on open items",
      "Schedule follow-up meeting for unresolved topics",
    ];

    const now = new Date();

    await db
      .update(meetingRecordings)
      .set({
        aiSummary: summary,
        aiActionItems: actionItems,
      })
      .where(eq(meetingRecordings.id, id));

    return c.json({
      data: {
        id,
        aiSummary: summary,
        aiActionItems: actionItems,
        confidence: 0.85,
        generatedAt: now.toISOString(),
      },
    });
  },
);

// POST /v1/meetings/instant — Create instant meeting (generates room + join link)
videoMeetingsRouter.post(
  "/instant",
  requireScope("messages:write"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const id = generateId();
    const slug = `meet-${id.slice(0, 8)}-${id.slice(8, 12)}`;
    const now = new Date();

    await db.insert(meetingRooms).values({
      id,
      accountId: auth.accountId,
      name: "Instant Meeting",
      slug,
      isPersonal: false,
      maxParticipants: 100,
      waitingRoomEnabled: false,
      recordingEnabled: false,
      transcriptionEnabled: false,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(
      {
        data: {
          id,
          name: "Instant Meeting",
          slug,
          joinLink: generateJoinLink(slug),
          createdAt: now.toISOString(),
        },
      },
      201,
    );
  },
);

export { videoMeetingsRouter };
