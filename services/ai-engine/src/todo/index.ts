/**
 * Todo App Integrations (S8) — public entry point.
 *
 * Exports the provider abstraction, all six provider implementations,
 * the in-memory connected-account store, an AI extraction helper for
 * turning emails into action items, and a factory that builds a provider
 * instance from stored credentials.
 */

import Anthropic from "@anthropic-ai/sdk";

import {
  PROVIDER_METADATA,
  type TodoCredentials,
  type TodoPriority,
  type TodoProvider,
  type TodoProviderMetadata,
  type TodoProviderName,
  type TodoTaskInput,
} from "./provider.js";
import { Things3Provider } from "./providers/things3.js";
import { AppleRemindersProvider } from "./providers/apple-reminders.js";
import { TodoistProvider } from "./providers/todoist.js";
import { LinearProvider } from "./providers/linear.js";
import { NotionProvider } from "./providers/notion.js";
import { MicrosoftTodoProvider } from "./providers/microsoft-todo.js";

export * from "./provider.js";
export {
  Things3Provider,
  AppleRemindersProvider,
  TodoistProvider,
  LinearProvider,
  NotionProvider,
  MicrosoftTodoProvider,
};
export {
  extractThreadActionItems,
  type ThreadEmail,
  type ThreadForExtraction,
  type ExtractedTask,
  type ThreadExtractionResult,
} from "./thread-extractor.js";

// ─── Connected accounts store ─────────────────────────────────────────────

export interface ConnectedTodoApp {
  provider: TodoProviderName;
  credentials: TodoCredentials;
  isDefault: boolean;
  connectedAt: Date;
}

const connectedAccounts = new Map<string, ConnectedTodoApp[]>();

export function listConnectedTodoApps(accountId: string): readonly ConnectedTodoApp[] {
  return connectedAccounts.get(accountId) ?? [];
}

export function connectTodoApp(accountId: string, app: Omit<ConnectedTodoApp, "connectedAt">): ConnectedTodoApp {
  const existing = [...(connectedAccounts.get(accountId) ?? [])];
  const filtered = existing.filter((e) => e.provider !== app.provider);
  if (app.isDefault) {
    for (const e of filtered) e.isDefault = false;
  }
  const record: ConnectedTodoApp = { ...app, connectedAt: new Date() };
  filtered.push(record);
  if (!filtered.some((e) => e.isDefault)) {
    const first = filtered[0];
    if (first !== undefined) first.isDefault = true;
  }
  connectedAccounts.set(accountId, filtered);
  return record;
}

export function disconnectTodoApp(accountId: string, provider: TodoProviderName): boolean {
  const existing = connectedAccounts.get(accountId);
  if (existing === undefined) return false;
  const filtered = existing.filter((e) => e.provider !== provider);
  if (filtered.length === existing.length) return false;
  connectedAccounts.set(accountId, filtered);
  return true;
}

export function getConnectedTodoApp(
  accountId: string,
  provider: TodoProviderName,
): ConnectedTodoApp | undefined {
  return (connectedAccounts.get(accountId) ?? []).find((e) => e.provider === provider);
}

export function listProviders(): readonly TodoProviderMetadata[] {
  return PROVIDER_METADATA;
}

// ─── Provider factory ─────────────────────────────────────────────────────

export function buildProvider(connection: ConnectedTodoApp): TodoProvider {
  switch (connection.provider) {
    case "things3":
      return new Things3Provider();
    case "apple_reminders":
      return new AppleRemindersProvider();
    case "todoist": {
      if (connection.credentials.kind !== "api_key") {
        throw new Error("todoist_requires_api_key_credentials");
      }
      return new TodoistProvider(connection.credentials.token);
    }
    case "linear": {
      if (connection.credentials.kind !== "api_key") {
        throw new Error("linear_requires_api_key_credentials");
      }
      // teamId is encoded into the token field as "<apiKey>::<teamId>"
      const [apiKey, teamId] = connection.credentials.token.split("::");
      if (apiKey === undefined || teamId === undefined) {
        throw new Error("linear_token_must_be_apiKey::teamId");
      }
      return new LinearProvider(apiKey, teamId);
    }
    case "notion": {
      if (connection.credentials.kind !== "notion") {
        throw new Error("notion_requires_notion_credentials");
      }
      return new NotionProvider(connection.credentials.accessToken, connection.credentials.databaseId);
    }
    case "microsoft_todo": {
      if (connection.credentials.kind !== "microsoft") {
        throw new Error("microsoft_todo_requires_microsoft_credentials");
      }
      return new MicrosoftTodoProvider(
        connection.credentials.accessToken,
        connection.credentials.listId,
      );
    }
  }
}

// ─── AI extraction (Claude Haiku) ─────────────────────────────────────────

export interface ExtractedActionItem {
  title: string;
  notes: string;
  dueDate?: Date;
  priority: TodoPriority;
}

export interface EmailForExtraction {
  emailId: string;
  subject: string;
  from: string;
  body: string;
  receivedAt?: Date;
}

let cachedAnthropic: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (cachedAnthropic !== null) return cachedAnthropic;
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) return null;
  cachedAnthropic = new Anthropic({ apiKey });
  return cachedAnthropic;
}

interface HaikuExtraction {
  title?: unknown;
  notes?: unknown;
  due_date?: unknown;
  priority?: unknown;
}

export async function extractActionItem(
  email: EmailForExtraction,
): Promise<ExtractedActionItem> {
  const fallback: ExtractedActionItem = {
    title: email.subject.length > 0 ? email.subject : "Follow up on email",
    notes: `From: ${email.from}\n\n${email.body.slice(0, 500)}`,
    priority: "normal",
  };

  const client = getAnthropic();
  if (client === null) return fallback;

  const prompt = `Extract a single actionable to-do item from this email. Reply with strict JSON only, no prose:
{
  "title": "<one line, imperative, max 80 chars>",
  "notes": "<2-4 sentence context>",
  "due_date": "<ISO 8601 datetime or null>",
  "priority": "low" | "normal" | "high" | "urgent"
}

EMAIL:
From: ${email.from}
Subject: ${email.subject}
Date: ${(email.receivedAt ?? new Date()).toISOString()}

${email.body.slice(0, 4000)}`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
    const block = response.content[0];
    if (block === undefined || block.type !== "text") return fallback;
    const text = block.text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (match === null) return fallback;
    const parsed = JSON.parse(match[0]) as HaikuExtraction;

    const title = typeof parsed.title === "string" && parsed.title.length > 0 ? parsed.title : fallback.title;
    const notes = typeof parsed.notes === "string" && parsed.notes.length > 0 ? parsed.notes : fallback.notes;
    const priority = normalizePriority(parsed.priority);
    const result: ExtractedActionItem = { title, notes, priority };
    if (typeof parsed.due_date === "string") {
      const d = new Date(parsed.due_date);
      if (!Number.isNaN(d.getTime())) result.dueDate = d;
    }
    return result;
  } catch {
    return fallback;
  }
}

function normalizePriority(value: unknown): TodoPriority {
  if (value === "low" || value === "normal" || value === "high" || value === "urgent") {
    return value;
  }
  return "normal";
}

/** Helper: turn an extracted action item into a TodoTaskInput. */
export function actionItemToTaskInput(
  item: ExtractedActionItem,
  source: { emailId?: string; emailLink?: string },
): TodoTaskInput {
  const input: TodoTaskInput = {
    title: item.title,
    notes: item.notes,
    priority: item.priority,
    ...(item.dueDate !== undefined ? { dueDate: item.dueDate } : {}),
    ...(source.emailId !== undefined ? { sourceEmailId: source.emailId } : {}),
    ...(source.emailLink !== undefined ? { sourceEmailLink: source.emailLink } : {}),
  };
  return input;
}
