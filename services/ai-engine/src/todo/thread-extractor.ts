/**
 * Thread Action Item Extractor (S8)
 *
 * Analyzes an entire email thread and extracts structured action items:
 *   - Task title (imperative verb phrase)
 *   - Description / context
 *   - Due date (if mentioned)
 *   - Assignee (who is expected to do it)
 *   - Priority (low/normal/high/urgent)
 *   - Confidence score (0.0–1.0)
 *   - Source email ID within the thread
 *
 * Uses Claude Haiku for cost-effective extraction with a structured prompt.
 * Falls back to simple subject-based extraction if AI is unavailable.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { TodoPriority } from "./provider.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ThreadEmail {
  readonly emailId: string;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  readonly receivedAt?: Date;
}

export interface ThreadForExtraction {
  readonly threadId: string;
  readonly emails: readonly ThreadEmail[];
}

export interface ExtractedTask {
  readonly title: string;
  readonly description: string;
  readonly dueDate: string | null;
  readonly assignee: string | null;
  readonly priority: TodoPriority;
  readonly confidence: number;
  readonly sourceEmailId: string;
}

export interface ThreadExtractionResult {
  readonly threadId: string;
  readonly tasks: readonly ExtractedTask[];
  readonly extractedAt: string;
  readonly model: string;
}

// ─── AI client singleton ────────────────────────────────────────────────────

let cachedClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (cachedClient !== null) return cachedClient;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) return null;
  cachedClient = new Anthropic({ apiKey });
  return cachedClient;
}

// ─── Response parsing types ─────────────────────────────────────────────────

interface RawExtractedTask {
  title?: unknown;
  description?: unknown;
  due_date?: unknown;
  assignee?: unknown;
  priority?: unknown;
  confidence?: unknown;
  source_email_id?: unknown;
}

interface RawExtractionResponse {
  tasks?: unknown[];
}

// ─── Core extraction ────────────────────────────────────────────────────────

/**
 * Extract action items from an email thread using Claude.
 * Returns structured tasks with confidence scores.
 */
export async function extractThreadActionItems(
  thread: ThreadForExtraction,
): Promise<ThreadExtractionResult> {
  const fallbackResult: ThreadExtractionResult = {
    threadId: thread.threadId,
    tasks: buildFallbackTasks(thread),
    extractedAt: new Date().toISOString(),
    model: "fallback",
  };

  if (thread.emails.length === 0) {
    return { ...fallbackResult, tasks: [] };
  }

  const client = getAnthropicClient();
  if (client === null) return fallbackResult;

  const threadText = formatThreadForPrompt(thread);
  const emailIds = thread.emails.map((e) => e.emailId);

  const prompt = `You are an action item extractor for an email client. Analyze this email thread and extract ALL concrete, actionable tasks mentioned or implied.

For each action item, provide:
- title: One-line imperative task description (max 100 chars). Start with a verb.
- description: 1-3 sentences of context explaining the task and what was discussed.
- due_date: ISO 8601 date string if a deadline is mentioned or implied, otherwise null.
- assignee: Name or email of the person expected to do it, or null if unclear.
- priority: "low" | "normal" | "high" | "urgent" based on language urgency and deadlines.
- confidence: 0.0 to 1.0 — how confident you are this is a real action item (not just a discussion point).
- source_email_id: The email ID where this action item was most clearly stated.

Available email IDs in this thread: ${JSON.stringify(emailIds)}

Rules:
- Only extract tasks that have a clear owner or clear next step.
- Do NOT extract vague discussion points.
- Do NOT extract things already marked as done/completed in the thread.
- If someone says "I'll do X", the assignee is that person.
- If someone says "Can you do X?", the assignee is the recipient.
- Confidence >= 0.8 means explicit action item. 0.5-0.8 means implied. < 0.5 means speculative.

Reply with STRICT JSON only — no markdown, no prose:
{
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "due_date": "2024-03-15T00:00:00Z" or null,
      "assignee": "..." or null,
      "priority": "normal",
      "confidence": 0.85,
      "source_email_id": "..."
    }
  ]
}

If there are no action items, return: { "tasks": [] }

EMAIL THREAD:
${threadText}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block === undefined || block.type !== "text") return fallbackResult;

    const text = block.text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match === null) return fallbackResult;

    const parsed = JSON.parse(match[0]) as RawExtractionResponse;
    if (!Array.isArray(parsed.tasks)) return fallbackResult;

    const validTasks = parsed.tasks
      .map((raw) => parseRawTask(raw as RawExtractedTask, emailIds))
      .filter((t): t is ExtractedTask => t !== null);

    return {
      threadId: thread.threadId,
      tasks: validTasks,
      extractedAt: new Date().toISOString(),
      model: "claude-haiku-4-5",
    };
  } catch {
    return fallbackResult;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatThreadForPrompt(thread: ThreadForExtraction): string {
  return thread.emails
    .map((email) => {
      const date = email.receivedAt?.toISOString() ?? "unknown";
      const bodyTruncated = email.body.slice(0, 3000);
      return `--- Email ID: ${email.emailId} ---
From: ${email.from}
Subject: ${email.subject}
Date: ${date}

${bodyTruncated}`;
    })
    .join("\n\n");
}

function parseRawTask(
  raw: RawExtractedTask,
  validEmailIds: readonly string[],
): ExtractedTask | null {
  const title = typeof raw.title === "string" && raw.title.length > 0
    ? raw.title.slice(0, 200)
    : null;
  if (title === null) return null;

  const description = typeof raw.description === "string"
    ? raw.description.slice(0, 2000)
    : "";

  const dueDate = parseDueDate(raw.due_date);
  const assignee = typeof raw.assignee === "string" && raw.assignee.length > 0
    ? raw.assignee
    : null;
  const priority = normalizePriority(raw.priority);
  const confidence = normalizeConfidence(raw.confidence);

  // Validate the email ID references an actual email in the thread
  const sourceEmailId = typeof raw.source_email_id === "string" &&
    validEmailIds.includes(raw.source_email_id)
    ? raw.source_email_id
    : validEmailIds[validEmailIds.length - 1] ?? "";

  return {
    title,
    description,
    dueDate,
    assignee,
    priority,
    confidence,
    sourceEmailId,
  };
}

function parseDueDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function normalizePriority(value: unknown): TodoPriority {
  if (
    value === "low" ||
    value === "normal" ||
    value === "high" ||
    value === "urgent"
  ) {
    return value;
  }
  return "normal";
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return Math.max(0, Math.min(1, value));
  }
  return 0.5;
}

/**
 * Fallback extraction when Claude is unavailable.
 * Creates a single task from the most recent email's subject.
 */
function buildFallbackTasks(
  thread: ThreadForExtraction,
): readonly ExtractedTask[] {
  const lastEmail = thread.emails[thread.emails.length - 1];
  if (lastEmail === undefined) return [];

  return [
    {
      title: lastEmail.subject.length > 0
        ? `Follow up: ${lastEmail.subject.slice(0, 80)}`
        : "Follow up on email thread",
      description: `From: ${lastEmail.from}\n\n${lastEmail.body.slice(0, 500)}`,
      dueDate: null,
      assignee: null,
      priority: "normal",
      confidence: 0.3,
      sourceEmailId: lastEmail.emailId,
    },
  ];
}
