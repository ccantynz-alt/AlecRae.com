/**
 * Priority Scorer — scores an email's urgency and required action
 *
 * Uses Claude Haiku for fast, cost-efficient classification.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriorityScore {
  score: number; // 0-100
  urgencyLevel: "critical" | "high" | "medium" | "low";
  reasons: string[];
  suggestedAction:
    | "reply_now"
    | "reply_today"
    | "reply_when_free"
    | "no_reply_needed";
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
      "ANTHROPIC_API_KEY is not set — priority scoring is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── JSON parsing helpers ─────────────────────────────────────────────────────

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

const URGENCY_LEVELS = ["critical", "high", "medium", "low"] as const;
const SUGGESTED_ACTIONS = [
  "reply_now",
  "reply_today",
  "reply_when_free",
  "no_reply_needed",
] as const;

function parseResponse(text: string): PriorityScore {
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

  const rawScore = typeof obj["score"] === "number" ? obj["score"] : 50;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  const rawUrgency = obj["urgencyLevel"];
  const urgencyLevel: PriorityScore["urgencyLevel"] = URGENCY_LEVELS.includes(
    rawUrgency as (typeof URGENCY_LEVELS)[number],
  )
    ? (rawUrgency as PriorityScore["urgencyLevel"])
    : score >= 90
      ? "critical"
      : score >= 70
        ? "high"
        : score >= 40
          ? "medium"
          : "low";

  const reasons = isStringArray(obj["reasons"]) ? obj["reasons"] : [];

  const rawAction = obj["suggestedAction"];
  const suggestedAction: PriorityScore["suggestedAction"] =
    SUGGESTED_ACTIONS.includes(
      rawAction as (typeof SUGGESTED_ACTIONS)[number],
    )
      ? (rawAction as PriorityScore["suggestedAction"])
      : "reply_when_free";

  return { score, urgencyLevel, reasons, suggestedAction };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Score the priority of an email using Claude Haiku.
 *
 * @param email  Email fields required for analysis.
 * @returns      A PriorityScore with 0-100 score, urgency level, reasons, and action.
 */
export async function scoreEmailPriority(email: {
  subject: string;
  from: string;
  body: string;
}): Promise<PriorityScore> {
  const prompt = [
    `Subject: ${email.subject}`,
    `From: ${email.from}`,
    "",
    "Email body:",
    email.body.slice(0, 4000),
    "",
    "Score this email's priority 0-100 based on urgency, sender importance, and required action.",
    "Return JSON only — no prose:",
    "{",
    '  "score": <number 0-100>,',
    '  "urgencyLevel": "critical"|"high"|"medium"|"low",',
    '  "reasons": ["<reason 1>", "..."],',
    '  "suggestedAction": "reply_now"|"reply_today"|"reply_when_free"|"no_reply_needed"',
    "}",
    "",
    "Rules: score>=90=critical, >=70=high, >=40=medium, else low.",
  ].join("\n");

  const response = await getClient().messages.create({
    model: HAIKU,
    max_tokens: 512,
    system:
      "You are an email priority classifier. Always reply with a single valid JSON object and nothing else.",
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("Claude returned an empty response");

  try {
    return parseResponse(text);
  } catch {
    // Fallback: return a default score on parse failure
    return {
      score: 50,
      urgencyLevel: "medium",
      reasons: ["Unable to parse AI response"],
      suggestedAction: "reply_when_free",
    };
  }
}
