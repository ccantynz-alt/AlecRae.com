/**
 * Email Categorizer
 *
 * Uses Claude Haiku to classify an email into primary and secondary categories,
 * with confidence score and auto-suggested labels.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmailCategoryResult {
  primary: string; // e.g. "newsletter", "transactional", "personal", "work", "promotion"
  secondary: string[];
  confidence: number; // 0-1
  isNewsletter: boolean;
  isTransactional: boolean;
  labels: string[]; // auto-suggested labels
}

// ─── Configuration ────────────────────────────────────────────────────────────

const HAIKU = "claude-haiku-4-5";

const VALID_PRIMARY_CATEGORIES = new Set([
  "newsletter",
  "transactional",
  "personal",
  "work",
  "promotion",
  "social",
  "update",
  "alert",
]);

// ─── Singleton Anthropic client ───────────────────────────────────────────────

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — email categorization is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── JSON parsing helpers ─────────────────────────────────────────────────────

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function parseResponse(text: string): EmailCategoryResult {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Claude response did not contain a JSON object");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error("Failed to parse Claude JSON response for categorization");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Parsed Claude response was not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const rawPrimary = typeof obj["primary"] === "string" ? obj["primary"].toLowerCase().trim() : "work";
  const primary = VALID_PRIMARY_CATEGORIES.has(rawPrimary) ? rawPrimary : "work";

  const rawSecondary = obj["secondary"];
  const secondary = isStringArray(rawSecondary)
    ? rawSecondary.map((s) => s.toLowerCase().trim()).filter((s) => s.length > 0).slice(0, 3)
    : [];

  const rawConfidence = typeof obj["confidence"] === "number" ? obj["confidence"] : 0.8;
  const confidence = Math.max(0, Math.min(1, rawConfidence));

  const isNewsletter =
    typeof obj["isNewsletter"] === "boolean" ? obj["isNewsletter"] : primary === "newsletter";
  const isTransactional =
    typeof obj["isTransactional"] === "boolean"
      ? obj["isTransactional"]
      : primary === "transactional";

  const rawLabels = obj["labels"];
  const labels = isStringArray(rawLabels)
    ? rawLabels.map((l) => l.trim()).filter((l) => l.length > 0).slice(0, 5)
    : [];

  return { primary, secondary, confidence, isNewsletter, isTransactional, labels };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Categorize an email using Claude Haiku.
 *
 * @param email  Subject, sender, and body of the email.
 * @returns      EmailCategoryResult with primary category, secondary categories,
 *               confidence, flags, and auto-suggested labels.
 */
export async function categorizeEmail(email: {
  subject: string;
  from: string;
  body: string;
}): Promise<EmailCategoryResult> {
  const prompt = [
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    "",
    "Email body (first 3000 chars):",
    email.body.slice(0, 3000),
    "",
    "Classify this email. Return JSON only — no prose:",
    "{",
    '  "primary": "<one of: newsletter|transactional|personal|work|promotion|social|update|alert>",',
    '  "secondary": ["<optional secondary category>"],',
    '  "confidence": <0.0-1.0>,',
    '  "isNewsletter": <true|false>,',
    '  "isTransactional": <true|false>,',
    '  "labels": ["<auto-suggested label 1>", "..."]',
    "}",
    "",
    "Primary categories:",
    "- newsletter: marketing/informational bulk email",
    "- transactional: receipts, confirmations, notifications",
    "- personal: from an individual, informal/personal tone",
    "- work: professional business email",
    "- promotion: sales, discount, offer",
    "- social: social network notifications",
    "- update: product/service/status updates",
    "- alert: security, system, or important notifications",
  ].join("\n");

  const response = await getClient().messages.create({
    model: HAIKU,
    max_tokens: 512,
    system:
      "You are an email classifier. Always reply with a single valid JSON object and nothing else.",
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("Claude returned an empty response");

  try {
    return parseResponse(text);
  } catch {
    // Fallback: return a safe default on parse failure
    return {
      primary: "work",
      secondary: [],
      confidence: 0.5,
      isNewsletter: false,
      isTransactional: false,
      labels: [],
    };
  }
}
