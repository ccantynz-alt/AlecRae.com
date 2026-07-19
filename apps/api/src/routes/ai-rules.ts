/**
 * AI Rules Route — Natural Language Email Filtering
 *
 * "Start filtering marketing emails to a separate folder"
 * → AI creates the rule automatically
 *
 * POST /v1/rules/create-from-text  — Create rule from natural language
 * GET  /v1/rules                   — List all rules
 * POST /v1/rules                   — Create rule manually
 * PATCH /v1/rules/:id              — Update rule
 * DELETE /v1/rules/:id             — Delete rule
 * Rules are persisted in the `email_rules` table (Drizzle) so they survive
 * API restarts, and are applied to newly-synced/imported mail by
 * lib/rule-engine.ts (called from lib/received-email-store.ts).
 */

import { Hono } from "hono";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";
import {
  getDatabase,
  emailRules,
  type EmailRule,
  type EmailRuleCondition,
  type EmailRuleAction,
} from "@alecrae/db";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize a DB rule row into the API response shape (ISO timestamps).
 * Exported for unit tests.
 */
export function serializeRule(row: EmailRule): {
  id: string;
  accountId: string;
  name: string;
  description: string;
  conditions: EmailRuleCondition[];
  matchMode: "all" | "any";
  actions: EmailRuleAction[];
  enabled: boolean;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    accountId: row.accountId,
    name: row.name,
    description: row.description,
    conditions: row.conditions,
    matchMode: row.matchMode,
    actions: row.actions,
    enabled: row.enabled,
    matchCount: row.matchCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── AI Rule Generator ───────────────────────────────────────────────────────

async function generateRuleFromText(text: string): Promise<{ conditions: EmailRuleCondition[]; actions: EmailRuleAction[]; name: string } | null> {
  if (!ANTHROPIC_API_KEY) return null;

  const prompt = `Convert this email filtering instruction into structured rules. Return ONLY valid JSON.

Instruction: "${text}"

Return JSON:
{
  "name": "Short rule name",
  "conditions": [
    { "field": "from|to|cc|subject|body|has_attachment|size|is_newsletter|is_transactional", "operator": "contains|not_contains|equals|starts_with|ends_with|is_true|is_false", "value": "match value" }
  ],
  "actions": [
    { "type": "label|move|archive|star|mark_read|mark_important|delete|forward|snooze|categorize", "value": "optional value" }
  ]
}

Available fields: from, to, cc, subject, body, has_attachment, size, is_newsletter, is_transactional
Available actions: label (value=label name), move (value=folder), archive, star, mark_read, mark_important, delete, forward (value=email), snooze (value=duration), categorize (value=category name)

Return ONLY the JSON object.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { content: { type: string; text?: string }[] };
    const output = data.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const CreateFromTextSchema = z.object({
  instruction: z.string().min(5).max(500),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().default(""),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })),
  matchMode: z.enum(["all", "any"]).default("all"),
  actions: z.array(z.object({
    type: z.string(),
    value: z.string().optional(),
  })),
  enabled: z.boolean().default(true),
});

const UpdateRuleSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  conditions: z.array(z.object({
    field: z.string(),
    operator: z.string(),
    value: z.string(),
  })).optional(),
  actions: z.array(z.object({
    type: z.string(),
    value: z.string().optional(),
  })).optional(),
});

// ─── Routes ──────────────────────────────────────────────────────────────────

const aiRules = new Hono();

// POST /v1/rules/create-from-text — AI generates rule from description
aiRules.post(
  "/create-from-text",
  requireScope("rules:write"),
  validateBody(CreateFromTextSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateFromTextSchema>>(c);
    const auth = c.get("auth");

    const generated = await generateRuleFromText(input.instruction);

    if (!generated) {
      return c.json({
        error: { message: "Could not generate rule from instruction. Try being more specific.", code: "generation_failed" },
      }, 400);
    }

    const db = getDatabase();
    const now = new Date();
    const row: EmailRule = {
      id: generateId(),
      accountId: auth.accountId,
      name: generated.name,
      description: input.instruction,
      conditions: generated.conditions,
      matchMode: "all",
      actions: generated.actions,
      enabled: true,
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(emailRules).values(row);

    const rule = serializeRule(row);

    return c.json({
      data: {
        rule,
        message: `Rule "${rule.name}" created from: "${input.instruction}"`,
        preview: `When ${rule.conditions.map((c) => `${c.field} ${c.operator} "${c.value}"`).join(" AND ")}, then ${rule.actions.map((a) => a.type + (a.value ? ` "${a.value}"` : "")).join(", ")}`,
      },
    }, 201);
  },
);

// GET /v1/rules — List all rules
aiRules.get(
  "/",
  requireScope("rules:read"),
  async (c) => {
    const auth = c.get("auth");
    const db = getDatabase();

    const rows = await db
      .select()
      .from(emailRules)
      .where(eq(emailRules.accountId, auth.accountId))
      .orderBy(desc(emailRules.createdAt));

    return c.json({ data: rows.map(serializeRule) });
  },
);

// POST /v1/rules — Create rule manually
aiRules.post(
  "/",
  requireScope("rules:write"),
  validateBody(CreateRuleSchema),
  async (c) => {
    const input = getValidatedBody<z.infer<typeof CreateRuleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const now = new Date();
    const row: EmailRule = {
      id: generateId(),
      accountId: auth.accountId,
      name: input.name,
      description: input.description,
      conditions: input.conditions as EmailRuleCondition[],
      matchMode: input.matchMode,
      actions: input.actions as EmailRuleAction[],
      enabled: input.enabled,
      matchCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await db.insert(emailRules).values(row);

    return c.json({ data: serializeRule(row) }, 201);
  },
);

// PATCH /v1/rules/:id — Update rule
aiRules.patch(
  "/:id",
  requireScope("rules:write"),
  validateBody(UpdateRuleSchema),
  async (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateRuleSchema>>(c);
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select()
      .from(emailRules)
      .where(and(eq(emailRules.id, id), eq(emailRules.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { message: "Rule not found" } }, 404);
    }

    const now = new Date();

    await db
      .update(emailRules)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.conditions !== undefined
          ? { conditions: input.conditions as EmailRuleCondition[] }
          : {}),
        ...(input.actions !== undefined
          ? { actions: input.actions as EmailRuleAction[] }
          : {}),
        updatedAt: now,
      })
      .where(and(eq(emailRules.id, id), eq(emailRules.accountId, auth.accountId)));

    const updated: EmailRule = {
      ...existing,
      name: input.name ?? existing.name,
      enabled: input.enabled ?? existing.enabled,
      conditions: (input.conditions as EmailRuleCondition[] | undefined) ?? existing.conditions,
      actions: (input.actions as EmailRuleAction[] | undefined) ?? existing.actions,
      updatedAt: now,
    };

    return c.json({ data: serializeRule(updated) });
  },
);

// DELETE /v1/rules/:id — Delete rule
aiRules.delete(
  "/:id",
  requireScope("rules:write"),
  async (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");
    const db = getDatabase();

    const [existing] = await db
      .select({ id: emailRules.id })
      .from(emailRules)
      .where(and(eq(emailRules.id, id), eq(emailRules.accountId, auth.accountId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: { message: "Rule not found" } }, 404);
    }

    await db
      .delete(emailRules)
      .where(and(eq(emailRules.id, id), eq(emailRules.accountId, auth.accountId)));

    return c.json({ data: { deleted: true, id } });
  },
);

export { aiRules };
