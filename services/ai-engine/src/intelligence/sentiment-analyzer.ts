/**
 * Sentiment Analyzer — analyzes the emotional tone of an email
 *
 * Uses Claude Haiku for fast, cost-efficient sentiment classification.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailSentiment {
  sentiment:
    | "very_positive"
    | "positive"
    | "neutral"
    | "negative"
    | "very_negative";
  score: number; // -1.0 to 1.0
  emotions: string[]; // max 3
  requiresUrgentResponse: boolean;
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
      "ANTHROPIC_API_KEY is not set — sentiment analysis is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── JSON parsing helpers ─────────────────────────────────────────────────────

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

const SENTIMENTS = [
  "very_positive",
  "positive",
  "neutral",
  "negative",
  "very_negative",
] as const;

function parseResponse(text: string): EmailSentiment {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Claude response did not contain a JSON object");
  }
  const parsed: unknown = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Parsed Claude response was not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const rawSentiment = obj["sentiment"];
  const sentiment: EmailSentiment["sentiment"] = SENTIMENTS.includes(
    rawSentiment as (typeof SENTIMENTS)[number],
  )
    ? (rawSentiment as EmailSentiment["sentiment"])
    : "neutral";

  const rawScore = typeof obj["score"] === "number" ? obj["score"] : 0;
  const score = Math.max(-1.0, Math.min(1.0, rawScore));

  const rawEmotions = obj["emotions"];
  const emotions = isStringArray(rawEmotions)
    ? rawEmotions.slice(0, 3)
    : [];

  const requiresUrgentResponse =
    typeof obj["requiresUrgentResponse"] === "boolean"
      ? obj["requiresUrgentResponse"]
      : false;

  return { sentiment, score, emotions, requiresUrgentResponse };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Analyze the sentiment of an email using Claude Haiku.
 *
 * @param email  Subject and body of the email to analyze.
 * @returns      EmailSentiment with label, score, emotions, and urgency flag.
 */
export async function analyzeEmailSentiment(email: {
  subject: string;
  body: string;
}): Promise<EmailSentiment> {
  const prompt = [
    `Subject: ${email.subject}`,
    "",
    "Email body:",
    email.body.slice(0, 4000),
    "",
    "Analyze the sentiment and emotional tone of this email.",
    "Return JSON only — no prose:",
    "{",
    '  "sentiment": "very_positive"|"positive"|"neutral"|"negative"|"very_negative",',
    '  "score": <number from -1.0 (very negative) to 1.0 (very positive)>,',
    '  "emotions": ["<emotion 1>", "<emotion 2>", "<emotion 3>"],',
    '  "requiresUrgentResponse": <true|false>',
    "}",
    "",
    "Notes:",
    "- emotions: list up to 3 specific emotions detected (e.g., 'frustrated', 'grateful', 'anxious')",
    "- requiresUrgentResponse: true if the email contains anger, urgency, or escalation signals",
  ].join("\n");

  const response = await getClient().messages.create({
    model: HAIKU,
    max_tokens: 512,
    system:
      "You are an email sentiment classifier. Always reply with a single valid JSON object and nothing else.",
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("Claude returned an empty response");

  try {
    return parseResponse(text);
  } catch {
    return {
      sentiment: "neutral",
      score: 0,
      emotions: [],
      requiresUrgentResponse: false,
    };
  }
}
