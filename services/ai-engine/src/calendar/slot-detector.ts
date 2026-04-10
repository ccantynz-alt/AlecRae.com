/**
 * Meeting Intent Detector (B7)
 *
 * Inline detection of meeting/scheduling intent in compose drafts. Uses
 * Claude Haiku for low-latency classification while the user is typing.
 * Falls back to a heuristic regex pass when the API key is unavailable so
 * we never block the compose UX.
 */

import Anthropic from "@anthropic-ai/sdk";

export type MeetingIntentType =
  | "request_meeting"
  | "propose_time"
  | "confirm_time"
  | "reschedule";

export interface ExtractedTime {
  raw: string;
  parsed: Date | null;
}

export interface MeetingIntent {
  hasIntent: boolean;
  type?: MeetingIntentType;
  extractedTimes: ExtractedTime[];
  durationHint?: number;
  locationHint?: string;
  confidence: number;
}

const HAIKU_MODEL = "claude-haiku-4-5";
const MAX_TEXT_CHARS = 4_000;

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── Heuristic fallback ──────────────────────────────────────────────────────

const INTENT_PATTERNS: readonly { re: RegExp; type: MeetingIntentType }[] = [
  { re: /\b(let'?s|shall we|want to|wanna|can we)\s+(meet|chat|sync|catch up|talk|call|hop on)/i, type: "request_meeting" },
  { re: /\b(are you free|do you have time|is .* good for you|works for you|how about)\b/i, type: "propose_time" },
  { re: /\b(confirm(ed|ing)?|that works|sounds good|see you (then|at))\b/i, type: "confirm_time" },
  { re: /\b(reschedul|move|push|postpon|change the time|earlier|later)\b/i, type: "reschedule" },
];

const DURATION_RE = /(\d{1,3})\s*-?\s*(min|minute|hr|hour)s?\b/i;
const LOCATION_RE = /\b(?:at|in|via|on)\s+(zoom|google meet|gmeet|teams|webex|the office|my office|our office|[A-Z][a-zA-Z]+ (?:Cafe|Office|Hotel|Restaurant))\b/;

const TIME_RE =
  /\b(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day)?|tomorrow|today|next\s+(?:week|monday|tuesday|wednesday|thursday|friday)|this\s+(?:week|afternoon|morning|evening))\b(?:\s+(?:at|@)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?)?|\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi;

function heuristicDetect(text: string): MeetingIntent {
  const lower = text.toLowerCase();

  let type: MeetingIntentType | undefined;
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(lower)) {
      type = p.type;
      break;
    }
  }

  const rawTimes: ExtractedTime[] = [];
  const matches = text.match(TIME_RE) ?? [];
  for (const raw of matches) {
    rawTimes.push({ raw, parsed: null });
  }

  let durationHint: number | undefined;
  const durMatch = text.match(DURATION_RE);
  if (durMatch && durMatch[1]) {
    const value = parseInt(durMatch[1], 10);
    const unit = (durMatch[2] ?? "").toLowerCase();
    durationHint = unit.startsWith("h") ? value * 60 : value;
  }

  let locationHint: string | undefined;
  const locMatch = text.match(LOCATION_RE);
  if (locMatch && locMatch[1]) {
    locationHint = locMatch[1];
  }

  const hasIntent = type !== undefined || rawTimes.length > 0;

  return {
    hasIntent,
    ...(type !== undefined ? { type } : {}),
    extractedTimes: rawTimes,
    ...(durationHint !== undefined ? { durationHint } : {}),
    ...(locationHint !== undefined ? { locationHint } : {}),
    confidence: hasIntent ? 0.55 : 0.05,
  };
}

// ─── Claude-powered detector ─────────────────────────────────────────────────

interface ClaudeIntentJson {
  hasIntent?: unknown;
  type?: unknown;
  extractedTimes?: unknown;
  durationMinutes?: unknown;
  location?: unknown;
  confidence?: unknown;
}

const INTENT_TYPES: readonly MeetingIntentType[] = [
  "request_meeting",
  "propose_time",
  "confirm_time",
  "reschedule",
];

function isIntentType(value: unknown): value is MeetingIntentType {
  return typeof value === "string" && (INTENT_TYPES as readonly string[]).includes(value);
}

function parseClaudeJson(text: string): MeetingIntent | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) return null;

  let parsed: ClaudeIntentJson;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as ClaudeIntentJson;
  } catch {
    return null;
  }

  const hasIntent = parsed.hasIntent === true;
  const type = isIntentType(parsed.type) ? parsed.type : undefined;
  const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.5;

  const extractedTimes: ExtractedTime[] = Array.isArray(parsed.extractedTimes)
    ? parsed.extractedTimes
        .map((item): ExtractedTime | null => {
          if (typeof item !== "object" || item === null) return null;
          const rec = item as Record<string, unknown>;
          const raw = typeof rec["raw"] === "string" ? rec["raw"] : null;
          if (!raw) return null;
          const parsedField = rec["parsed"];
          let parsedDate: Date | null = null;
          if (typeof parsedField === "string") {
            const d = new Date(parsedField);
            if (!Number.isNaN(d.getTime())) parsedDate = d;
          }
          return { raw, parsed: parsedDate };
        })
        .filter((t): t is ExtractedTime => t !== null)
    : [];

  const durationHint =
    typeof parsed.durationMinutes === "number" ? parsed.durationMinutes : undefined;
  const locationHint =
    typeof parsed.location === "string" && parsed.location.length > 0
      ? parsed.location
      : undefined;

  return {
    hasIntent,
    ...(type !== undefined ? { type } : {}),
    extractedTimes,
    ...(durationHint !== undefined ? { durationHint } : {}),
    ...(locationHint !== undefined ? { locationHint } : {}),
    confidence,
  };
}

/**
 * Detect meeting intent in a piece of draft text. Uses Claude Haiku when
 * available, falls back to heuristics otherwise.
 */
export async function detectMeetingIntent(text: string): Promise<MeetingIntent> {
  const trimmed = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;

  if (trimmed.trim().length < 4) {
    return { hasIntent: false, extractedTimes: [], confidence: 0 };
  }

  const client = getClient();
  if (!client) {
    return heuristicDetect(trimmed);
  }

  try {
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      temperature: 0,
      system:
        "You detect meeting/scheduling intent in email drafts. Always respond " +
        "with one valid JSON object and nothing else.",
      messages: [
        {
          role: "user",
          content: [
            "Analyse this email draft for meeting/scheduling intent. Return JSON:",
            "{",
            '  "hasIntent": boolean,',
            '  "type": "request_meeting" | "propose_time" | "confirm_time" | "reschedule" | null,',
            '  "extractedTimes": [{ "raw": "next Tuesday 3pm", "parsed": "2026-04-14T15:00:00Z" | null }],',
            '  "durationMinutes": number | null,',
            '  "location": string | null,',
            '  "confidence": number between 0 and 1',
            "}",
            "",
            "Draft:",
            trimmed,
          ].join("\n"),
        },
      ],
    });

    const block = message.content[0];
    if (!block || block.type !== "text") {
      return heuristicDetect(trimmed);
    }

    const parsed = parseClaudeJson(block.text);
    return parsed ?? heuristicDetect(trimmed);
  } catch {
    return heuristicDetect(trimmed);
  }
}
