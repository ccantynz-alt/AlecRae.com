/**
 * "Why is this in my inbox?" Explainer
 *
 * Given an email + sender history + account context, returns a structured
 * explanation: who the sender is, the relationship, why it landed here,
 * concrete suggested actions, and an urgency level.
 *
 * Uses Claude Sonnet for stronger reasoning than the newsletter path.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExplainEmailInput {
  email: {
    from: string;
    subject: string;
    body: string;
    date: Date;
  };
  senderHistory: {
    totalEmails: number;
    lastContacted: Date | null;
    isKnown: boolean;
  };
  accountContext: {
    inboxCategories: string[];
  };
}

export type UrgencyLevel = "low" | "medium" | "high" | "urgent";

export interface SuggestedAction {
  action: string;
  reasoning: string;
}

export interface EmailExplanation {
  senderSummary: string;
  relationshipContext: string;
  whyItsHere: string;
  suggestedActions: SuggestedAction[];
  urgencyLevel: UrgencyLevel;
}

// ─── Configuration ───────────────────────────────────────────────────────────

const SONNET_MODEL = "claude-sonnet-4-6";
const MAX_BODY_CHARS = 8_000;

// ─── Singleton Anthropic client ──────────────────────────────────────────────

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — email explanations are unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── Prompt building ─────────────────────────────────────────────────────────

function describeTimeOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "late night";
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

function describeRecency(date: Date | null): string {
  if (!date) return "never previously contacted";
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

function buildPrompt(input: ExplainEmailInput): string {
  const { email, senderHistory, accountContext } = input;
  const truncatedBody = email.body.length > MAX_BODY_CHARS
    ? `${email.body.slice(0, MAX_BODY_CHARS)}\n[...truncated ${email.body.length - MAX_BODY_CHARS} chars]`
    : email.body;

  return [
    "You are AlecRae's inbox explainer. Given an email and context about the",
    "recipient's inbox, explain who the sender is, the relationship, why this",
    "email is in the inbox, and what the user should do about it. Consider the",
    "email content, sender history, time of day, and the user's existing inbox",
    "categories. Be specific, concise, and practical.",
    "",
    "Return JSON with this exact shape and NOTHING else:",
    "{",
    '  "senderSummary": "1-2 sentences describing who the sender appears to be",',
    '  "relationshipContext": "1-2 sentences on the relationship with the recipient",',
    '  "whyItsHere": "1-2 sentences explaining why this email landed in the inbox",',
    '  "suggestedActions": [',
    '    { "action": "short imperative action", "reasoning": "why" }',
    "  ],",
    '  "urgencyLevel": "low" | "medium" | "high" | "urgent"',
    "}",
    "",
    "Provide 2-4 suggested actions. Pick urgencyLevel based on time-sensitivity",
    'in the body (deadlines, "asap", payment due, etc.), not on sender hype.',
    "",
    "--- Email ---",
    `From: ${email.from}`,
    `Subject: ${email.subject}`,
    `Received: ${email.date.toISOString()} (${describeTimeOfDay(email.date)})`,
    "Body:",
    truncatedBody,
    "--- End Email ---",
    "",
    "--- Sender history ---",
    `Total prior emails from this sender: ${senderHistory.totalEmails}`,
    `Last contacted: ${describeRecency(senderHistory.lastContacted)}`,
    `Is a known/approved sender: ${senderHistory.isKnown ? "yes" : "no"}`,
    "--- End sender history ---",
    "",
    "--- Account context ---",
    `Recipient's inbox categories: ${
      accountContext.inboxCategories.length > 0
        ? accountContext.inboxCategories.join(", ")
        : "(none configured)"
    }`,
    "--- End account context ---",
  ].join("\n");
}

// ─── JSON parsing ────────────────────────────────────────────────────────────

const URGENCY_VALUES: readonly UrgencyLevel[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

function isUrgency(value: unknown): value is UrgencyLevel {
  return typeof value === "string" && (URGENCY_VALUES as readonly string[]).includes(value);
}

function parseExplanation(text: string): EmailExplanation {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error("Claude response did not contain a JSON object");
  }
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Parsed Claude response was not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const senderSummary =
    typeof obj["senderSummary"] === "string" ? obj["senderSummary"] : "";
  const relationshipContext =
    typeof obj["relationshipContext"] === "string"
      ? obj["relationshipContext"]
      : "";
  const whyItsHere =
    typeof obj["whyItsHere"] === "string" ? obj["whyItsHere"] : "";
  const urgencyLevel: UrgencyLevel = isUrgency(obj["urgencyLevel"])
    ? obj["urgencyLevel"]
    : "low";

  const rawActions = obj["suggestedActions"];
  const suggestedActions: SuggestedAction[] = Array.isArray(rawActions)
    ? rawActions
        .map((item): SuggestedAction | null => {
          if (typeof item !== "object" || item === null) return null;
          const rec = item as Record<string, unknown>;
          const action =
            typeof rec["action"] === "string" ? rec["action"].trim() : "";
          const reasoning =
            typeof rec["reasoning"] === "string" ? rec["reasoning"].trim() : "";
          if (!action) return null;
          return { action, reasoning };
        })
        .filter((a): a is SuggestedAction => a !== null)
    : [];

  return {
    senderSummary: senderSummary.trim(),
    relationshipContext: relationshipContext.trim(),
    whyItsHere: whyItsHere.trim(),
    suggestedActions,
    urgencyLevel,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function explainEmail(
  input: ExplainEmailInput,
): Promise<EmailExplanation> {
  const client = getClient();
  const prompt = buildPrompt(input);

  const message = await client.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    temperature: 0.3,
    system:
      "You are a precise inbox explainer. Always respond with one valid JSON " +
      "object matching the requested schema and no surrounding prose.",
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude returned an empty response");

  return parseExplanation(text);
}
