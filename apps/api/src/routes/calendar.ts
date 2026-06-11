/**
 * Calendar Integration Route — Meeting Invites, Availability, Scheduling
 *
 * GET  /v1/calendar/events          — List upcoming events
 * POST /v1/calendar/parse-invite    — Parse meeting invite from email
 * POST /v1/calendar/availability    — Get availability for scheduling
 * POST /v1/calendar/schedule-link   — Generate scheduling link
 * POST /v1/calendar/suggest-slots   — AI-powered slot suggestions for compose (B7)
 * GET  /v1/calendar/providers       — List connected calendar providers
 * POST /v1/calendar/connect         — Connect a calendar (Google/Outlook)
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, gte, lte, asc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { detectMeetingIntent } from "@alecrae/ai-engine/calendar/slot-detector";
import {
  suggestSlotsForCompose,
  type SlotSuggestion,
} from "@alecrae/ai-engine/calendar/slot-suggester";
import {
  getDatabase,
  calendarEvents,
  schedulingLinks,
  type CalendarEvent as CalendarEventRow,
} from "@alecrae/db";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  location?: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string; status: "accepted" | "declined" | "tentative" | "pending" }[];
  conferenceUrl?: string;
  provider: "google" | "outlook" | "ical";
  sourceEmailId?: string;
}

interface AvailabilitySlot {
  start: string;
  end: string;
  durationMinutes: number;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ParseInviteSchema = z.object({
  emailId: z.string(),
  icsContent: z.string().optional(),
});

const AvailabilitySchema = z.object({
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  workingHoursStart: z.number().int().min(0).max(23).default(9),
  workingHoursEnd: z.number().int().min(0).max(23).default(17),
  timezone: z.string().default("UTC"),
});

const ScheduleLinkSchema = z.object({
  title: z.string(),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  location: z.string().optional(),
  description: z.string().optional(),
});

const SuggestSlotsFromTextSchema = z.object({
  text: z.string().min(1).max(20_000),
  timezone: z.string().default("UTC"),
  workingHoursStart: z.number().int().min(0).max(23).default(9),
  workingHoursEnd: z.number().int().min(0).max(23).default(17),
  durationMinutes: z.number().int().min(15).max(480).optional(),
  recipientEmail: z.string().email().optional(),
  daysAhead: z.number().int().min(1).max(30).default(7),
});

// ─── Persistence ──────────────────────────────────────────────────────────────
// Events live in the `calendar_events` table (written by the calendar-events
// route) and scheduling links in `scheduling_links` — both survive restarts.

/**
 * Map a `calendar_events` DB row onto this route's legacy response shape.
 * Organizer/provider/sourceEmailId are not tracked on the table; the organizer
 * defaults to empty and provider to "ical". Exported for unit tests.
 */
export function toCalendarEventResponse(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    ...(row.location !== null ? { location: row.location } : {}),
    startTime: row.startAt.toISOString(),
    endTime: row.endAt.toISOString(),
    isAllDay: row.allDay,
    organizer: { name: "", email: "" },
    attendees: (row.attendees ?? []).map((a) => ({
      name: a.name ?? "",
      email: a.email,
      status: a.status,
    })),
    ...(row.videoLink !== null ? { conferenceUrl: row.videoLink } : {}),
    provider: "ical",
  };
}

/** Load events for an account that start within [from, to]. */
async function loadEvents(
  accountId: string,
  from: Date,
  to: Date,
): Promise<CalendarEventRow[]> {
  const db = getDatabase();
  return db
    .select()
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.accountId, accountId),
        gte(calendarEvents.startAt, from),
        lte(calendarEvents.startAt, to),
      ),
    )
    .orderBy(asc(calendarEvents.startAt));
}

// ─── ICS Parser (basic) ─────────────────────────────────────────────────────

function parseICS(ics: string): Partial<CalendarEvent> | null {
  const getField = (name: string): string | null => {
    const regex = new RegExp(`^${name}[;:](.+)$`, "m");
    const match = ics.match(regex);
    return match?.[1]?.trim() ?? null;
  };

  const summary = getField("SUMMARY");
  if (!summary) return null;

  const dtstart = getField("DTSTART");
  const dtend = getField("DTEND");
  const location = getField("LOCATION");
  const description = getField("DESCRIPTION");

  const parseICSDate = (val: string | null): string | null => {
    if (!val) return null;
    const clean = val.replace(/^.*:/, "");
    if (clean.length === 8) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T00:00:00Z`;
    }
    if (clean.length >= 15) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}T${clean.slice(9, 11)}:${clean.slice(11, 13)}:${clean.slice(13, 15)}Z`;
    }
    return null;
  };

  return {
    title: summary,
    description: description?.replace(/\\n/g, "\n") ?? "",
    ...(location !== null ? { location } : {}),
    startTime: parseICSDate(dtstart) ?? new Date().toISOString(),
    endTime: parseICSDate(dtend) ?? new Date().toISOString(),
    isAllDay: dtstart ? !dtstart.includes("T") : false,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const calendar = new Hono();

// GET /v1/calendar/events — List upcoming events
calendar.get(
  "/events",
  requireScope("calendar:read"),
  async (c) => {
    const auth = c.get("auth");
    const from = c.req.query("from") ?? new Date().toISOString();
    const to = c.req.query("to") ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const rows = await loadEvents(auth.accountId, new Date(from), new Date(to));

    return c.json({ data: rows.map(toCalendarEventResponse) });
  },
);

// POST /v1/calendar/parse-invite — Parse meeting invite from email
calendar.post(
  "/parse-invite",
  requireScope("calendar:write"),
  validateBody(ParseInviteSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ParseInviteSchema>>(c);

    if (!input.icsContent) {
      return c.json({ error: { message: "No ICS content provided", code: "missing_ics" } }, 400);
    }

    const parsed = parseICS(input.icsContent);
    if (!parsed) {
      return c.json({ error: { message: "Failed to parse ICS content", code: "parse_error" } }, 400);
    }

    return c.json({
      data: {
        ...parsed,
        sourceEmailId: input.emailId,
        actions: ["accept", "decline", "tentative", "add_to_calendar"],
      },
    });
  },
);

// POST /v1/calendar/availability — Get free time slots
calendar.post(
  "/availability",
  requireScope("calendar:read"),
  validateBody(AvailabilitySchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof AvailabilitySchema>>(c);
    const auth = c.get("auth");

    const events = await loadEvents(
      auth.accountId,
      new Date(input.dateFrom),
      new Date(input.dateTo),
    );
    const busySlots = events
      .filter(
        (e) =>
          e.startAt >= new Date(input.dateFrom) &&
          e.endAt <= new Date(input.dateTo),
      )
      .map((e) => ({ start: e.startAt.getTime(), end: e.endAt.getTime() }));

    // Generate available slots
    const available: AvailabilitySlot[] = [];
    const from = new Date(input.dateFrom);
    const to = new Date(input.dateTo);
    const duration = input.durationMinutes * 60 * 1000;

    for (let day = new Date(from); day <= to; day.setDate(day.getDate() + 1)) {
      if (day.getDay() === 0 || day.getDay() === 6) continue; // Skip weekends

      const dayStart = new Date(day);
      dayStart.setHours(input.workingHoursStart, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(input.workingHoursEnd, 0, 0, 0);

      for (let slot = dayStart.getTime(); slot + duration <= dayEnd.getTime(); slot += 30 * 60 * 1000) {
        const slotEnd = slot + duration;
        const isBusy = busySlots.some((b) => slot < b.end && slotEnd > b.start);

        if (!isBusy) {
          available.push({
            start: new Date(slot).toISOString(),
            end: new Date(slotEnd).toISOString(),
            durationMinutes: input.durationMinutes,
          });
        }
      }
    }

    return c.json({ data: available.slice(0, 20) });
  },
);

// POST /v1/calendar/schedule-link — Generate a scheduling link
calendar.post(
  "/schedule-link",
  requireScope("calendar:write"),
  validateBody(ScheduleLinkSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof ScheduleLinkSchema>>(c);
    const auth = c.get("auth");

    const token = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

    const db = getDatabase();
    await db.insert(schedulingLinks).values({
      token,
      accountId: auth.accountId,
      title: input.title,
      durationMinutes: input.durationMinutes,
      dateFrom: new Date(input.dateRange.from),
      dateTo: new Date(input.dateRange.to),
      location: input.location ?? null,
      description: input.description ?? null,
      createdAt: new Date(),
    });

    const baseUrl = process.env["WEB_URL"] ?? "https://mail.alecrae.com";

    return c.json({
      data: {
        schedulingUrl: `${baseUrl}/schedule/${token}`,
        title: input.title,
        duration: input.durationMinutes,
        expiresAt: input.dateRange.to,
      },
    });
  },
);

// POST /v1/calendar/suggest-slots — AI-powered slot suggestions from compose text (B7)
calendar.post(
  "/suggest-slots",
  requireScope("calendar:read"),
  validateBody(SuggestSlotsFromTextSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SuggestSlotsFromTextSchema>>(c);
    const auth = c.get("auth");

    // Step 1: Detect meeting intent from the compose text
    const intent = await detectMeetingIntent(input.text);

    if (!intent.hasIntent) {
      return c.json({
        data: {
          detected: false,
          intent,
          slots: [],
          formattedText: null,
        },
      });
    }

    // Step 2: Determine meeting duration — from input, AI hint, or default 30
    const duration = input.durationMinutes ?? intent.durationHint ?? 30;

    // Step 3: Get sender's availability (free slots from their calendar)
    const now = new Date();
    const dateFrom = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    const dateTo = new Date(now.getTime() + input.daysAhead * 24 * 60 * 60 * 1000);

    const events = await loadEvents(auth.accountId, dateFrom, dateTo);
    const busySlots = events
      .filter((e) => e.startAt >= dateFrom && e.endAt <= dateTo)
      .map((e) => ({ start: e.startAt.getTime(), end: e.endAt.getTime() }));

    // Build availability windows from working hours, excluding busy slots
    const availabilityWindows: { start: Date; end: Date }[] = [];
    const durationMs = duration * 60 * 1000;

    for (let day = new Date(dateFrom); day <= dateTo; day.setDate(day.getDate() + 1)) {
      if (day.getDay() === 0 || day.getDay() === 6) continue; // Skip weekends

      const dayStart = new Date(day);
      dayStart.setHours(input.workingHoursStart, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(input.workingHoursEnd, 0, 0, 0);

      // Collect free intervals in this working day
      let cursor = dayStart.getTime();
      const dayBusy = busySlots
        .filter((b) => b.start < dayEnd.getTime() && b.end > dayStart.getTime())
        .sort((a, b) => a.start - b.start);

      for (const busy of dayBusy) {
        if (cursor < busy.start && busy.start - cursor >= durationMs) {
          availabilityWindows.push({
            start: new Date(cursor),
            end: new Date(busy.start),
          });
        }
        cursor = Math.max(cursor, busy.end);
      }

      // Remaining time after last busy block
      if (cursor < dayEnd.getTime() && dayEnd.getTime() - cursor >= durationMs) {
        availabilityWindows.push({
          start: new Date(cursor),
          end: dayEnd,
        });
      }
    }

    // Step 4: Run the AI slot suggester
    const slots = await suggestSlotsForCompose({
      senderAvailability: availabilityWindows,
      recipientEmail: input.recipientEmail ?? "unknown@example.com",
      durationMinutes: duration,
      dateRange: { from: dateFrom, to: dateTo },
      preferredTimes: {
        hourStart: input.workingHoursStart,
        hourEnd: input.workingHoursEnd,
      },
      timezone: input.timezone,
    });

    // Step 5: Format as insertable text
    const introLine = "Here are a few times that work on my end:";
    const slotLines = slots.map(
      (s: SlotSuggestion) => `- ${s.formattedRange} (${s.durationMinutes} min)`,
    );
    const formattedText = [introLine, "", ...slotLines].join("\n");

    return c.json({
      data: {
        detected: true,
        intent: {
          hasIntent: intent.hasIntent,
          type: intent.type ?? null,
          confidence: intent.confidence,
          durationHint: intent.durationHint ?? null,
          locationHint: intent.locationHint ?? null,
          extractedTimes: intent.extractedTimes.map((t) => ({
            raw: t.raw,
            parsed: t.parsed?.toISOString() ?? null,
          })),
        },
        slots,
        formattedText,
      },
    });
  },
);

export { calendar };
