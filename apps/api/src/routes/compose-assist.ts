/**
 * Compose-Assist Route — AI Calendar Slot Suggestions in Compose (B7)
 *
 * POST /v1/compose-assist/detect-meeting   — Detect meeting intent in draft text
 * POST /v1/compose-assist/suggest-slots    — Suggest calendar slots based on draft + context
 * POST /v1/compose-assist/insert-slots     — Format slots as markdown/text for insertion
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import { detectMeetingIntent } from "@alecrae/ai-engine/calendar/slot-detector";
import {
  suggestSlotsForCompose,
  type SlotSuggestion,
} from "@alecrae/ai-engine/calendar/slot-suggester";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const DetectMeetingSchema = z.object({
  text: z.string().min(1).max(20_000),
});

const AvailabilityWindowSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const SuggestSlotsSchema = z.object({
  recipientEmail: z.string().email(),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  dateRange: z.object({
    from: z.string().datetime(),
    to: z.string().datetime(),
  }),
  senderAvailability: z.array(AvailabilityWindowSchema).min(1),
  preferredTimes: z
    .object({
      hourStart: z.number().int().min(0).max(23),
      hourEnd: z.number().int().min(1).max(24),
    })
    .optional(),
  timezone: z.string().default("UTC"),
});

const InsertSlotsSchema = z.object({
  slots: z
    .array(
      z.object({
        start: z.string().datetime(),
        end: z.string().datetime(),
        formattedRange: z.string(),
        durationMinutes: z.number().int(),
        score: z.number(),
        reasoning: z.string(),
      }),
    )
    .min(1)
    .max(10),
  format: z.enum(["markdown", "text", "html"]).default("markdown"),
  intro: z.string().max(500).optional(),
});

// ─── Formatters ──────────────────────────────────────────────────────────────

function formatSlotsAsMarkdown(
  slots: readonly SlotSuggestion[],
  intro: string,
): string {
  const lines: string[] = [intro, ""];
  for (const slot of slots) {
    lines.push(`- **${slot.formattedRange}** (${slot.durationMinutes} min)`);
  }
  return lines.join("\n");
}

function formatSlotsAsText(
  slots: readonly SlotSuggestion[],
  intro: string,
): string {
  const lines: string[] = [intro, ""];
  for (const slot of slots) {
    lines.push(`• ${slot.formattedRange} (${slot.durationMinutes} min)`);
  }
  return lines.join("\n");
}

function formatSlotsAsHtml(
  slots: readonly SlotSuggestion[],
  intro: string,
): string {
  const items = slots
    .map(
      (slot) =>
        `<li><strong>${escapeHtml(slot.formattedRange)}</strong> (${slot.durationMinutes} min)</li>`,
    )
    .join("");
  return `<p>${escapeHtml(intro)}</p><ul>${items}</ul>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const composeAssist = new Hono();

// POST /v1/compose-assist/detect-meeting
composeAssist.post(
  "/detect-meeting",
  requireScope("messages:read"),
  validateBody(DetectMeetingSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof DetectMeetingSchema>>(c);
    const intent = await detectMeetingIntent(input.text);
    return c.json({
      data: {
        ...intent,
        extractedTimes: intent.extractedTimes.map((t) => ({
          raw: t.raw,
          parsed: t.parsed?.toISOString() ?? null,
        })),
      },
    });
  },
);

// POST /v1/compose-assist/suggest-slots
composeAssist.post(
  "/suggest-slots",
  requireScope("messages:read"),
  validateBody(SuggestSlotsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof SuggestSlotsSchema>>(c);

    const slots = await suggestSlotsForCompose({
      recipientEmail: input.recipientEmail,
      durationMinutes: input.durationMinutes,
      dateRange: {
        from: new Date(input.dateRange.from),
        to: new Date(input.dateRange.to),
      },
      senderAvailability: input.senderAvailability.map((w) => ({
        start: new Date(w.start),
        end: new Date(w.end),
      })),
      ...(input.preferredTimes ? { preferredTimes: input.preferredTimes } : {}),
      timezone: input.timezone,
    });

    return c.json({ data: slots });
  },
);

// POST /v1/compose-assist/insert-slots
composeAssist.post(
  "/insert-slots",
  requireScope("messages:read"),
  validateBody(InsertSlotsSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof InsertSlotsSchema>>(c);
    const intro = input.intro ?? "Here are a few times that work on my end:";

    let content: string;
    switch (input.format) {
      case "text":
        content = formatSlotsAsText(input.slots, intro);
        break;
      case "html":
        content = formatSlotsAsHtml(input.slots, intro);
        break;
      case "markdown":
      default:
        content = formatSlotsAsMarkdown(input.slots, intro);
        break;
    }

    return c.json({
      data: {
        format: input.format,
        content,
        slotCount: input.slots.length,
      },
    });
  },
);

export { composeAssist };
