/**
 * Smart Replies — generates 3 contextual reply options for an email
 *
 * Uses Claude Haiku for fast, cost-efficient generation.
 * Returns one professional reply, one friendly reply, and one brief reply.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SmartReply {
  text: string;
  tone: "professional" | "friendly" | "brief";
}

// ─── Configuration ───────────────────────────────────────────────────────────

const HAIKU = "claude-haiku-4-5";

// ─── Singleton Anthropic client ──────────────────────────────────────────────

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — smart reply generation is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── JSON parsing helpers ─────────────────────────────────────────────────────

const TONES = ["professional", "friendly", "brief"] as const;

function parseResponse(text: string): SmartReply[] {
  const jsonStart = text.indexOf("[");
  const jsonEnd = text.lastIndexOf("]");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Claude response did not contain a JSON array");
  }
  const parsed: unknown = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  if (!Array.isArray(parsed)) {
    throw new Error("Parsed Claude response was not an array");
  }

  const replies: SmartReply[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    const replyText = typeof obj["text"] === "string" ? obj["text"].trim() : "";
    const rawTone = obj["tone"];
    const tone: SmartReply["tone"] = TONES.includes(
      rawTone as (typeof TONES)[number],
    )
      ? (rawTone as SmartReply["tone"])
      : "professional";
    if (replyText) {
      replies.push({ text: replyText, tone });
    }
  }

  return replies;
}

// ─── Default fallback replies ─────────────────────────────────────────────────

function defaultReplies(): SmartReply[] {
  return [
    {
      text: "Thanks for reaching out. I'll review this and get back to you shortly.",
      tone: "professional",
    },
    { text: "Got it, thanks! I'll take a look.", tone: "friendly" },
    { text: "Received. Will follow up soon.", tone: "brief" },
  ];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate exactly 3 smart reply options for an email using Claude Haiku.
 * Returns one professional, one friendly, and one brief reply.
 *
 * @param email  Email fields required for context.
 * @returns      An array of exactly 3 SmartReply objects.
 */
export async function generateSmartReplies(email: {
  subject: string;
  from: string;
  body: string;
}): Promise<SmartReply[]> {
  const prompt = [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    "",
    "Email body:",
    email.body.slice(0, 4000),
    "",
    "Generate exactly 3 smart reply options for this email.",
    "One professional, one friendly, one brief (under 15 words).",
    "Return a JSON array only — no prose:",
    "[",
    '  {"text": "<professional reply>", "tone": "professional"},',
    '  {"text": "<friendly reply>", "tone": "friendly"},',
    '  {"text": "<brief reply under 15 words>", "tone": "brief"}',
    "]",
  ].join("\n");

  const response = await getClient().messages.create({
    model: HAIKU,
    max_tokens: 1024,
    system:
      "You are an email reply assistant. Always reply with a single valid JSON array and nothing else.",
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) return defaultReplies();

  try {
    const replies = parseResponse(text);
    return replies.length >= 1 ? replies.slice(0, 3) : defaultReplies();
  } catch {
    return defaultReplies();
  }
}
