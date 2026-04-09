/**
 * Calendar Integration Route — Meeting Invites, Availability, Scheduling
 *
 * GET  /v1/calendar/events          — List upcoming events
 * POST /v1/calendar/parse-invite    — Parse meeting invite from email
 * POST /v1/calendar/availability    — Get availability for scheduling
 * POST /v1/calendar/schedule-link   — Generate scheduling link
 * GET  /v1/calendar/providers       — List connected calendar providers
 * POST /v1/calendar/connect         — Connect a calendar (Google/Outlook)
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

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
  attendees: Array<{ name: string; email: string; status: "accepted" | "declined" | "tentative" | "pending" }>;
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

// ─── In-memory store ─────────────────────────────────────────────────────────

const eventStore = new Map<string, CalendarEvent[]>();
const schedulingLinks = new Map<string, { config: z.infer<typeof ScheduleLinkSchema>; accountId: string; token: string }>();

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
  const organizer = getField("ORGANIZER");

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
    location: location ?? undefined,
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
  (c) => {
    const auth = c.get("auth");
    const from = c.req.query("from") ?? new Date().toISOString();
    const to = c.req.query("to") ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const events = (eventStore.get(auth.accountId) ?? [])
      .filter((e) => e.startTime >= from && e.startTime <= to)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return c.json({ data: events });
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

    const events = eventStore.get(auth.accountId) ?? [];
    const busySlots = events
      .filter((e) => e.startTime >= input.dateFrom && e.endTime <= input.dateTo)
      .map((e) => ({ start: new Date(e.startTime).getTime(), end: new Date(e.endTime).getTime() }));

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
    schedulingLinks.set(token, { config: input, accountId: auth.accountId, token });

    const baseUrl = process.env["WEB_URL"] ?? "https://mail.48co.ai";

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

export { calendar };
