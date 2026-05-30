/**
 * Context Extractor
 *
 * Uses Claude Sonnet to extract action items, deadlines, and promises
 * from email thread content. Sonnet is used here because this is a complex
 * extraction task requiring nuanced reasoning about commitments and obligations.
 */

import Anthropic from "@anthropic-ai/sdk";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActionItem {
  description: string;
  assignedTo?: string;
  dueDate?: string; // ISO date if mentioned
  priority: "urgent" | "high" | "medium" | "low";
}

export interface Deadline {
  description: string;
  dueDate: string; // ISO date
  isUrgent: boolean;
}

export interface Promise_ {
  description: string;
  direction: "made" | "received";
  dueDate?: string;
}

export interface ExtractedContext {
  actionItems: ActionItem[];
  deadlines: Deadline[];
  promises: Promise_[];
  hasPendingItems: boolean;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const SONNET = "claude-sonnet-4-6";

const VALID_PRIORITIES = ["urgent", "high", "medium", "low"] as const;

// ─── Singleton Anthropic client ───────────────────────────────────────────────

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — context extraction is unavailable",
    );
  }
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── JSON parsing helpers ─────────────────────────────────────────────────────

function parseActionItem(item: unknown): ActionItem | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;

  const description = typeof obj["description"] === "string" ? obj["description"].trim() : "";
  if (!description) return null;

  const assignedTo =
    typeof obj["assignedTo"] === "string" && obj["assignedTo"].trim()
      ? obj["assignedTo"].trim()
      : undefined;

  const dueDate =
    typeof obj["dueDate"] === "string" && obj["dueDate"].trim()
      ? obj["dueDate"].trim()
      : undefined;

  const rawPriority = obj["priority"];
  const priority: ActionItem["priority"] = VALID_PRIORITIES.includes(
    rawPriority as (typeof VALID_PRIORITIES)[number],
  )
    ? (rawPriority as ActionItem["priority"])
    : "medium";

  return { description, ...(assignedTo ? { assignedTo } : {}), ...(dueDate ? { dueDate } : {}), priority };
}

function parseDeadline(item: unknown): Deadline | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;

  const description = typeof obj["description"] === "string" ? obj["description"].trim() : "";
  const dueDate = typeof obj["dueDate"] === "string" ? obj["dueDate"].trim() : "";
  if (!description || !dueDate) return null;

  const isUrgent = typeof obj["isUrgent"] === "boolean" ? obj["isUrgent"] : false;

  return { description, dueDate, isUrgent };
}

function parsePromise(item: unknown): Promise_ | null {
  if (typeof item !== "object" || item === null) return null;
  const obj = item as Record<string, unknown>;

  const description = typeof obj["description"] === "string" ? obj["description"].trim() : "";
  if (!description) return null;

  const direction: Promise_["direction"] =
    obj["direction"] === "received" ? "received" : "made";

  const dueDate =
    typeof obj["dueDate"] === "string" && obj["dueDate"].trim()
      ? obj["dueDate"].trim()
      : undefined;

  return { description, direction, ...(dueDate ? { dueDate } : {}) };
}

function parseResponse(text: string): ExtractedContext {
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error("Claude response did not contain a JSON object");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error("Failed to parse Claude JSON response for context extraction");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Parsed Claude response was not an object");
  }
  const obj = parsed as Record<string, unknown>;

  const rawActionItems = Array.isArray(obj["actionItems"]) ? obj["actionItems"] : [];
  const actionItems = rawActionItems
    .map(parseActionItem)
    .filter((item): item is ActionItem => item !== null);

  const rawDeadlines = Array.isArray(obj["deadlines"]) ? obj["deadlines"] : [];
  const deadlines = rawDeadlines
    .map(parseDeadline)
    .filter((item): item is Deadline => item !== null);

  const rawPromises = Array.isArray(obj["promises"]) ? obj["promises"] : [];
  const promises = rawPromises
    .map(parsePromise)
    .filter((item): item is Promise_ => item !== null);

  const hasPendingItems =
    typeof obj["hasPendingItems"] === "boolean"
      ? obj["hasPendingItems"]
      : actionItems.length > 0 || deadlines.length > 0 || promises.length > 0;

  return { actionItems, deadlines, promises, hasPendingItems };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Extract action items, deadlines, and promises from email content using Claude Sonnet.
 *
 * @param params  Email content and optional participant list.
 * @returns       ExtractedContext with arrays of action items, deadlines, and promises.
 */
export async function extractEmailContext(params: {
  content: string;
  participants?: string[];
}): Promise<ExtractedContext> {
  const participantsLine =
    params.participants && params.participants.length > 0
      ? `Participants: ${params.participants.join(", ")}\n\n`
      : "";

  const todayDate = new Date().toISOString().split("T")[0];

  const prompt = [
    participantsLine + "Email thread content:",
    params.content.slice(0, 8000),
    "",
    `Today's date: ${todayDate ?? "unknown"}`,
    "",
    "Extract all action items, deadlines, and promises from this email thread.",
    "Be specific — quote or closely paraphrase the relevant text in descriptions.",
    "For dates, use ISO format (YYYY-MM-DD). If a date is relative (e.g. 'next Friday'), calculate it from today.",
    "Return JSON only — no prose:",
    "{",
    '  "actionItems": [',
    '    {',
    '      "description": "<specific action required>",',
    '      "assignedTo": "<person name or email, if identifiable>",',
    '      "dueDate": "<ISO date or null>",',
    '      "priority": "urgent"|"high"|"medium"|"low"',
    '    }',
    '  ],',
    '  "deadlines": [',
    '    {',
    '      "description": "<what is due>",',
    '      "dueDate": "<ISO date — required>",',
    '      "isUrgent": <true|false>',
    '    }',
    '  ],',
    '  "promises": [',
    '    {',
    '      "description": "<promise made or received>",',
    '      "direction": "made"|"received",',
    '      "dueDate": "<ISO date or null>"',
    '    }',
    '  ],',
    '  "hasPendingItems": <true|false>',
    "}",
  ].join("\n");

  const response = await getClient().messages.create({
    model: SONNET,
    max_tokens: 2048,
    system:
      "You are an expert at extracting commitments, tasks, and deadlines from email conversations. " +
      "Always reply with a single valid JSON object and nothing else. " +
      "Only include items that are clearly stated or strongly implied in the text.",
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  if (!text) throw new Error("Claude returned an empty response");

  try {
    return parseResponse(text);
  } catch {
    // Fallback: return empty context on parse failure
    return {
      actionItems: [],
      deadlines: [],
      promises: [],
      hasPendingItems: false,
    };
  }
}
