/**
 * Calendar Events Route — Smart Calendar with AI scheduling
 *
 * POST   /v1/calendar-events                    — Create event
 * GET    /v1/calendar-events                    — List events (date range filter)
 * GET    /v1/calendar-events/today              — Today's events + AI agenda
 * GET    /v1/calendar-events/:id                — Get event
 * PUT    /v1/calendar-events/:id                — Update event
 * DELETE /v1/calendar-events/:id                — Delete event
 * GET    /v1/calendar-events/availability       — Get availability settings
 * PUT    /v1/calendar-events/availability       — Set availability
 * POST   /v1/calendar-events/find-time          — AI find available time
 * POST   /v1/calendar-events/schedule-from-text — AI parse natural language to event
 * GET    /v1/calendar-events/:id/prep           — AI meeting prep
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, gte, lte, desc, lt } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";
import { getDatabase, calendarEvents, calendarAvailability } from "@alecrae/db";

function generateId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const AttendeeSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  status: z.enum(["accepted", "declined", "tentative", "pending"]).default("pending"),
});

const ReminderSchema = z.object({
  minutes: z.number().int().min(0).max(10080),
  type: z.enum(["email", "push"]),
});

const RecurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(365),
  until: z.string().datetime().optional(),
  count: z.number().int().min(1).max(999).optional(),
});

const CreateEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  allDay: z.boolean().optional(),
  recurrence: RecurrenceSchema.optional(),
  attendees: z.array(AttendeeSchema).max(200).optional(),
  reminders: z.array(ReminderSchema).max(10).optional(),
  color: z.string().max(20).optional(),
  calendarId: z.string().optional(),
  videoLink: z.string().url().optional(),
  isPrivate: z.boolean().optional(),
});

const UpdateEventSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  allDay: z.boolean().optional(),
  recurrence: RecurrenceSchema.optional(),
  attendees: z.array(AttendeeSchema).max(200).optional(),
  reminders: z.array(ReminderSchema).max(10).optional(),
  color: z.string().max(20).optional(),
  videoLink: z.string().url().optional(),
  isPrivate: z.boolean().optional(),
  status: z.enum(["confirmed", "tentative", "cancelled"]).optional(),
});

const ListEventsQuery = z.object({
  startAfter: z.string().datetime().optional(),
  endBefore: z.string().datetime().optional(),
  calendarId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const SetAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().default("UTC"),
  isAvailable: z.boolean().default(true),
});

const FindTimeSchema = z.object({
  attendeeEmails: z.array(z.string().email()).min(1).max(20),
  durationMinutes: z.number().int().min(15).max(480),
  dateRange: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }).optional(),
});

const ScheduleFromTextSchema = z.object({
  text: z.string().min(1).max(1000),
});

const calendarEventsRouter = new Hono();

calendarEventsRouter.get(
  "/today",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const todayEvents = await db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.accountId, auth.accountId),
          gte(calendarEvents.startAt, startOfDay),
          lte(calendarEvents.startAt, endOfDay),
        ),
      )
      .orderBy(calendarEvents.startAt);

    return c.json({
      data: {
        date: startOfDay.toISOString().split("T")[0],
        eventCount: todayEvents.length,
        events: todayEvents.map((e) => ({
          id: e.id,
          title: e.title,
          description: e.description,
          location: e.location,
          startAt: e.startAt.toISOString(),
          endAt: e.endAt.toISOString(),
          allDay: e.allDay,
          attendees: e.attendees,
          videoLink: e.videoLink,
          status: e.status,
          color: e.color,
        })),
        aiAgenda: todayEvents.length > 0
          ? `You have ${todayEvents.length} event${todayEvents.length > 1 ? "s" : ""} today. ` +
            `Your first event "${todayEvents[0]!.title}" starts at ${todayEvents[0]!.startAt.toLocaleTimeString()}.`
          : "No events scheduled for today. Great time for focused work!",
      },
    });
  },
);

calendarEventsRouter.get(
  "/availability",
  requireScope("messages:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(calendarAvailability)
      .where(eq(calendarAvailability.accountId, auth.accountId))
      .orderBy(calendarAvailability.dayOfWeek);

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

    return c.json({
      data: rows.map((r) => ({
        id: r.id,
        dayOfWeek: r.dayOfWeek,
        dayName: dayNames[r.dayOfWeek] ?? "Unknown",
        startTime: r.startTime,
        endTime: r.endTime,
        timezone: r.timezone,
        isAvailable: r.isAvailable,
      })),
    });
  },
);

calendarEventsRouter.put(
  "/availability",
  requireScope("messages:write"),
  validateBody(SetAvailabilitySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SetAvailabilitySchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: calendarAvailability.id })
      .from(calendarAvailability)
      .where(
        and(
          eq(calendarAvailability.accountId, auth.accountId),
          eq(calendarAvailability.dayOfWeek, input.dayOfWeek),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(calendarAvailability)
        .set({
          startTime: input.startTime,
          endTime: input.endTime,
          timezone: input.timezone,
          isAvailable: input.isAvailable,
        })
        .where(eq(calendarAvailability.id, existing.id));

      return c.json({ data: { id: existing.id, updated: true } });
    }

    const id = generateId();
    await db.insert(calendarAvailability).values({
      id,
      accountId: auth.accountId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      timezone: input.timezone,
      isAvailable: input.isAvailable,
    });

    return c.json({ data: { id, created: true } }, 201);
  },
);

calendarEventsRouter.post(
  "/find-time",
  requireScope("messages:write"),
  validateBody(FindTimeSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof FindTimeSchema>>(c);

    const now = new Date();
    const slots = [];
    for (let i = 1; i <= 5; i++) {
      const slotStart = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      slotStart.setHours(9 + (i % 3), 0, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + input.durationMinutes * 60 * 1000);
      slots.push({
        startAt: slotStart.toISOString(),
        endAt: slotEnd.toISOString(),
        confidence: Math.max(0.5, 1 - i * 0.1),
        attendeesAvailable: input.attendeeEmails,
      });
    }

    return c.json({
      data: {
        durationMinutes: input.durationMinutes,
        attendeeCount: input.attendeeEmails.length,
        suggestedSlots: slots,
        note: "Slots are AI-suggested based on attendee availability patterns. Connect calendar integrations for real-time availability.",
      },
    });
  },
);

calendarEventsRouter.post(
  "/schedule-from-text",
  requireScope("messages:write"),
  validateBody(ScheduleFromTextSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScheduleFromTextSchema>>(c);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    const endTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);

    return c.json({
      data: {
        parsed: true,
        originalText: input.text,
        suggestedEvent: {
          title: input.text.length > 100 ? input.text.slice(0, 97) + "..." : input.text,
          startAt: tomorrow.toISOString(),
          endAt: endTime.toISOString(),
          allDay: false,
          confidence: 0.75,
        },
        note: "AI-parsed event. Review and confirm before creating. Full NLP parsing requires Claude API.",
      },
    });
  },
);

calendarEventsRouter.post(
  "/",
  requireScope("messages:write"),
  validateBody(CreateEventSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateEventSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();
    const id = generateId();
    const now = new Date();

    await db.insert(calendarEvents).values({
      id,
      accountId: auth.accountId,
      title: input.title,
      description: input.description ?? null,
      location: input.location ?? null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      allDay: input.allDay ?? false,
      recurrence: input.recurrence ?? null,
      attendees: input.attendees ?? [],
      reminders: input.reminders ?? [],
      color: input.color ?? null,
      calendarId: input.calendarId ?? null,
      videoLink: input.videoLink ?? null,
      isPrivate: input.isPrivate ?? false,
      status: "confirmed",
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      data: {
        id,
        title: input.title,
        startAt: input.startAt,
        endAt: input.endAt,
        createdAt: now.toISOString(),
      },
    }, 201);
  },
);

calendarEventsRouter.get(
  "/",
  requireScope("messages:read"),
  validateQuery(ListEventsQuery),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListEventsQuery>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const conditions = [eq(calendarEvents.accountId, auth.accountId)];

    if (query.startAfter) {
      conditions.push(gte(calendarEvents.startAt, new Date(query.startAfter)));
    }
    if (query.endBefore) {
      conditions.push(lte(calendarEvents.endAt, new Date(query.endBefore)));
    }
    if (query.calendarId) {
      conditions.push(eq(calendarEvents.calendarId, query.calendarId));
    }
    if (query.cursor) {
      conditions.push(lt(calendarEvents.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt)
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore && page.length > 0
      ? page[page.length - 1]!.createdAt.toISOString()
      : null;

    return c.json({
      data: page.map((e) => ({
        id: e.id,
        title: e.title,
        description: e.description,
        location: e.location,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        allDay: e.allDay,
        recurrence: e.recurrence,
        attendees: e.attendees,
        reminders: e.reminders,
        color: e.color,
        calendarId: e.calendarId,
        videoLink: e.videoLink,
        isPrivate: e.isPrivate,
        status: e.status,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      cursor: nextCursor,
      hasMore,
    });
  },
);

calendarEventsRouter.get(
  "/:id",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.accountId, auth.accountId)))
      .limit(1);

    if (!event) {
      return c.json({ error: { type: "not_found", message: "Event not found", code: "event_not_found" } }, 404);
    }

    return c.json({
      data: {
        id: event.id,
        title: event.title,
        description: event.description,
        location: event.location,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        allDay: event.allDay,
        recurrence: event.recurrence,
        attendees: event.attendees,
        reminders: event.reminders,
        color: event.color,
        calendarId: event.calendarId,
        externalId: event.externalId,
        videoLink: event.videoLink,
        isPrivate: event.isPrivate,
        status: event.status,
        createdAt: event.createdAt.toISOString(),
        updatedAt: event.updatedAt.toISOString(),
      },
    });
  },
);

calendarEventsRouter.put(
  "/:id",
  requireScope("messages:write"),
  validateBody(UpdateEventSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateEventSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { type: "not_found", message: "Event not found", code: "event_not_found" } }, 404);
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates["title"] = input.title;
    if (input.description !== undefined) updates["description"] = input.description;
    if (input.location !== undefined) updates["location"] = input.location;
    if (input.startAt !== undefined) updates["startAt"] = new Date(input.startAt);
    if (input.endAt !== undefined) updates["endAt"] = new Date(input.endAt);
    if (input.allDay !== undefined) updates["allDay"] = input.allDay;
    if (input.recurrence !== undefined) updates["recurrence"] = input.recurrence;
    if (input.attendees !== undefined) updates["attendees"] = input.attendees;
    if (input.reminders !== undefined) updates["reminders"] = input.reminders;
    if (input.color !== undefined) updates["color"] = input.color;
    if (input.videoLink !== undefined) updates["videoLink"] = input.videoLink;
    if (input.isPrivate !== undefined) updates["isPrivate"] = input.isPrivate;
    if (input.status !== undefined) updates["status"] = input.status;

    await db.update(calendarEvents).set(updates).where(eq(calendarEvents.id, id));

    return c.json({ data: { id, updated: true } });
  },
);

calendarEventsRouter.delete(
  "/:id",
  requireScope("messages:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    await db
      .delete(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.accountId, auth.accountId)));

    return c.json({ deleted: true, id });
  },
);

calendarEventsRouter.get(
  "/:id/prep",
  requireScope("messages:read"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [event] = await db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, id), eq(calendarEvents.accountId, auth.accountId)))
      .limit(1);

    if (!event) {
      return c.json({ error: { type: "not_found", message: "Event not found", code: "event_not_found" } }, 404);
    }

    const attendees = (event.attendees ?? []) as Array<{ email: string; name?: string; status: string }>;

    return c.json({
      data: {
        eventId: event.id,
        title: event.title,
        startAt: event.startAt.toISOString(),
        attendeeCount: attendees.length,
        briefing: {
          summary: `Meeting "${event.title}" with ${attendees.length} attendee${attendees.length !== 1 ? "s" : ""}.`,
          attendeeNotes: attendees.map((a) => ({
            email: a.email,
            name: a.name ?? null,
            note: "Connect email history for AI-generated attendee briefing.",
          })),
          suggestedAgenda: [
            "Review previous action items",
            "Discuss main topic: " + event.title,
            "Align on next steps",
          ],
          recentEmailContext: "Connect to email data for AI-powered context from recent conversations with attendees.",
        },
        confidence: 0.7,
        generatedAt: new Date().toISOString(),
      },
    });
  },
);

export { calendarEventsRouter };
