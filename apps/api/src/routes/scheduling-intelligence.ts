/**
 * Scheduling Intelligence Route
 *
 * POST   /v1/scheduling/detect          — Detect scheduling intent in email
 * POST   /v1/scheduling/propose         — Generate meeting proposal
 * GET    /v1/scheduling/proposals        — List proposals (cursor pagination)
 * GET    /v1/scheduling/proposals/:id    — Get specific proposal
 * PUT    /v1/scheduling/proposals/:id    — Accept/decline proposal
 * GET    /v1/scheduling/patterns         — Get availability patterns
 * PUT    /v1/scheduling/patterns         — Update preferences
 * POST   /v1/scheduling/patterns/learn   — Learn from calendar data
 * GET    /v1/scheduling/suggest-times    — Suggest available times
 * GET    /v1/scheduling/conflicts        — Detect scheduling conflicts
 * GET    /v1/scheduling/stats            — Scheduling stats
 * POST   /v1/scheduling/auto-respond     — Generate scheduling response
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc, lt, isNotNull, sql as _sql } from "drizzle-orm";
import {
  getDatabase,
  meetingProposals,
  availabilityPatterns,
  emails,
} from "@alecrae/db";
import type { MeetingPreferences } from "@alecrae/db";
import { generateId } from "../lib/jwt.js";
import { requireScope } from "../middleware/auth.js";
import {
  validateBody,
  validateQuery,
  getValidatedBody,
  getValidatedQuery,
} from "../middleware/validator.js";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const DetectBodySchema = z.object({
  emailId: z.string().min(1),
  content: z.string().min(1),
  participants: z.array(z.string().email()).min(1),
});

const ProposeBodySchema = z.object({
  emailId: z.string().min(1),
  threadId: z.string().min(1),
  participants: z.array(z.string().email()).min(1),
  duration: z.number().int().min(5).max(480).default(30),
  preferences: z
    .object({
      preferMorning: z.boolean().optional(),
      maxMeetingsPerDay: z.number().int().min(1).optional(),
      minBreakMinutes: z.number().int().min(0).optional(),
      noMeetingDays: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
});

const ListProposalsQuerySchema = z.object({
  status: z
    .enum(["proposed", "accepted", "declined", "expired"])
    .optional(),
  threadId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const UpdateProposalBodySchema = z.object({
  status: z.enum(["accepted", "declined"]),
  selectedTime: z.string().optional(),
});

const UpdatePatternsBodySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  preferredStartHour: z.number().int().min(0).max(23),
  preferredEndHour: z.number().int().min(0).max(23),
  meetingPreferences: z
    .object({
      maxMeetingsPerDay: z.number().int().min(1).optional(),
      minBreakMinutes: z.number().int().min(0).optional(),
      preferMorning: z.boolean().optional(),
      noMeetingDays: z.array(z.number().int().min(0).max(6)).optional(),
    })
    .optional(),
});

const CalendarEventSchema = z.object({
  start: z.string().min(1),
  end: z.string().min(1),
  recurring: z.boolean().default(false),
});

const LearnPatternsBodySchema = z.object({
  calendarEvents: z.array(CalendarEventSchema).min(1),
});

const SuggestTimesQuerySchema = z.object({
  duration: z.coerce.number().int().min(5).max(480),
  participants: z.string().min(1),
  dateRange: z.string().min(1),
});

const ConflictsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  range: z.coerce.number().int().min(1).max(30).default(7),
});

const AutoRespondBodySchema = z.object({
  proposalId: z.string().min(1),
  action: z.enum(["accept", "decline", "suggest_alternative"]),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCHEDULING_KEYWORDS = [
  "meet",
  "meeting",
  "schedule",
  "calendar",
  "availability",
  "slot",
  "call",
  "catch up",
  "sync",
  "coffee",
  "lunch",
  "interview",
  "demo",
  "standup",
  "stand-up",
  "let's talk",
  "free time",
  "next week",
  "tomorrow",
  "this week",
];

/** The `meeting_type` enum, mirrored so a stray string cannot be stored. */
type MeetingType =
  | "one_on_one"
  | "group"
  | "standup"
  | "interview"
  | "demo"
  | "social";

const MEETING_TYPES: readonly MeetingType[] = [
  "one_on_one",
  "group",
  "standup",
  "interview",
  "demo",
  "social",
];

/**
 * Narrow the classifier's `string` to the DB enum.
 *
 * The insert previously used `meetingType as "one_on_one"` — a cast that
 * asserted the value was a single literal it demonstrably was not, and which
 * would have written an invalid enum value the moment the classifier returned
 * anything else. Checking beats asserting.
 */
function toMeetingType(value: string): MeetingType {
  return MEETING_TYPES.find((t) => t === value) ?? "one_on_one";
}

function detectSchedulingIntent(content: string): {
  hasIntent: boolean;
  confidence: number;
  detectedKeywords: string[];
  suggestedDuration: number;
  meetingType: string;
} {
  const lower = content.toLowerCase();
  const detectedKeywords = SCHEDULING_KEYWORDS.filter((kw) =>
    lower.includes(kw),
  );
  const matchCount = detectedKeywords.length;

  const confidence = Math.min(1, matchCount * 0.2);
  const hasIntent = confidence >= 0.2;

  let suggestedDuration = 30;
  if (lower.includes("quick") || lower.includes("brief")) suggestedDuration = 15;
  if (lower.includes("lunch") || lower.includes("coffee")) suggestedDuration = 60;
  if (lower.includes("interview")) suggestedDuration = 60;
  if (lower.includes("demo")) suggestedDuration = 45;

  let meetingType = "one_on_one";
  if (lower.includes("standup") || lower.includes("stand-up")) meetingType = "standup";
  if (lower.includes("interview")) meetingType = "interview";
  if (lower.includes("demo")) meetingType = "demo";
  if (lower.includes("lunch") || lower.includes("coffee") || lower.includes("social"))
    meetingType = "social";

  return { hasIntent, confidence, detectedKeywords, suggestedDuration, meetingType };
}

function generateTimeSlots(
  duration: number,
  startHour: number,
  endHour: number,
): { start: string; end: string; confidence: number }[] {
  const slots: { start: string; end: string; confidence: number }[] = [];
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(0, 0, 0, 0);

  for (let day = 0; day < 5; day++) {
    const current = new Date(startDate);
    current.setDate(current.getDate() + day);

    if (current.getDay() === 0 || current.getDay() === 6) continue;

    for (let hour = startHour; hour + duration / 60 <= endHour; hour++) {
      const slotStart = new Date(current);
      slotStart.setHours(hour, 0, 0, 0);

      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + duration);

      const dayFactor = 1 - day * 0.1;
      const timeFactor = hour >= 9 && hour <= 11 ? 1 : hour >= 14 && hour <= 16 ? 0.9 : 0.7;
      const confidence = Math.round(dayFactor * timeFactor * 100) / 100;

      slots.push({
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        confidence,
      });
    }
  }

  slots.sort((a, b) => b.confidence - a.confidence);
  return slots.slice(0, 5);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

const schedulingIntelligenceRouter = new Hono();

// ---------------------------------------------------------------------------
// POST /detect — Detect scheduling intent in email
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.post(
  "/detect",
  requireScope("messages:write"),
  validateBody(DetectBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof DetectBodySchema>>(c);
    const result = detectSchedulingIntent(body.content);

    return c.json({
      success: true,
      data: {
        emailId: body.emailId,
        participants: body.participants,
        ...result,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// POST /propose — Generate meeting proposal
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.post(
  "/propose",
  requireScope("messages:write"),
  validateBody(ProposeBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof ProposeBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const patterns = await db
      .select()
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.accountId, accountId));

    const startHour = patterns.length > 0 ? (patterns[0]?.preferredStartHour ?? 9) : 9;
    const endHour = patterns.length > 0 ? (patterns[0]?.preferredEndHour ?? 17) : 17;

    const proposedTimes = generateTimeSlots(body.duration, startHour, endHour);

    // Classification used to be dead twice over (issue #75d):
    // `detectSchedulingIntent("")` was called with an EMPTY STRING and its
    // result thrown away into `_intent`, and `meetingType` came from a ternary
    // whose two branches were both "one_on_one". So the classifier — which
    // recognises standups, interviews, demos and social meetings from the
    // text — never saw any text, and every proposal was filed as a one-to-one
    // regardless of what the email said.
    //
    // The email it references is what the classifier is for, so read it.
    // `emailId` is required by the schema, and the lookup is scoped to the
    // caller's account so a proposal cannot be built from someone else's mail.
    const [sourceEmail] = await db
      .select({ subject: emails.subject, textBody: emails.textBody })
      .from(emails)
      .where(and(eq(emails.id, body.emailId), eq(emails.accountId, accountId)))
      .limit(1);

    const intent = detectSchedulingIntent(
      `${sourceEmail?.subject ?? ""} ${sourceEmail?.textBody ?? ""}`,
    );

    // Participant count is a real signal the text cannot override: three people
    // in a room is a group meeting whatever the subject line calls it.
    const meetingType: MeetingType =
      body.participants.length > 2 && intent.meetingType === "one_on_one"
        ? "group"
        : toMeetingType(intent.meetingType);

    const id = generateId();
    const [proposal] = await db
      .insert(meetingProposals)
      .values({
        id,
        accountId,
        emailId: body.emailId,
        threadId: body.threadId,
        proposedTimes,
        participants: body.participants,
        // The real subject when we have it — "Meeting with 3 participant(s)"
        // told the user nothing they did not already know.
        subject:
          sourceEmail?.subject ??
          `Meeting with ${body.participants.length} participant(s)`,
        duration: body.duration,
        meetingType,
        status: "proposed",
        aiReasoning: `Proposed ${body.duration}-minute meeting based on email thread context and ${patterns.length} availability pattern(s).`,
      })
      .returning();

    return c.json({ success: true, data: proposal }, 201);
  },
);

// ---------------------------------------------------------------------------
// GET /proposals — List proposals (cursor pagination)
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.get(
  "/proposals",
  requireScope("messages:read"),
  validateQuery(ListProposalsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ListProposalsQuerySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const conditions = [eq(meetingProposals.accountId, accountId)];

    if (query.status) {
      conditions.push(eq(meetingProposals.status, query.status));
    }
    if (query.threadId) {
      conditions.push(eq(meetingProposals.threadId, query.threadId));
    }
    if (query.cursor) {
      conditions.push(lt(meetingProposals.createdAt, new Date(query.cursor)));
    }

    const rows = await db
      .select()
      .from(meetingProposals)
      .where(and(...conditions))
      .orderBy(desc(meetingProposals.createdAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1]?.createdAt.toISOString()
        : null;

    return c.json({
      success: true,
      data: page,
      cursor: nextCursor,
      hasMore,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /proposals/:id — Get specific proposal
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.get(
  "/proposals/:id",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("auth").accountId;
    const db = getDatabase();
    const id = c.req.param("id");

    const [proposal] = await db
      .select()
      .from(meetingProposals)
      .where(
        and(
          eq(meetingProposals.id, id),
          eq(meetingProposals.accountId, accountId),
        ),
      )
      .limit(1);

    if (!proposal) {
      return c.json({ success: false, error: "Proposal not found" }, 404);
    }

    return c.json({ success: true, data: proposal });
  },
);

// ---------------------------------------------------------------------------
// PUT /proposals/:id — Accept/decline proposal
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.put(
  "/proposals/:id",
  requireScope("messages:write"),
  validateBody(UpdateProposalBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof UpdateProposalBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();
    const id = c.req.param("id");

    const [existing] = await db
      .select()
      .from(meetingProposals)
      .where(
        and(
          eq(meetingProposals.id, id),
          eq(meetingProposals.accountId, accountId),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json({ success: false, error: "Proposal not found" }, 404);
    }

    const [updated] = await db
      .update(meetingProposals)
      .set({
        status: body.status,
        selectedTime: body.selectedTime ?? null,
        updatedAt: new Date(),
      })
      .where(eq(meetingProposals.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  },
);

// ---------------------------------------------------------------------------
// GET /patterns — Get availability patterns
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.get(
  "/patterns",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const patterns = await db
      .select()
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.accountId, accountId))
      .orderBy(availabilityPatterns.dayOfWeek);

    return c.json({ success: true, data: patterns });
  },
);

// ---------------------------------------------------------------------------
// PUT /patterns — Update preferences
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.put(
  "/patterns",
  requireScope("messages:write"),
  validateBody(UpdatePatternsBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof UpdatePatternsBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(availabilityPatterns)
      .where(
        and(
          eq(availabilityPatterns.accountId, accountId),
          eq(availabilityPatterns.dayOfWeek, body.dayOfWeek),
        ),
      )
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(availabilityPatterns)
        .set({
          preferredStartHour: body.preferredStartHour,
          preferredEndHour: body.preferredEndHour,
          meetingPreferences: (body.meetingPreferences ?? existing.meetingPreferences) as unknown as MeetingPreferences,
          updatedAt: new Date(),
        })
        .where(eq(availabilityPatterns.id, existing.id))
        .returning();

      return c.json({ success: true, data: updated });
    }

    const id = generateId();
    const [created] = await db
      .insert(availabilityPatterns)
      .values({
        id,
        accountId,
        dayOfWeek: body.dayOfWeek,
        preferredStartHour: body.preferredStartHour,
        preferredEndHour: body.preferredEndHour,
        meetingPreferences: (body.meetingPreferences ?? {}) as unknown as MeetingPreferences,
      })
      .returning();

    return c.json({ success: true, data: created }, 201);
  },
);

// ---------------------------------------------------------------------------
// POST /patterns/learn — Learn from calendar data
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.post(
  "/patterns/learn",
  requireScope("messages:write"),
  validateBody(LearnPatternsBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof LearnPatternsBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const dayBuckets =
      new Map<number, { start: string; end: string; recurring: boolean }[]>();

    for (const event of body.calendarEvents) {
      const day = new Date(event.start).getDay();
      if (!dayBuckets.has(day)) dayBuckets.set(day, []);
      dayBuckets.get(day)?.push(event);
    }

    const results: Record<string, unknown>[] = [];

    for (const [day, events] of dayBuckets) {
      const hours = events.map((e) => new Date(e.start).getHours());
      const minHour = Math.min(...hours);
      const maxHour = Math.max(...hours) + 1;

      const busyBlocks = events.map((e) => ({
        start: e.start,
        end: e.end,
        recurring: e.recurring,
      }));

      const [existing] = await db
        .select()
        .from(availabilityPatterns)
        .where(
          and(
            eq(availabilityPatterns.accountId, accountId),
            eq(availabilityPatterns.dayOfWeek, day),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await db
          .update(availabilityPatterns)
          .set({
            busyBlocks,
            confidence: Math.min(1, existing.confidence + 0.1),
            lastUpdatedFromCalendar: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(availabilityPatterns.id, existing.id))
          .returning();

        results.push(updated as Record<string, unknown>);
      } else {
        const id = generateId();
        const [created] = await db
          .insert(availabilityPatterns)
          .values({
            id,
            accountId,
            dayOfWeek: day,
            preferredStartHour: Math.max(8, minHour),
            preferredEndHour: Math.min(18, maxHour),
            busyBlocks,
            confidence: 0.3,
            lastUpdatedFromCalendar: new Date(),
          })
          .returning();

        results.push(created as Record<string, unknown>);
      }
    }

    return c.json({
      success: true,
      data: {
        patternsUpdated: results.length,
        eventsProcessed: body.calendarEvents.length,
        patterns: results,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /suggest-times — Suggest available times
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.get(
  "/suggest-times",
  requireScope("messages:read"),
  validateQuery(SuggestTimesQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof SuggestTimesQuerySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const patterns = await db
      .select()
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.accountId, accountId))
      .orderBy(availabilityPatterns.dayOfWeek);

    const startHour = patterns.length > 0 ? (patterns[0]?.preferredStartHour ?? 9) : 9;
    const endHour = patterns.length > 0 ? (patterns[0]?.preferredEndHour ?? 17) : 17;

    const participantList = query.participants.split(",").map((p) => p.trim());
    const slots = generateTimeSlots(query.duration, startHour, endHour);

    return c.json({
      success: true,
      data: {
        duration: query.duration,
        participants: participantList,
        dateRange: query.dateRange,
        suggestedTimes: slots,
        patternsUsed: patterns.length,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /conflicts — Detect scheduling conflicts
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.get(
  "/conflicts",
  requireScope("messages:read"),
  validateQuery(ConflictsQuerySchema),
  async (c) => {
    const query = getValidatedQuery<z.infer<typeof ConflictsQuerySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const startDate = query.date ? new Date(query.date) : new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + query.range);

    const proposals = await db
      .select()
      .from(meetingProposals)
      .where(
        and(
          eq(meetingProposals.accountId, accountId),
          eq(meetingProposals.status, "accepted"),
          // Only rows the conflict loop below can actually use.
          isNotNull(meetingProposals.selectedTime),
        ),
      );

    // Restrict to the window ASKED FOR, by when the meeting is.
    //
    // The query used to filter `createdAt >= startDate` — when the proposal was
    // created, not when the meeting happens — so asking "what clashes next
    // week" missed any meeting scheduled for next week but agreed a month ago,
    // which is precisely the meeting most likely to clash. And `endDate`,
    // computed from `range` right above, was never used at all: the range
    // parameter did nothing.
    //
    // Filtered here rather than in SQL because `selected_time` is a TEXT
    // column, so a SQL range comparison would be lexicographic and only
    // correct if every stored value happened to share one ISO format. Parsing
    // in JS is correct for any ISO variant; the set is bounded by account and
    // accepted status.
    const windowStart = startDate.getTime();
    const windowEnd = endDate.getTime();
    const inWindow = proposals
      .filter((p) => {
        if (!p.selectedTime) return false;
        const start = new Date(p.selectedTime).getTime();
        if (Number.isNaN(start)) return false;
        const end = start + p.duration * 60 * 1000;
        // Overlaps the window rather than starting inside it — a meeting that
        // began before the window and runs into it still conflicts.
        return end >= windowStart && start <= windowEnd;
      })
      .sort(
        (a, b) =>
          new Date(a.selectedTime ?? 0).getTime() -
          new Date(b.selectedTime ?? 0).getTime(),
      );

    const conflicts: {
      proposalA: string;
      proposalB: string;
      overlapStart: string;
      overlapEnd: string;
    }[] = [];

    for (let i = 0; i < inWindow.length; i++) {
      for (let j = i + 1; j < inWindow.length; j++) {
        const a = inWindow[i];
        const b = inWindow[j];
        if (!a || !b) continue;

        if (a.selectedTime && b.selectedTime) {
          const aStart = new Date(a.selectedTime).getTime();
          const aEnd = aStart + a.duration * 60 * 1000;
          const bStart = new Date(b.selectedTime).getTime();
          const bEnd = bStart + b.duration * 60 * 1000;

          if (aStart < bEnd && bStart < aEnd) {
            conflicts.push({
              proposalA: a.id,
              proposalB: b.id,
              overlapStart: new Date(Math.max(aStart, bStart)).toISOString(),
              overlapEnd: new Date(Math.min(aEnd, bEnd)).toISOString(),
            });
          }
        }
      }
    }

    return c.json({
      success: true,
      data: {
        range: { start: startDate.toISOString(), end: endDate.toISOString() },
        totalAccepted: proposals.length,
        conflicts,
        hasConflicts: conflicts.length > 0,
      },
    });
  },
);

// ---------------------------------------------------------------------------
// GET /stats — Scheduling stats
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.get(
  "/stats",
  requireScope("messages:read"),
  async (c) => {
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const allProposals = await db
      .select()
      .from(meetingProposals)
      .where(eq(meetingProposals.accountId, accountId));

    const total = allProposals.length;
    const accepted = allProposals.filter((p) => p.status === "accepted").length;
    const declined = allProposals.filter((p) => p.status === "declined").length;
    const proposed = allProposals.filter((p) => p.status === "proposed").length;
    const expired = allProposals.filter((p) => p.status === "expired").length;

    const avgDuration =
      total > 0
        ? Math.round(allProposals.reduce((sum, p) => sum + p.duration, 0) / total)
        : 0;

    const acceptRate = total > 0 ? Math.round((accepted / total) * 100) : 0;

    const patterns = await db
      .select()
      .from(availabilityPatterns)
      .where(eq(availabilityPatterns.accountId, accountId));

    const avgConfidence =
      patterns.length > 0
        ? Math.round(
            (patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length) * 100,
          ) / 100
        : 0;

    return c.json({
      success: true,
      data: {
        proposals: { total, proposed, accepted, declined, expired },
        avgDuration,
        acceptRate,
        patterns: {
          total: patterns.length,
          avgConfidence,
        },
      },
    });
  },
);

// ---------------------------------------------------------------------------
// POST /auto-respond — Generate scheduling response
// ---------------------------------------------------------------------------

schedulingIntelligenceRouter.post(
  "/auto-respond",
  requireScope("messages:write"),
  validateBody(AutoRespondBodySchema),
  async (c) => {
    const body = getValidatedBody<z.infer<typeof AutoRespondBodySchema>>(c);
    const accountId = c.get("auth").accountId;
    const db = getDatabase();

    const [proposal] = await db
      .select()
      .from(meetingProposals)
      .where(
        and(
          eq(meetingProposals.id, body.proposalId),
          eq(meetingProposals.accountId, accountId),
        ),
      )
      .limit(1);

    if (!proposal) {
      return c.json({ success: false, error: "Proposal not found" }, 404);
    }

    let responseText = "Action processed.";
    let newStatus: "accepted" | "declined" | "proposed" = "proposed";

    switch (body.action) {
      case "accept": {
        const bestSlot = proposal.proposedTimes[0];
        const selectedTime = bestSlot ? bestSlot.start : null;
        responseText = selectedTime
          ? `I'd be happy to meet. Let's go with ${new Date(selectedTime).toLocaleString()}. Looking forward to it!`
          : "I'd be happy to meet. Could you suggest a few times that work for you?";
        newStatus = "accepted";

        await db
          .update(meetingProposals)
          .set({ status: "accepted", selectedTime, updatedAt: new Date() })
          .where(eq(meetingProposals.id, proposal.id));
        break;
      }
      case "decline": {
        responseText =
          "Unfortunately, I won't be able to make this meeting. Could we revisit scheduling at a later time?";
        newStatus = "declined";

        await db
          .update(meetingProposals)
          .set({ status: "declined", updatedAt: new Date() })
          .where(eq(meetingProposals.id, proposal.id));
        break;
      }
      case "suggest_alternative": {
        const patterns = await db
          .select()
          .from(availabilityPatterns)
          .where(eq(availabilityPatterns.accountId, accountId))
          .limit(1);

        const startHour = patterns.length > 0 ? (patterns[0]?.preferredStartHour ?? 9) : 9;
        const endHour = patterns.length > 0 ? (patterns[0]?.preferredEndHour ?? 17) : 17;
        const alternatives = generateTimeSlots(proposal.duration, startHour, endHour);

        const altText = alternatives
          .slice(0, 3)
          .map((s) => new Date(s.start).toLocaleString())
          .join(", ");

        responseText = `The proposed time doesn't work for me, but I'm available at these times: ${altText}. Would any of these work?`;
        newStatus = "proposed";
        break;
      }
    }

    return c.json({
      success: true,
      data: {
        proposalId: proposal.id,
        action: body.action,
        status: newStatus,
        responseText,
      },
    });
  },
);

export { schedulingIntelligenceRouter };
