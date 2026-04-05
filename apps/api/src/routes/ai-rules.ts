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
 * POST /v1/rules/:id/test          — Test rule against recent emails
 */

import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import { validateBody, getValidatedBody } from "../middleware/validator.js";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"] ?? process.env["CLAUDE_API_KEY"];

// ─── Types ───────────────────────────────────────────────────────────────────

interface EmailRule {
  id: string;
  accountId: string;
  name: string;
  /** The original natural language description */
  description: string;
  /** Conditions that must match */
  conditions: RuleCondition[];
  /** Match mode: all conditions must match, or any */
  matchMode: "all" | "any";
  /** Actions to take when matched */
  actions: RuleAction[];
  /** Is this rule active? */
  enabled: boolean;
  /** How many emails this rule has matched */
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

interface RuleCondition {
  field: "from" | "to" | "cc" | "subject" | "body" | "has_attachment" | "size" | "label" | "is_newsletter" | "is_transactional";
  operator: "contains" | "not_contains" | "equals" | "starts_with" | "ends_with" | "matches_regex" | "greater_than" | "less_than" | "is_true" | "is_false";
  value: string;
}

interface RuleAction {
  type: "label" | "move" | "archive" | "star" | "mark_read" | "mark_important" | "delete" | "forward" | "snooze" | "auto_reply" | "categorize";
  value?: string;
}

// In-memory store (production: DB table)
const ruleStore = new Map<string, EmailRule[]>();

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

// ─── AI Rule Generator ───────────────────────────────────────────────────────

async function generateRuleFromText(text: string): Promise<{ conditions: RuleCondition[]; actions: RuleAction[]; name: string } | null> {
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

    const data = (await response.json()) as { content: Array<{ type: string; text?: string }> };
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

    const rule: EmailRule = {
      id: generateId(),
      accountId: auth.accountId,
      name: generated.name,
      description: input.instruction,
      conditions: generated.conditions as RuleCondition[],
      matchMode: "all",
      actions: generated.actions as RuleAction[],
      enabled: true,
      matchCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existing = ruleStore.get(auth.accountId) ?? [];
    ruleStore.set(auth.accountId, [...existing, rule]);

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
  (c) => {
    const auth = c.get("auth");
    const rules = ruleStore.get(auth.accountId) ?? [];
    return c.json({ data: rules });
  },
);

// POST /v1/rules — Create rule manually
aiRules.post(
  "/",
  requireScope("rules:write"),
  validateBody(CreateRuleSchema),
  (c) => {
    const input = getValidatedBody<z.infer<typeof CreateRuleSchema>>(c);
    const auth = c.get("auth");

    const rule: EmailRule = {
      id: generateId(),
      accountId: auth.accountId,
      name: input.name,
      description: input.description,
      conditions: input.conditions as RuleCondition[],
      matchMode: input.matchMode,
      actions: input.actions as RuleAction[],
      enabled: input.enabled,
      matchCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existing = ruleStore.get(auth.accountId) ?? [];
    ruleStore.set(auth.accountId, [...existing, rule]);

    return c.json({ data: rule }, 201);
  },
);

// PATCH /v1/rules/:id — Update rule
aiRules.patch(
  "/:id",
  requireScope("rules:write"),
  validateBody(UpdateRuleSchema),
  (c) => {
    const id = c.req.param("id");
    const input = getValidatedBody<z.infer<typeof UpdateRuleSchema>>(c);
    const auth = c.get("auth");

    const rules = ruleStore.get(auth.accountId) ?? [];
    const rule = rules.find((r) => r.id === id);

    if (!rule) {
      return c.json({ error: { message: "Rule not found" } }, 404);
    }

    if (input.name !== undefined) rule.name = input.name;
    if (input.enabled !== undefined) rule.enabled = input.enabled;
    if (input.conditions) rule.conditions = input.conditions as RuleCondition[];
    if (input.actions) rule.actions = input.actions as RuleAction[];
    rule.updatedAt = new Date().toISOString();

    return c.json({ data: rule });
  },
);

// DELETE /v1/rules/:id — Delete rule
aiRules.delete(
  "/:id",
  requireScope("rules:write"),
  (c) => {
    const id = c.req.param("id");
    const auth = c.get("auth");

    const rules = ruleStore.get(auth.accountId) ?? [];
    const filtered = rules.filter((r) => r.id !== id);

    if (filtered.length === rules.length) {
      return c.json({ error: { message: "Rule not found" } }, 404);
    }

    ruleStore.set(auth.accountId, filtered);
    return c.json({ data: { deleted: true, id } });
  },
);

export { aiRules };
